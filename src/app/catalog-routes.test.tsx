import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCatalogItem, getCatalogItemMeta, getCatalogRelated, getCatalogTrack } = vi.hoisted(() => ({
   getCatalogItem: vi.fn(),
   getCatalogItemMeta: vi.fn(),
   getCatalogRelated: vi.fn(),
   getCatalogTrack: vi.fn(),
}));
vi.mock("@/lib/catalog/client", () => ({ getCatalogItem, getCatalogItemMeta, getCatalogRelated, getCatalogTrack }));
vi.mock("next/navigation", () => ({
   notFound: () => {
      throw new Error("NEXT_NOT_FOUND");
   },
}));
vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => null }));

import KnowledgePage, * as knowledgeModule from "./knowledge/[slug]/page";
import LessonPage, * as lessonModule from "./lessons/[slug]/page";
import ProblemPage, * as problemModule from "./problems/[slug]/page";
import TrackPage, * as trackModule from "./tracks/[slug]/page";

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
const ITEM = {
   id: "lesson.foo",
   type: "lesson",
   slug: "foo",
   title: "Synthetic Title",
   summary: "Synthetic summary",
   tags: [],
   difficulty: null,
   level: null,
   access: "free",
   kind: null,
   body: { format: "markdown@1", text: "Synthetic body." },
   headings: [],
   sections: [],
   sections_withheld: false,
};
const TRACK = { id: "track.foo", slug: "foo", title: "Synthetic Track", summary: "Track summary", modules: [] };

beforeEach(() => {
   vi.clearAllMocks();
   getCatalogItem.mockResolvedValue({ status: "ok", data: ITEM });
   getCatalogItemMeta.mockResolvedValue({ status: "ok", data: ITEM });
   getCatalogTrack.mockResolvedValue({ status: "ok", data: TRACK });
   getCatalogRelated.mockResolvedValue({ status: "unavailable", cause: "upstream" });
});

describe("type-based route mapping", () => {
   it.each([
      ["/lessons/{slug}", LessonPage, lessonModule, "lesson"],
      ["/problems/{slug}", ProblemPage, problemModule, "problem"],
      ["/knowledge/{slug}", KnowledgePage, knowledgeModule, "knowledge"],
   ] as const)("%s renders and titles only its own catalog type", async (_route, Page, module, type) => {
      const element = await Page(params("foo"));
      render(await element.type(element.props));
      expect(screen.getByText("Synthetic body.")).toBeInTheDocument();
      expect(getCatalogItem).toHaveBeenCalledExactlyOnceWith(type, "foo");

      expect(await module.generateMetadata(params("foo"))).toEqual({
         title: "Synthetic Title",
         description: "Synthetic summary",
      });
      expect(getCatalogItemMeta).toHaveBeenCalledExactlyOnceWith(type, "foo");
      expect(getCatalogTrack).not.toHaveBeenCalled();
   });

   it("/tracks/{slug} looks up a Track and never an item", async () => {
      render(await TrackPage(params("foo")));
      expect(screen.getByRole("heading", { level: 1, name: "Synthetic Track" })).toBeInTheDocument();
      expect(getCatalogTrack).toHaveBeenCalledExactlyOnceWith("foo");
      expect(getCatalogItem).not.toHaveBeenCalled();
      expect(await trackModule.generateMetadata(params("foo"))).toEqual({
         title: "Synthetic Track",
         description: "Track summary",
      });
   });
});

describe("track result states", () => {
   it("shows not-found for an unknown Track", async () => {
      getCatalogTrack.mockResolvedValue({ status: "notFound" });
      await expect(TrackPage(params("nope"))).rejects.toThrow("NEXT_NOT_FOUND");
   });

   it("says retired and unavailable distinctly from not found", async () => {
      getCatalogTrack.mockResolvedValue({ status: "retired" });
      render(await TrackPage(params("old")));
      expect(screen.getByRole("status")).toHaveTextContent("retired");
      getCatalogTrack.mockResolvedValue({ status: "unavailable", cause: "upstream" });
      render(await TrackPage(params("old")));
      expect(screen.getAllByRole("status").at(-1)).toHaveTextContent("temporarily unavailable");
   });
});

describe("item routes are never statically built or cached", () => {
   it.each([lessonModule, problemModule, knowledgeModule])("forces dynamic rendering", (module) => {
      expect(module.dynamic).toBe("force-dynamic");
   });
});

const APP = __dirname;
const files = (dir: string): string[] =>
   readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
   });
const ROUTE_DIRS = ["lessons", "problems", "knowledge", "tracks", "_catalog"];
const routeFiles = ROUTE_DIRS.flatMap((dir) => files(join(APP, dir)));
const read = (path: string) => readFileSync(path, "utf8");

describe("catalog route security boundary", () => {
   it("finds exactly the route files it guards", () => {
      expect(routeFiles.map((f) => relative(APP, f)).sort()).toEqual([
         "_catalog/CatalogItemPage.tsx",
         "_catalog/CatalogStateNotice.tsx",
         "_catalog/PreviewMarker.tsx",
         "knowledge/[slug]/page.tsx",
         "lessons/[slug]/page.tsx",
         "problems/[slug]/page.tsx",
         "tracks/[slug]/page.tsx",
         "tracks/page.tsx",
      ]);
   });

   it("runs on the server only: no client component and no browser fetch", () => {
      for (const file of routeFiles) expect(read(file), file).not.toMatch(/["']use client["']|\bfetch\(|useEffect/);
   });

   it("has no Git access, public env var or credential", () => {
      for (const file of routeFiles) expect(read(file), file).not.toMatch(/github|gitlab|\.git\b|GIT_|NEXT_PUBLIC|process\.env/i);
   });

   it("accepts no branch, commit or other selector from the URL", () => {
      for (const file of routeFiles) {
         expect(read(file), file).not.toMatch(/searchParams|useSearchParams|branch|commit|[?&](sha|rev|release|ref)=/i);
      }
   });

   it("never materializes content at build time or opts into shared caching", () => {
      for (const file of routeFiles) {
         expect(read(file), file).not.toMatch(/generateStaticParams|export const (revalidate|fetchCache)|dynamicParams|force-static/);
      }
   });

   it("keeps Track and module context out of the canonical route tree", () => {
      const routes = ROUTE_DIRS.flatMap((dir) => files(join(APP, dir))).map((f) => relative(APP, f));
      expect(routes.filter((route) => /\/\[(?!slug\])[^/]+\]/.test(route))).toEqual([]);
   });
});

describe("legacy /learn guarantee", () => {
   it("keeps the /learn routes where they were", () => {
      const learn = files(join(APP, "learn")).map((f) => relative(join(APP, "learn"), f)).sort();
      expect(learn).toEqual([
         "[course]/CourseDetail.tsx",
         "[course]/[chapter]/page.tsx",
         "[course]/page.tsx",
         "[course]/story-bank/StoryBankContent.tsx",
         "[course]/story-bank/page.tsx",
         "page.tsx",
      ].sort());
   });

   it("keeps /learn off the catalog route framework", () => {
      for (const file of files(join(APP, "learn"))) expect(read(file), file).not.toMatch(/lib\/catalog|_catalog|components\/catalog/);
   });
});
