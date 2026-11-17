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
vi.mock("next/navigation", () => ({ notFound: () => Promise.reject(new Error("NEXT_NOT_FOUND")), usePathname: () => "/lessons/test", useRouter: () => ({ push: vi.fn() }) }));
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
import { COLLECTIONS } from "@/lib/prep/collections";
import { BEHAVIORAL_LESSONS } from "@/lib/prep/questions";
import { ReaderToolStoreProvider } from "@/components/reader/readerState";
import { CatalogItemPage } from "./CatalogItemPage";

// The four Lessons as published by the P7-T17C branch, and the `headings[]` the API derives from them (see the T17 tests).
const FIXTURES = join(__dirname, "../../lib/prep/fixtures");
const HEADINGS: Record<string, CatalogHeading[]> = {
   ...JSON.parse(readFileSync(join(FIXTURES, "headings.json"), "utf8")),
   ...JSON.parse(readFileSync(join(FIXTURES, "collections-headings.json"), "utf8")),
};

function lessonItem(slug: string, id: string): CatalogItem {
   const text = readFileSync(join(FIXTURES, `${slug}.md`), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^\n+/, "");
   return {
      id, type: "lesson", slug, title: "Synthetic Lesson", summary: "Synthetic.", tags: [], category: null, difficulty: null, level: null,
      access: "free", body: { format: "markdown@1", text }, headings: HEADINGS[slug], sections: [], sections_withheld: false,
   };
}

// The reader's tab-level store is the root layout's (P8-T26); the Lesson's exhibits read their pins from it (P8-T27).
const show = async (slug: string) => render(<ReaderToolStoreProvider>{await CatalogItemPage({ type: "lesson", slug })}</ReaderToolStoreProvider>);
/** React's generated ids count renders, so a second render of the same page differs only there. */
const markup = (container: HTMLElement) => container.innerHTML.replace(/_r_[0-9a-z]+_/g, "_r_");
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

describe.each(COLLECTIONS.filter(({ grouped }) => grouped).map((collection) => ({ collection, lesson: collection.lessons[0] })))(
   "Prepare your answer on the $collection.title Lesson",
   ({ collection, lesson }) => {
      const manifest = collection.manifest[lesson.content_id];
      /** React's ids are base-32 (`_r_c_`), so a longer Lesson's counter is not always digits. */
      const stable = (container: HTMLElement) => markup(container).replace(/_r_[0-9a-v]+_/g, "_r_");
      const open = () => {
         getCatalogItem.mockResolvedValue({ status: "ok", data: lessonItem(lesson.slug, lesson.content_id) });
         return show(lesson.slug);
      };

      it("offers one link for each manifest question, with its authored pair, and none on a group heading", async () => {
         vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "true");
         await open();
         await act(async () => {});
         const hrefs = links().map((link) => link.getAttribute("href"));
         expect(hrefs).toEqual(manifest.map((question) => `/prepare/new?content=${lesson.content_id}&question=${question}`));
         expect(links().every((link) => link.closest("p")?.previousElementSibling?.tagName === "H3")).toBe(true);
      });

      it("adds nothing while the flag is off or the reader is signed out, and the signed-out Lesson is unchanged", async () => {
         const off = await open();
         const without = stable(off.container);
         off.unmount();

         vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "false");
         const flagOff = await open();
         await act(async () => {});
         expect(links()).toHaveLength(0);
         flagOff.unmount();

         vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "true");
         auth.session = null;
         const signedOut = await open();
         await act(async () => {});
         expect(links()).toHaveLength(0);
         expect(stable(signedOut.container)).toBe(without);
      });
   }
);
