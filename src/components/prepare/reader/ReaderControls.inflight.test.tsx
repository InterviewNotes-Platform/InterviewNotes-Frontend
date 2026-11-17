import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrepClient } from "@/lib/prep/client";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import { forgetItemStateAvailability } from "./itemStateAvailable";
import { ReaderControls } from "./ReaderControls";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// P8-T51 / CO-1 (P7-T50 §12.3): a Bookmark press made while another item-state save is in flight must reach the server.
const BASE = "https://api.example.test";
const LESSON = "lesson.dynamic-batching";

/** A fake API whose PATCHes wait until released, one at a time, so a save can be held "in flight". */
function setup() {
   const api = createFakePrepApi();
   const token = api.signIn("ada");
   const held: (() => void)[] = [];
   let inFlight = 0;
   let maxInFlight = 0;
   const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== "PATCH") return api.fetch(input, init);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((release) => held.push(release));
      try {
         return await api.fetch(input, init);
      } finally {
         inFlight -= 1;
      }
   }) as typeof fetch;
   const getAccessToken = async () => token;
   const props = { contentId: LESSON, apiUrl: BASE, getAccessToken, fetch: fetchImpl };
   const view = render(<ReaderControls {...props} />);
   const other = createPrepClient({ baseUrl: BASE, getAccessToken, fetch: api.fetch });
   const release = async () => {
      await waitFor(() => expect(held.length).toBeGreaterThan(0));
      await act(async () => held.shift()?.());
   };
   const reload = async () => {
      view.unmount();
      forgetItemStateAvailability();
      render(<ReaderControls {...props} fetch={api.fetch} />);
      await loaded();
   };
   return { api, other, release, reload, held, maxInFlight: () => maxInFlight };
}

const complete = () => screen.getByRole("button", { name: "Mark complete" });
const bookmark = () => screen.getByRole("button", { name: "Bookmark" });
const status = () => within(screen.getByRole("group", { name: /actions$/ })).getByRole("status");
const loaded = () => waitFor(() => expect(complete()).toBeEnabled());
const patches = (api: ReturnType<typeof createFakePrepApi>) => api.requests.filter((r) => r.method === "PATCH").map((r) => r.body);
const press = (button: HTMLElement) => act(async () => void fireEvent.click(button));

beforeEach(() => forgetItemStateAvailability());

describe("a bookmark pressed while another save is in flight (CO-1)", () => {
   it("is sent after the completion save, with the new version, and survives a note save and a reload", async () => {
      const { api, other, release, reload } = setup();
      await loaded();
      await press(complete());
      expect(status()).toHaveTextContent("Saving");
      await press(bookmark());
      expect(bookmark()).toHaveAttribute("aria-busy", "true");
      expect(status()).toHaveTextContent("Saving");

      await release();
      // The completion is acknowledged, the bookmark is still in flight: the status must not claim "Saved" yet.
      await waitFor(() => expect(complete()).toHaveAttribute("aria-pressed", "true"));
      expect(status()).toHaveTextContent("Saving");
      await release();
      await waitFor(() => expect(bookmark()).toHaveAttribute("aria-pressed", "true"));
      expect(status()).toHaveTextContent("Saved");
      expect(patches(api)).toEqual([
         { version: 1, completed: true },
         { version: 2, bookmarked: true },
      ]);

      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
         fireEvent.change(screen.getByLabelText(/Your private note/), { target: { value: "ship it" } });
         await act(async () => void vi.advanceTimersByTime(2000));
      } finally {
         vi.useRealTimers();
      }
      await release();
      await waitFor(() => expect(patches(api).at(-1)).toEqual({ version: 3, note: "ship it" }));

      await reload();
      expect(bookmark()).toHaveAttribute("aria-pressed", "true");
      expect(complete()).toHaveAttribute("aria-pressed", "true");
      expect(await other.getItemState(LESSON)).toMatchObject({ data: { completed_at: expect.any(String), bookmarked_at: expect.any(String), note: "ship it", version: 4 } });
   });

   it("is sent after a note save that is in flight", async () => {
      const { api, release, reload, held } = setup();
      await loaded();
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
         fireEvent.change(screen.getByLabelText(/Your private note/), { target: { value: "draft" } });
         await act(async () => void vi.advanceTimersByTime(2000));
      } finally {
         vi.useRealTimers();
      }
      await waitFor(() => expect(held).toHaveLength(1));
      await press(bookmark());
      await release();
      await release();
      await waitFor(() => expect(bookmark()).toHaveAttribute("aria-pressed", "true"));
      expect(patches(api)).toEqual([
         { version: 1, note: "draft" },
         { version: 2, bookmarked: true },
      ]);
      await reload();
      expect(bookmark()).toHaveAttribute("aria-pressed", "true");
   });

   it("never has two writes in flight, so no response can arrive out of order", async () => {
      const { release, maxInFlight } = setup();
      await loaded();
      await press(complete());
      await press(bookmark());
      await release();
      await release();
      await waitFor(() => expect(bookmark()).toHaveAttribute("aria-pressed", "true"));
      expect(maxInFlight()).toBe(1);
   });

   it("a second press on the same control while it is pending is still ignored", async () => {
      const { api, release } = setup();
      await loaded();
      await press(bookmark());
      await press(bookmark());
      await release();
      await waitFor(() => expect(bookmark()).toHaveAttribute("aria-pressed", "true"));
      expect(patches(api)).toEqual([{ version: 1, bookmarked: true }]);
   });

   it("keeps the completion failure on screen while the queued bookmark still saves", async () => {
      const { api, release, other } = setup();
      await loaded();
      api.failNext("network");
      await press(complete());
      await press(bookmark());
      await release();
      await release();
      await waitFor(() => expect(bookmark()).toHaveAttribute("aria-pressed", "true"));
      expect(complete()).toHaveAttribute("aria-pressed", "false");
      expect(status()).toHaveTextContent("Couldn't save the completion");
      expect(await other.getItemState(LESSON)).toMatchObject({ data: { completed_at: null, bookmarked_at: expect.any(String) } });
   });

   it("on a version conflict, overwrites nothing and shows the server's state", async () => {
      const { api, release, other } = setup();
      await loaded();
      await press(complete());
      await press(bookmark());
      await release();
      await waitFor(() => expect(complete()).toHaveAttribute("aria-pressed", "true"));
      // Another context unbookmarks... nothing to unbookmark; it writes a note, moving the version past ours.
      await other.updateItemState(LESSON, { version: 2, note: "elsewhere" });
      await release();
      await waitFor(() => expect(status()).toHaveTextContent("This changed elsewhere"));
      expect(bookmark()).toHaveAttribute("aria-pressed", "false");
      expect(await other.getItemState(LESSON)).toMatchObject({ data: { bookmarked_at: null, note: "elsewhere", version: 3 } });
      expect(api.requests.filter((r) => r.method === "PATCH")).toHaveLength(3);
   });
});
