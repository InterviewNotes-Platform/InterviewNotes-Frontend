import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LessonContents } from "@/components/lesson/LessonContents";
import { contentsOf } from "@/lib/catalog/lesson";
import type { CatalogHeading } from "@/lib/catalog/types";
import fixtures from "./fixtures/behavioral-lessons.json";

vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => null }));

import { CatalogBody } from "./CatalogBody";
import { headingIds, parseBlocks } from "./blocks";

const h = (id: string, level: number, text: string, authored?: boolean): CatalogHeading =>
   authored === undefined ? { id, level, text } : { id, level, text, authored };
const show = (text: string, headings: CatalogHeading[]) =>
   render(<CatalogBody body={{ format: "markdown@1", text }} reading={{ headings }} />);

describe("an authored heading identifier", () => {
   it("renders `## T {#t}` as T with the API id, an anchor and an accessible name that show no suffix", () => {
      show("## T {#t}\n\nProse.\n\n## Other\n", [h("t", 2, "T", true), h("other", 2, "Other", false)]);
      const heading = screen.getByRole("heading", { level: 2, name: "T" });
      expect(heading).toHaveAttribute("id", "t");
      expect(heading).toHaveTextContent(/^T#$/);
      expect(screen.getByRole("link", { name: "Link to section: T" })).toHaveAttribute("href", "#t");
      expect(document.body.textContent).not.toContain("{#");
   });

   it("lists the Contents entry as T with the API id", () => {
      const entries = contentsOf([h("t", 2, "T", true), h("other", 2, "Other", false)]);
      render(<LessonContents entries={entries} />);
      const link = within(screen.getAllByRole("navigation", { name: "Contents" })[0]).getByRole("link", { name: "T" });
      expect(link).toHaveAttribute("href", "#t");
   });

   it("hides the suffix after inline markup, and across extra spaces before it", () => {
      show("## Sizing **it**   {#sizing}\n\n## `kv` cache {#kv}\n", [h("sizing", 2, "Sizing **it**", true), h("kv", 2, "`kv` cache", true)]);
      expect(screen.getByRole("heading", { name: "Sizing it" })).toHaveAttribute("id", "sizing");
      expect(screen.getByRole("heading", { name: "kv cache" })).toHaveAttribute("id", "kv");
      expect(document.body.textContent).not.toContain("{#");
   });

   it("leaves a heading without the suffix exactly as before, including literal {#x} text the API did not strip", () => {
      show("## Plain\n\n## Literal {#x}\n\n## Old backend {#y}\n", [
         h("plain", 2, "Plain", false),
         h("literal-x", 2, "Literal {#x}", false),
         h("old-backend-y", 2, "Old backend {#y}"),
      ]);
      expect(screen.getByRole("heading", { name: "Plain" })).toHaveAttribute("id", "plain");
      expect(screen.getByRole("heading", { name: "Literal {#x}" })).toHaveAttribute("id", "literal-x");
      expect(screen.getByRole("heading", { name: "Old backend {#y}" })).toHaveAttribute("id", "old-backend-y");
   });

   it("gives an authored heading no id when its source does not end with its own identifier, rather than a wrong one", () => {
      const blocks = parseBlocks("## T\n\n## U {#other}\n");
      expect(headingIds(blocks, [h("t", 2, "T", true), h("u", 2, "U", true)])).toBeNull();
   });
});

describe("the four Behavioral Lesson fixtures", () => {
   const lessons = Object.entries(fixtures) as [string, { text: string; headings: CatalogHeading[] }][];

   it.each(lessons)("renders %s with 10 identifiers and no suffix in a heading, an anchor label or Contents", (_, { text, headings }) => {
      const { container } = show(text, headings);
      expect(headings.filter(({ authored }) => authored)).toHaveLength(10);
      for (const { id, text: title } of headings) {
         const heading = container.querySelector(`#${CSS.escape(id)}`);
         expect(heading).toHaveTextContent(new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}#?$`));
         expect(screen.getByRole("link", { name: `Link to section: ${title}` })).toHaveAttribute("href", `#${id}`);
      }
      render(<LessonContents entries={contentsOf(headings)} />);
      const contents = screen.getAllByRole("navigation", { name: "Contents" })[0];
      expect(within(contents).getAllByRole("link")).toHaveLength(headings.length);
      expect(contents.textContent).not.toContain("{#");
      expect(document.body.textContent).not.toContain("{#");
   });
});
