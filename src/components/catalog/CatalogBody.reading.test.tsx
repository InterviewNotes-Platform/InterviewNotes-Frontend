import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CatalogHeading } from "@/lib/catalog/types";

vi.mock("@/components/mdx/Mermaid", () => ({
   Mermaid: ({ adaptive }: { adaptive?: boolean }) => <div data-testid="mermaid" data-adaptive={String(adaptive)} />,
}));
// Expose Link's `prefetch`: a reading body must never make the server read the targets in view.
vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return {
      default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) =>
         createElement("a", { "data-prefetch": String(prefetch), ...props }),
   };
});

import { CatalogBody } from "./CatalogBody";
import { headingIds, parseBlocks } from "./blocks";

const h = (id: string, level: number, text: string): CatalogHeading => ({ id, level, text });
const body = (text: string) => ({ format: "markdown@1" as const, text });
const show = (text: string, headings?: CatalogHeading[]) =>
   render(<CatalogBody body={body(text)} reading={headings ? { headings } : undefined} />);

const TEXT = [
   "## Why batching works",
   "",
   "Prose.",
   "",
   "### Sizing the `kv_cache` budget",
   "",
   "```text",
   "## not a heading",
   "```",
   "",
   "## Why [batching](ref:knowledge.batching) works",
].join("\n");
// What the backend returns for TEXT: ids come from heading *source*, so the linked heading is not "why-batching-works-2".
const HEADINGS = [
   h("why-batching-works", 2, "Why batching works"),
   h("sizing-the-kv-cache-budget", 3, "Sizing the `kv_cache` budget"),
   h("why-batching-ref-knowledge-batching-works", 2, "Why [batching](ref:knowledge.batching) works"),
];

describe("headingIds", () => {
   it("pairs each heading line outside code with the API's heading, across callouts, in order", () => {
      const blocks = parseBlocks("## One\n\n::: callout kind=tip\n### Inside\n:::\n\n## Two");
      const ids = headingIds(blocks, [h("one", 2, "One"), h("inside", 3, "Inside"), h("two", 2, "Two")]);
      expect([...ids!.values()].flatMap((lines) => [...lines.values()].map(({ id }) => id))).toEqual(["one", "inside", "two"]);
   });

   it.each([
      ["a different count", [h("one", 2, "One")]],
      ["a different level", [h("one", 3, "One"), h("two", 2, "Two")]],
      ["different text", [h("one", 2, "One"), h("two", 2, "Deux")]],
      ["a repeated id", [h("one", 2, "One"), h("one", 2, "Two")]],
   ])("is null for %s, so no heading ever gets a wrong id", (_, headings) => {
      expect(headingIds(parseBlocks("## One\n\n## Two"), headings)).toBeNull();
   });

   it("ignores a # line inside a fence, and a body with no headings pairs with none", () => {
      expect(headingIds(parseBlocks("```\n# code\n```"), [])).toEqual(new Map());
   });
});

describe("CatalogBody reading mode", () => {
   it("renders every h2/h3 with exactly the API's id, including a heading whose text differs from its slug", () => {
      show(TEXT, HEADINGS);
      for (const { id, level } of HEADINGS) {
         expect(document.getElementById(id)?.tagName, id).toBe(`H${level}`);
      }
      expect(document.getElementById("why-batching-ref-knowledge-batching-works")).toHaveTextContent("Why batching works");
   });

   it("gives duplicate headings the API's distinct ids, in document order", () => {
      show("## Example\n\nA\n\n## Example\n\nB", [h("example", 2, "Example"), h("example-2", 2, "Example")]);
      const [first, second] = screen.getAllByRole("heading", { name: "Example" });
      expect([first.id, second.id]).toEqual(["example", "example-2"]);
      expect(new Set([...document.querySelectorAll("[id]")].map((element) => element.id)).size).toBe(document.querySelectorAll("[id]").length);
   });

   it("makes headings focus targets without adding a tab stop", () => {
      show(TEXT, HEADINGS);
      const heading = document.getElementById("why-batching-works")!;
      expect(heading).toHaveAttribute("tabindex", "-1");
      heading.focus();
      expect(heading).toHaveFocus();
   });

   it("keeps the heading's own name and offers a separate, named anchor on h2 and h3 only", () => {
      show("# Top\n\n## Two\n\n### Three\n\n#### Four", [h("top", 1, "Top"), h("two", 2, "Two"), h("three", 3, "Three"), h("four", 4, "Four")]);
      expect(screen.getByRole("heading", { level: 2, name: "Two" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Link to section: Two" })).toHaveAttribute("href", "#two");
      expect(screen.getByRole("link", { name: "Link to section: Three" })).toHaveAttribute("href", "#three");
      expect(screen.getAllByRole("link")).toHaveLength(2);
      expect(document.getElementById("top")).toBeInTheDocument();
      expect(document.getElementById("four")).toBeInTheDocument();
   });

   it("names an anchor from the heading's text without markup", () => {
      show(TEXT, HEADINGS);
      expect(screen.getByRole("link", { name: "Link to section: Sizing the kv_cache budget" })).toHaveAttribute("href", "#sizing-the-kv-cache-budget");
   });

   it("keeps the anchor quiet until hover or focus, and out of the heading's name", () => {
      show("## Two", [h("two", 2, "Two")]);
      const anchor = screen.getByRole("link", { name: "Link to section: Two" });
      expect(anchor).toHaveClass("opacity-0", "focus-visible:opacity-100", "group-hover:opacity-100");
      expect(screen.getByRole("heading", { name: "Two" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /Link to section/ })).not.toBeInTheDocument();
   });

   it("gives headings inside a callout their ids too", () => {
      show("::: callout kind=note\n### Inside a callout\nText.\n:::", [h("inside-a-callout", 3, "Inside a callout")]);
      expect(within(screen.getByRole("note")).getByRole("heading", { name: "Inside a callout" })).toHaveAttribute("id", "inside-a-callout");
   });

   it("carries no id when the API's headings do not match the body, rather than a wrong one", () => {
      show("## One\n\n## Two", [h("one", 2, "One")]);
      expect(document.querySelectorAll("h2[id]")).toHaveLength(0);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
   });

   it("leaves a heading the API does not list (setext, quoted) without an id", () => {
      show("Setext title\n============\n\n> ## Quoted\n\n## Listed", [h("listed", 2, "Listed")]);
      expect(document.querySelectorAll("[id]:not([id$='_text'])")).toHaveLength(1);
      expect(document.getElementById("listed")).toBeInTheDocument();
   });

   it("is unchanged without reading mode: no ids, anchors or focus targets", () => {
      show(TEXT);
      expect(document.querySelectorAll("[id]")).toHaveLength(0);
      expect(document.querySelectorAll("[tabindex]")).toHaveLength(0);
      expect(document.querySelectorAll('a[href^="#"]')).toHaveLength(0);
   });
});

describe("references in reading mode", () => {
   const text = "See [RAG](ref:knowledge.rag), [Batching](ref:lesson.batching), [Design](ref:problem.design) and [site](https://example.com).";

   it("sets Knowledge references apart: canonical route, dotted and quiet, never prefetched", () => {
      show(text, []);
      const rag = screen.getByRole("link", { name: "RAG" });
      expect(rag).toHaveAttribute("href", "/knowledge/rag");
      expect(rag).toHaveAttribute("data-reference", "knowledge");
      expect(rag).toHaveClass("decoration-dotted", "text-foreground");
      expect(rag).toHaveAttribute("data-prefetch", "false");
   });

   it("leaves Lesson and Problem references as ordinary links to their own routes, also never prefetched", () => {
      show(text, []);
      for (const [name, href] of [["Batching", "/lessons/batching"], ["Design", "/problems/design"]]) {
         const link = screen.getByRole("link", { name });
         expect(link).toHaveAttribute("href", href);
         expect(link).not.toHaveAttribute("data-reference");
         expect(link).not.toHaveClass("decoration-dotted");
         expect(link).toHaveAttribute("data-prefetch", "false");
      }
      expect(screen.getByRole("link", { name: "site" })).toHaveAttribute("target", "_blank");
   });

   it("does not change how other pages render the same references", () => {
      show(text);
      const rag = screen.getByRole("link", { name: "RAG" });
      expect(rag).not.toHaveAttribute("data-reference");
      expect(rag).not.toHaveClass("decoration-dotted");
      expect(rag).toHaveAttribute("data-prefetch", "undefined");
   });
});

describe("diagrams", () => {
   it("are adaptive only in reading mode", () => {
      const text = "```mermaid\ngraph LR\nA-->B\n```";
      show(text, []);
      expect(screen.getByTestId("mermaid")).toHaveAttribute("data-adaptive", "true");
      document.body.innerHTML = "";
      show(text);
      expect(screen.getByTestId("mermaid")).toHaveAttribute("data-adaptive", "false");
   });
});
