import type { ComponentProps } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetItemStateAvailability } from "@/components/prepare/reader/itemStateAvailable";
import { ITEM_STATE_READ_CONCURRENCY } from "@/components/track/CompletionMarks";
import { curriculumOf } from "@/lib/catalog/track";
import type { CatalogModule, CatalogOutlineEntry, CatalogTrack } from "@/lib/catalog/types";
import { createPrepClient } from "@/lib/prep/client";
import { createFakePrepApi } from "@/lib/prep/fakeApi";

vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});

import { TrackCurriculum } from "./TrackCurriculum";

const BASE = "https://api.example.test";
const entry = (id: string, over: Partial<CatalogOutlineEntry> = {}): CatalogOutlineEntry => {
   const [type, slug] = id.split(".");
   return { id, type: type as CatalogOutlineEntry["type"], slug, title: `Title ${slug}`, access: "free", primary: true, ...over };
};
const mod = (key: string, items: CatalogOutlineEntry[]): CatalogModule => ({ key, title: `Part ${key}`, position: 0, items });
const track = (modules: CatalogModule[]): CatalogTrack => ({ id: "track.home", slug: "home", title: "Home Track", summary: "", modules });

const TRACK = track([
   mod("basics", [entry("lesson.alpha"), entry("problem.beta"), entry("knowledge.skipped"), entry("lesson.premium", { access: "premium" })]),
   mod("depth", [entry("lesson.gamma"), entry("lesson.delta")]),
]);

type Options = { signedIn?: boolean; continuity?: boolean; track?: CatalogTrack; done?: string[]; fetch?: (api: ReturnType<typeof createFakePrepApi>) => typeof fetch; withItemState?: boolean };

async function setup({ signedIn = true, continuity = true, track: t = TRACK, done = [], fetch: wrap, withItemState = true }: Options = {}) {
   const api = createFakePrepApi({ continuity });
   const token = signedIn ? api.signIn("ada") : null;
   const getAccessToken = async () => token;
   if (token) {
      const seed = createPrepClient({ baseUrl: BASE, getAccessToken, fetch: api.fetch });
      for (const id of done) await seed.updateItemState(id, { version: 0, completed: true });
   }
   api.requests.length = 0;
   const curriculum = curriculumOf(t);
   const view = render(
      <TrackCurriculum
         track={t}
         curriculum={curriculum}
         itemState={withItemState ? { apiUrl: BASE, getAccessToken, fetch: wrap ? wrap(api) : api.fetch } : undefined}
      />
   );
   return { api, view };
}

const calls = (api: ReturnType<typeof createFakePrepApi>) => api.requests.map(({ method, path }) => `${method} ${path}`);
const row = (title: string) => screen.getByRole("link", { name: new RegExp(title) });
const slotOf = (title: string) => row(title).querySelector('[data-slot="entry-leading"]') as HTMLElement;
// React's generated ids differ between renders of the same tree.
const markup = (container: HTMLElement) => container.innerHTML.replace(/_r_\w+_/g, "_r_");
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 20))));

beforeAll(() => {
   Element.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => forgetItemStateAvailability());

describe("completion marks in the leading slot", () => {
   it("marks a completed Lesson", async () => {
      await setup({ done: ["lesson.alpha"] });
      await waitFor(() => expect(slotOf("Title alpha")).toHaveAttribute("data-state", "completed"));
      expect(within(slotOf("Title alpha")).getByText("Completed")).toBeInTheDocument();
      expect(row("Title alpha")).toHaveAccessibleName(/^Completed\s*Title alpha/);
   });

   it("marks a completed Problem", async () => {
      await setup({ done: ["problem.beta"] });
      await waitFor(() => expect(slotOf("Title beta")).toHaveAttribute("data-state", "completed"));
      expect(row("Title beta")).toHaveAccessibleName(/^Completed\s*Title beta/);
   });

   it("shows no mark for an entry with no row or with a row that is not completed", async () => {
      const { api } = await setup({ done: ["lesson.alpha"] });
      const other = createPrepClient({ baseUrl: BASE, getAccessToken: async () => api.signIn("ada"), fetch: api.fetch });
      await other.updateItemState("problem.beta", { version: 0, bookmarked: true });
      await waitFor(() => expect(slotOf("Title alpha")).toHaveAttribute("data-state", "completed"));
      await settle();
      expect(slotOf("Title beta")).not.toHaveAttribute("data-state");
      expect(screen.getAllByText("Completed")).toHaveLength(1);
      expect(document.body.textContent).not.toMatch(/not completed|incomplete|in progress/i);
   });

   it("reads only Lessons and Problems, so a Knowledge entry never triggers an item-state read", async () => {
      const { api } = await setup();
      await waitFor(() => expect(calls(api)).toContain("GET /item-state/problem.beta"));
      await settle();
      expect(calls(api).filter((call) => call.includes("knowledge"))).toEqual([]);
   });
});

describe("when nothing may be read", () => {
   it("makes no request at all for a signed-out reader", async () => {
      const { api } = await setup({ signedIn: false });
      await settle();
      expect(api.requests).toEqual([]);
      expect(document.querySelector('[data-state="completed"]')).toBeNull();
   });

   it("makes no item-state request when M2 is off", async () => {
      const { api } = await setup({ continuity: false });
      await settle();
      expect(calls(api)).toEqual(["GET /features"]);
   });

   it("asks the capability read first, once, before any item-state read", async () => {
      const { api } = await setup();
      await waitFor(() => expect(calls(api).filter((call) => call.startsWith("GET /item-state/"))).toHaveLength(3));
      expect(calls(api)[0]).toBe("GET /features");
      expect(calls(api).filter((call) => call === "GET /features")).toHaveLength(1);
      expect(calls(api).every((call) => call.startsWith("GET "))).toBe(true);
   });

   it("renders the same markup as a build without preparation, signed out or with M2 off", async () => {
      const plain = await setup({ withItemState: false });
      const html = markup(plain.view.container);
      plain.view.unmount();
      for (const options of [{ signedIn: false }, { continuity: false }]) {
         forgetItemStateAvailability();
         const { view } = await setup(options);
         await settle();
         expect(markup(view.container)).toBe(html);
         view.unmount();
      }
   });
});

describe("requests", () => {
   it("keeps at most four reads in flight and still reads every entry", async () => {
      const lessons = Array.from({ length: 10 }, (_, index) => entry(`lesson.l${index}`));
      let active = 0;
      let peak = 0;
      const releases: (() => void)[] = [];
      const { api } = await setup({
         track: track([mod("big", lessons)]),
         fetch: (inner) =>
            (async (input, init) => {
               if (!String(input).includes("/item-state/")) return inner.fetch(input, init);
               active += 1;
               peak = Math.max(peak, active);
               await new Promise<void>((resolve) => releases.push(resolve));
               active -= 1;
               return inner.fetch(input, init);
            }) as typeof fetch,
      });
      await waitFor(() => expect(releases.length).toBe(ITEM_STATE_READ_CONCURRENCY));
      expect(ITEM_STATE_READ_CONCURRENCY).toBe(4);
      await settle();
      expect(releases.length).toBe(4);
      while (calls(api).filter((call) => call.startsWith("GET /item-state/")).length < 10) {
         await act(async () => releases.splice(0).forEach((release) => release()));
         await settle();
      }
      await act(async () => releases.splice(0).forEach((release) => release()));
      expect(peak).toBe(4);
      expect(calls(api).filter((call) => call.startsWith("GET /item-state/"))).toHaveLength(10);
   });

   it("starts no further read once the page is left, though more than four are queued", async () => {
      const lessons = Array.from({ length: 10 }, (_, index) => entry(`lesson.l${index}`));
      const releases: (() => void)[] = [];
      const { api, view } = await setup({
         track: track([mod("big", lessons)]),
         fetch: (inner) =>
            (async (input, init) => {
               if (!String(input).includes("/item-state/")) return inner.fetch(input, init);
               await new Promise<void>((resolve) => releases.push(resolve));
               return inner.fetch(input, init);
            }) as typeof fetch,
      });
      await waitFor(() => expect(releases.length).toBe(ITEM_STATE_READ_CONCURRENCY));
      view.unmount();
      await act(async () => releases.splice(0).forEach((release) => release()));
      await settle();
      expect(releases).toEqual([]);
      expect(calls(api).filter((call) => call.startsWith("GET /item-state/"))).toHaveLength(ITEM_STATE_READ_CONCURRENCY);
   });

   it("waits for a collapsed Module to open before reading its entries, then reads them once", async () => {
      const { api } = await setup({ done: ["lesson.gamma"] });
      await waitFor(() => expect(calls(api)).toContain("GET /item-state/lesson.alpha"));
      await settle();
      expect(calls(api).filter((call) => /gamma|delta/.test(call))).toEqual([]);
      const button = screen.getByRole("button", { name: /Part depth/ });
      fireEvent.click(button);
      await waitFor(() => expect(slotOf("Title gamma")).toHaveAttribute("data-state", "completed"));
      fireEvent.click(button);
      fireEvent.click(button);
      await settle();
      expect(calls(api).filter((call) => call === "GET /item-state/lesson.gamma")).toHaveLength(1);
   });

   it("never asks for a catalog body", async () => {
      const urls: string[] = [];
      await setup({
         fetch: (inner) =>
            ((input, init) => {
               urls.push(String(input));
               return inner.fetch(input, init);
            }) as typeof fetch,
      });
      await settle();
      expect(urls.length).toBeGreaterThan(0);
      expect(urls.every((url) => url.startsWith(`${BASE}/me/prep/`))).toBe(true);
   });
});

describe("a read that fails", () => {
   it("leaves the entry unmarked and says nothing, while the others still show their state", async () => {
      await setup({
         done: ["lesson.alpha", "problem.beta"],
         fetch: (inner) =>
            ((input, init) => (String(input).endsWith("/item-state/problem.beta") ? Promise.reject(new TypeError("offline")) : inner.fetch(input, init))) as typeof fetch,
      });
      await waitFor(() => expect(slotOf("Title alpha")).toHaveAttribute("data-state", "completed"));
      await settle();
      expect(slotOf("Title beta")).not.toHaveAttribute("data-state");
      expect(slotOf("Title beta")).toHaveAttribute("aria-hidden", "true");
      expect(document.body.textContent).not.toMatch(/couldn.?t|error|not completed|incomplete/i);
   });

   it("shows no mark when the capability read itself fails", async () => {
      const { api } = await setup({
         done: ["lesson.alpha"],
         fetch: (inner) => ((input, init) => (String(input).endsWith("/features") ? Promise.reject(new TypeError("offline")) : inner.fetch(input, init))) as typeof fetch,
      });
      await settle();
      expect(calls(api).filter((call) => call.startsWith("GET /item-state/"))).toEqual([]);
      expect(document.querySelector('[data-state="completed"]')).toBeNull();
   });
});

describe("the row", () => {
   it("keeps the slot's box, the link's target and its place in the tab order when it shows a mark", async () => {
      await setup({ done: ["lesson.alpha"] });
      const before = slotOf("Title alpha").className.split(" ").filter((name) => /^(flex|size-8|items-center|justify-center)$/.test(name));
      const href = row("Title alpha").getAttribute("href");
      const siblings = row("Title alpha").children.length;
      await waitFor(() => expect(slotOf("Title alpha")).toHaveAttribute("data-state", "completed"));
      expect(slotOf("Title alpha").className.split(" ").filter((name) => /^(flex|size-8|items-center|justify-center)$/.test(name))).toEqual(before);
      expect(row("Title alpha")).toHaveAttribute("href", href);
      expect(row("Title alpha").children.length).toBe(siblings);
      expect(row("Title alpha")).toHaveAttribute("data-prefetch", "false");
      expect(slotOf("Title alpha").querySelector("a, button, [tabindex]")).toBeNull();
      expect(slotOf("Title alpha").querySelector("svg")).toHaveAttribute("aria-hidden", "true");
   });

   it("keeps a premium entry's label and link, and shows its mark like any other", async () => {
      await setup({ done: ["lesson.premium"] });
      await waitFor(() => expect(slotOf("Title premium")).toHaveAttribute("data-state", "completed"));
      expect(row("Title premium")).toHaveTextContent("Premium");
      expect(row("Title premium")).toHaveAttribute("data-prefetch", "false");
   });

   it("keeps the module buttons operable from the keyboard", async () => {
      await setup();
      const button = screen.getByRole("button", { name: /Part depth/ });
      expect(button).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(button);
      expect(button).toHaveAttribute("aria-expanded", "true");
   });
});
