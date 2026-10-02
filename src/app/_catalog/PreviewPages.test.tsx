import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import KnowledgePage, * as knowledgeModule from "../knowledge/[slug]/page";
import LessonPage, * as lessonModule from "../lessons/[slug]/page";
import ProblemPage, * as problemModule from "../problems/[slug]/page";
import TrackPage, * as trackModule from "../tracks/[slug]/page";

const TOKEN = "unit-synthetic-preview-token-0123456789abcdef";
const NOINDEX = { index: false, follow: false };
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

const pages = [
   ["/lessons/{slug}", LessonPage, lessonModule],
   ["/problems/{slug}", ProblemPage, problemModule],
   ["/knowledge/{slug}", KnowledgePage, knowledgeModule],
] as const;

async function renderItem(Page: (props: ReturnType<typeof params>) => Promise<{ type: unknown; props: unknown }>) {
   const element = await Page(params("foo"));
   const Inner = element.type as (props: unknown) => Promise<React.ReactElement>;
   return render(await Inner(element.props));
}

const marker = () => screen.queryByRole("complementary", { name: "Preview" });

beforeEach(() => {
   vi.clearAllMocks();
   getCatalogItem.mockResolvedValue({ status: "ok", data: ITEM });
   getCatalogItemMeta.mockResolvedValue({ status: "ok", data: ITEM });
   getCatalogTrack.mockResolvedValue({ status: "ok", data: TRACK });
   getCatalogRelated.mockResolvedValue({ status: "unavailable", cause: "upstream" });
});

afterEach(() => {
   vi.unstubAllEnvs();
});

describe("a preview deployment", () => {
   beforeEach(() => vi.stubEnv("CATALOG_PREVIEW_TOKEN", TOKEN));

   it.each(pages)("%s carries the Preview marker and is noindex", async (_route, Page, module) => {
      await renderItem(Page);
      expect(marker()).toHaveTextContent("Preview");
      expect(screen.getByText("Synthetic body.")).toBeInTheDocument();
      expect(await module.generateMetadata(params("foo"))).toEqual({
         title: "Synthetic Title",
         description: "Synthetic summary",
         robots: NOINDEX,
      });
   });

   it("/tracks/{slug} carries the Preview marker and is noindex", async () => {
      render(await TrackPage(params("foo")));
      expect(marker()).toHaveTextContent("Preview");
      expect(screen.getByRole("heading", { level: 1, name: "Synthetic Track" })).toBeInTheDocument();
      expect(await trackModule.generateMetadata(params("foo"))).toEqual({
         title: "Synthetic Track",
         description: "Track summary",
         robots: NOINDEX,
      });
   });

   it.each([
      { status: "notFound" },
      { status: "unauthenticated" },
      { status: "unavailable", cause: "upstream" },
      { status: "unavailable", cause: "transport" },
    ])("stays noindex when its metadata cannot be loaded ($status)", async (failure) => {
      getCatalogItemMeta.mockResolvedValue(failure);
      getCatalogTrack.mockResolvedValue(failure);
      expect(await lessonModule.generateMetadata(params("foo"))).toEqual({ robots: NOINDEX });
      expect(await trackModule.generateMetadata(params("foo"))).toEqual({ robots: NOINDEX });
   });

   it("shows the marker and a safe notice, never content, when the API refuses the preview", async () => {
      getCatalogItem.mockResolvedValue({ status: "unavailable", cause: "upstream" });
      await renderItem(LessonPage);
      expect(marker()).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("This content is temporarily unavailable. Please try again later.");
      expect(screen.queryByText("Synthetic body.")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
      expect(getCatalogItem).toHaveBeenCalledTimes(1);
   });

   it("shows the marker on a Track that cannot be loaded", async () => {
      getCatalogTrack.mockResolvedValue({ status: "unavailable", cause: "upstream" });
      render(await TrackPage(params("foo")));
      expect(marker()).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("temporarily unavailable");
   });

   it("names nothing of the environment, the repository or the credential", async () => {
      await renderItem(LessonPage);
      const text = marker()!.outerHTML;
      expect(text).not.toMatch(/branch|commit|sha|git|repo|beta|dev\.|netlify|render\.com|token|secret|localhost|api/i);
      expect(text).not.toContain(TOKEN);
   });

   it("keeps the credential out of everything it renders", async () => {
      const { container } = await renderItem(LessonPage);
      expect(container.innerHTML).not.toContain(TOKEN);
      expect(JSON.stringify(await lessonModule.generateMetadata(params("foo")))).not.toContain(TOKEN);
   });

   it("keeps authored links to a production origin on this deployment, in bodies and sections", async () => {
      const link = "[prod](https://interviewnotes.io/lessons/other)";
      const body = { format: "markdown@1", text: link };
      getCatalogItem.mockResolvedValue({ status: "ok", data: { ...ITEM, body, sections: [{ id: "s", type: "t", title: "S", body }] } });
      await renderItem(LessonPage);
      const links = screen.getAllByRole("link", { name: "prod" });
      expect(links).toHaveLength(2);
      for (const anchor of links) expect(anchor).toHaveAttribute("href", "/lessons/other");
   });

   it("is still marked and noindex when the credential is unusable", async () => {
      vi.stubEnv("CATALOG_PREVIEW_TOKEN", "short");
      await renderItem(LessonPage);
      expect(marker()).toBeInTheDocument();
      expect((await lessonModule.generateMetadata(params("foo"))).robots).toEqual(NOINDEX);
   });
});

describe("a production deployment", () => {
   beforeEach(() => vi.stubEnv("CATALOG_PREVIEW_TOKEN", ""));

   it.each(pages)("%s has no Preview marker and its metadata is untouched", async (_route, Page, module) => {
      await renderItem(Page);
      expect(marker()).not.toBeInTheDocument();
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
      expect(await module.generateMetadata(params("foo"))).toEqual({
         title: "Synthetic Title",
         description: "Synthetic summary",
      });
   });

   it("/tracks/{slug} has no Preview marker and its metadata is untouched", async () => {
      render(await TrackPage(params("foo")));
      expect(marker()).not.toBeInTheDocument();
      expect(await trackModule.generateMetadata(params("foo"))).toEqual({
         title: "Synthetic Track",
         description: "Track summary",
      });
   });

   it("leaves authored links exactly as authored", async () => {
      const body = { format: "markdown@1", text: "[prod](https://interviewnotes.io/lessons/other)" };
      getCatalogItem.mockResolvedValue({ status: "ok", data: { ...ITEM, body } });
      await renderItem(LessonPage);
      expect(screen.getByRole("link", { name: "prod" })).toHaveAttribute("href", "https://interviewnotes.io/lessons/other");
   });

   it("leaves metadata empty, not noindex, when the lookup fails", async () => {
      getCatalogItemMeta.mockResolvedValue({ status: "unavailable", cause: "upstream" });
      getCatalogTrack.mockResolvedValue({ status: "unavailable", cause: "upstream" });
      expect(await lessonModule.generateMetadata(params("foo"))).toEqual({});
      expect(await trackModule.generateMetadata(params("foo"))).toEqual({});
   });
});
