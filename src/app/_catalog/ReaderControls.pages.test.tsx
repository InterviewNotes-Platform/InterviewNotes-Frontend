import type { ComponentProps } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: () => Promise.reject(new Error("NEXT_NOT_FOUND")) }));
vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => null }));
vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});

const auth = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("@/lib/supabase/client", () => ({
   createClient: () => ({ auth: { getSession: async () => ({ data: { session: auth.token ? { access_token: auth.token } : null } }) } }),
}));

import { forgetItemStateAvailability } from "@/components/prepare/reader/itemStateAvailable";
import type { CatalogItem } from "@/lib/catalog/types";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import { KnowledgePage } from "./KnowledgePage";
import { LessonPage } from "./LessonPage";
import { ProblemPage } from "./ProblemPage";

const item = (id: string, over: Partial<CatalogItem> = {}): CatalogItem => {
   const [type, slug] = id.split(".");
   return {
      id, type, slug, title: `Title ${slug}`, summary: "Synthetic.", tags: [], category: null, difficulty: null, level: null, access: "free",
      body: { format: "markdown@1", text: "Synthetic body." }, headings: [], sections: [], sections_withheld: false, ...over,
   } as CatalogItem;
};
const PAGES = {
   lesson: () => <LessonPage item={item("lesson.sample")} navigation={null} stayOnDeployment={false} />,
   problem: () => <ProblemPage item={item("problem.sample")} navigation={null} stayOnDeployment={false} />,
   knowledge: () => <KnowledgePage item={item("knowledge.sample", { body: null })} navigation={null} stayOnDeployment={false} />,
};
const controls = () => screen.queryByRole("group", { name: /actions$/ });
const markup = (container: HTMLElement) => container.innerHTML.replace(/_r_[0-9a-v]+_/g, "_r_");

let api: ReturnType<typeof createFakePrepApi>;
beforeEach(() => {
   forgetItemStateAvailability();
   api = createFakePrepApi();
   auth.token = api.signIn("ada");
   vi.stubGlobal("fetch", api.fetch);
   vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
   vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "true");
});
afterEach(() => {
   vi.unstubAllEnvs();
   vi.unstubAllGlobals();
});

describe("reader controls on the catalog pages", () => {
   it.each(["lesson", "problem"] as const)("a signed-in %s page shows completion and bookmark beside the header", async (kind) => {
      render(PAGES[kind]());
      await screen.findByRole("button", { name: "Mark complete" });
      expect(screen.getByRole("button", { name: "Bookmark" })).toBeInTheDocument();
      expect(controls()?.closest("main")).not.toBeNull();
      expect(screen.getByRole("heading", { level: 1 }).compareDocumentPosition(controls()!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(api.requests.some(({ path }) => path.includes(`/item-state/${kind}.sample`))).toBe(true);
   });

   it("a Knowledge page has none and sends no request", async () => {
      render(PAGES.knowledge());
      await act(async () => {});
      expect(controls()).toBeNull();
      expect(api.requests).toEqual([]);
   });

   it.each(["lesson", "problem"] as const)("a signed-out %s page is the page without the feature and sends no request", async (kind) => {
      vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "false");
      const off = render(PAGES[kind]());
      const without = markup(off.container);
      off.unmount();

      vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "true");
      auth.token = null;
      const on = render(PAGES[kind]());
      await act(async () => {});
      expect(markup(on.container)).toBe(without);
      expect(api.requests).toEqual([]);
   });

   it.each(["lesson", "problem"] as const)("a %s page with the frontend flag off sends no request, signed in or not", async (kind) => {
      vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "false");
      render(PAGES[kind]());
      await act(async () => {});
      expect(controls()).toBeNull();
      expect(api.requests).toEqual([]);
   });

   it.each(["lesson", "problem"] as const)("a signed-in %s page with M2 off shows no control and calls no item-state route", async (kind) => {
      api.setContinuity(false);
      render(PAGES[kind]());
      await act(async () => {});
      expect(controls()).toBeNull();
      expect(api.requests.map(({ path }) => path)).toEqual(["/features"]);
   });
});
