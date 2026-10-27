import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCatalogItem, getCatalogItemMeta, getCatalogRelated, getCatalogTrack } = vi.hoisted(() => ({
   getCatalogItem: vi.fn(),
   getCatalogItemMeta: vi.fn(),
   getCatalogRelated: vi.fn(),
   getCatalogTrack: vi.fn(),
}));
vi.mock("@/lib/catalog/client", () => ({ getCatalogItem, getCatalogItemMeta, getCatalogRelated, getCatalogTrack }));
vi.mock("next/navigation", () => ({ notFound: () => Promise.reject(new Error("NEXT_NOT_FOUND")) }));
vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => null }));

const auth = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/lib/supabase/client", () => ({
   createClient: () => ({
      auth: {
         getSession: async () => ({ data: { session: auth.session } }),
         onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
   }),
}));

import type { CatalogHeading, CatalogItem } from "@/lib/catalog/types";
import { BEHAVIORAL_LESSONS } from "@/lib/prep/questions";
import { CatalogItemPage } from "./CatalogItemPage";

// The four Lessons as published by the P7-T17C branch, and the `headings[]` the API derives from them (see the T17 tests).
const FIXTURES = join(__dirname, "../../lib/prep/fixtures");
const HEADINGS: Record<string, CatalogHeading[]> = JSON.parse(readFileSync(join(FIXTURES, "headings.json"), "utf8"));

function lessonItem(slug: string, id: string): CatalogItem {
   const text = readFileSync(join(FIXTURES, `${slug}.md`), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^\n+/, "");
   return {
      id, type: "lesson", slug, title: "Synthetic Lesson", summary: "Synthetic.", tags: [], category: null, difficulty: null, level: null,
      access: "free", body: { format: "markdown@1", text }, headings: HEADINGS[slug], sections: [], sections_withheld: false,
   };
}

const show = async (slug: string) => render(await CatalogItemPage({ type: "lesson", slug }));
/** React's generated ids count renders, so a second render of the same page differs only there. */
const markup = (container: HTMLElement) => container.innerHTML.replace(/_r_\d+_/g, "_r_");
const links = () => screen.queryAllByRole("link", { name: /^Prepare your answer/ });
const [SDE_1] = BEHAVIORAL_LESSONS;

beforeEach(() => {
   vi.clearAllMocks();
   auth.session = { access_token: "t" };
   getCatalogItemMeta.mockResolvedValue({ status: "notFound" });
   getCatalogRelated.mockResolvedValue({ status: "notFound" });
   getCatalogTrack.mockResolvedValue({ status: "notFound" });
});
afterEach(() => vi.unstubAllEnvs());

describe("Prepare your answer on the Behavioral Lessons", () => {
   it("offers one link per question, ten on each Lesson, never on its excluded sections, when the flag is on", async () => {
      vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "true");
      for (const lesson of BEHAVIORAL_LESSONS) {
         getCatalogItem.mockResolvedValue({ status: "ok", data: lessonItem(lesson.slug, lesson.content_id) });
         const { unmount } = await show(lesson.slug);
         await act(async () => {});
         const hrefs = links().map((link) => link.getAttribute("href"));
         expect(hrefs).toHaveLength(10);
         expect(new Set(hrefs).size).toBe(10);
         expect(hrefs.every((href) => href?.startsWith(`/prepare/new?content=${lesson.content_id}&question=`))).toBe(true);
         unmount();
      }
   });

   it("adds nothing while the flag is off, signed in or not", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: lessonItem(SDE_1.slug, SDE_1.content_id) });
      const { container } = await show(SDE_1.slug);
      await act(async () => {});
      expect(links()).toHaveLength(0);

      vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "false");
      auth.session = null;
      const again = await show(SDE_1.slug);
      await act(async () => {});
      expect(links()).toHaveLength(0);
      expect(markup(again.container)).toBe(markup(container));
   });

   it("leaves the Lesson for a signed-out reader identical to the Lesson without the feature", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: lessonItem(SDE_1.slug, SDE_1.content_id) });
      const off = await show(SDE_1.slug);
      const without = markup(off.container);
      off.unmount();

      vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "true");
      auth.session = null;
      const on = await show(SDE_1.slug);
      await act(async () => {});
      expect(links()).toHaveLength(0);
      expect(markup(on.container)).toBe(without);
   });

   it("is only on a Behavioral Lesson, even if another Lesson carried authored identifiers", async () => {
      vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "true");
      getCatalogItem.mockResolvedValue({ status: "ok", data: lessonItem(SDE_1.slug, "lesson.something-else") });
      await show("something-else");
      await act(async () => {});
      expect(links()).toHaveLength(0);
   });
});
