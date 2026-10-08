import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KnowledgeSupport } from "@/lib/catalog/lesson";

vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => null }));
vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return {
      default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) =>
         createElement("a", { "data-prefetch": String(prefetch), ...props }),
   };
});

import { CatalogBody } from "./CatalogBody";

const support = (slug: string, title = `About-able ${slug}`): [string, KnowledgeSupport] => [`knowledge.${slug}`, { title, summary: `Summary of ${slug}.`, href: `/knowledge/${slug}` }];
const RELATED = new Map([support("related"), support("other")]);
// The fixture Lesson's shapes: a reference in a heading, the first and a repeated body reference, and an unrelated one.
const TEXT = [
   "Intro.",
   "",
   "## Using [Related](ref:knowledge.related) well",
   "",
   "First [related knowledge](ref:knowledge.related) here, then [outside](ref:knowledge.outside).",
   "",
   "Again [related again](ref:knowledge.related) and [other](ref:knowledge.other) plus a [lesson](ref:lesson.next).",
].join("\n");
const HEADINGS = [{ id: "using-related-ref-knowledge-related-well", level: 2, text: "Using [Related](ref:knowledge.related) well" }];
const lesson = (text = TEXT, knowledge: ReadonlyMap<string, KnowledgeSupport> | null = RELATED) =>
   render(<CatalogBody body={{ format: "markdown@1", text }} reading={{ headings: HEADINGS, knowledge: knowledge ?? undefined }} />);
const toggles = () => screen.queryAllByRole("button", { name: /^About / });

describe("contextual Knowledge in a Lesson body", () => {
   it("puts a toggle after the first reference to each related target only", () => {
      lesson();
      expect(toggles().map((button) => button.getAttribute("aria-label"))).toEqual(["About About-able related", "About About-able other"]);
      const first = screen.getByRole("link", { name: "related knowledge" });
      expect(first.nextElementSibling?.querySelector("button")).toBe(toggles()[0]);
   });

   it("leaves the reference a link: the toggle is separate, and the link keeps its canonical, never-prefetched, quiet form", () => {
      lesson();
      const link = screen.getByRole("link", { name: "related knowledge" });
      expect(link).toHaveAttribute("href", "/knowledge/related");
      expect(link).toHaveAttribute("data-prefetch", "false");
      expect(link).toHaveAttribute("data-reference", "knowledge");
      expect(link.querySelector("button")).toBeNull();
      expect(toggles()[0].closest("a")).toBeNull();
   });

   it.each([
      ["a repeated reference", "related again"],
      ["an unrelated reference", "outside"],
      ["a Lesson reference", "lesson"],
   ])("gives %s no toggle", (_, name) => {
      lesson();
      const link = screen.getByRole("link", { name });
      expect(link.nextElementSibling?.querySelector("button") ?? null).toBeNull();
   });

   it("gives a reference inside a heading no toggle and leaves the heading ordinary", () => {
      lesson();
      const heading = screen.getByRole("heading", { level: 2 });
      expect(within(heading).queryByRole("button")).toBeNull();
      expect(heading).toHaveAttribute("id", "using-related-ref-knowledge-related-well");
      expect(within(heading).getByRole("link", { name: "Related" })).toHaveAttribute("href", "/knowledge/related");
      // the heading did not use up the first reference
      expect(toggles()[0]).toHaveAttribute("aria-label", "About About-able related");
   });

   it("opens the summary at the reference, in the paragraph, and keeps the Open link prefetch-free", () => {
      const { container } = lesson();
      fireEvent.click(toggles()[0]);
      const panel = screen.getByRole("group", { name: "About About-able related" });
      expect(panel.closest("p")).toContainElement(screen.getByRole("link", { name: "related knowledge" }));
      expect(panel).toHaveTextContent("Summary of related.");
      expect(within(panel).getByRole("link", { name: "Open About-able related" })).toHaveAttribute("data-prefetch", "false");
      expect(container.querySelectorAll("p div")).toHaveLength(0);
   });

   it("keeps one panel open: opening another closes the first", () => {
      lesson();
      fireEvent.click(toggles()[0]);
      fireEvent.click(toggles()[1]);
      expect(screen.getAllByRole("group")).toHaveLength(1);
      expect(screen.getByRole("group")).toHaveTextContent("Summary of other.");
   });

   it("covers a first reference that sits in a callout", () => {
      lesson("::: callout kind=tip\nSee [it](ref:knowledge.related).\n:::\n\nLater [again](ref:knowledge.related).", RELATED);
      expect(toggles()).toHaveLength(1);
      expect(within(screen.getByRole("note")).getByRole("button", { name: "About About-able related" })).toBeInTheDocument();
   });

   it("offers nothing without a target with a summary: no related Knowledge, no toggles", () => {
      lesson(TEXT, new Map());
      expect(toggles()).toHaveLength(0);
      expect(screen.getAllByRole("link", { name: /related|outside|other/ }).length).toBeGreaterThan(0);
   });
});

describe("outside Lesson reading mode (S-KNW scope)", () => {
   it("adds no toggle when the reading mode carries no Knowledge, as in a Problem body", () => {
      lesson(TEXT, null);
      expect(toggles()).toHaveLength(0);
   });

   it("adds no toggle in a section body, which is not in reading mode", () => {
      render(<CatalogBody body={{ format: "markdown@1", text: TEXT }} />);
      expect(toggles()).toHaveLength(0);
      expect(screen.getByRole("link", { name: "related knowledge" })).not.toHaveAttribute("data-reference");
   });
});
