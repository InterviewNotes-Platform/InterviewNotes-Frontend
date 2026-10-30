import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LessonContents } from "@/components/lesson/LessonContents";
import { contentsOf } from "@/lib/catalog/lesson";
import type { CatalogHeading } from "@/lib/catalog/types";

vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => null }));

import { CatalogBody } from "./CatalogBody";
import { headingIds, parseBlocks } from "./blocks";

const h = (id: string, level: number, text: string, authored?: boolean): CatalogHeading =>
   authored === undefined ? { id, level, text } : { id, level, text, authored };
const show = (text: string, headings: CatalogHeading[], headingOffset?: number) =>
   render(<CatalogBody body={{ format: "markdown@1", text }} reading={{ headings }} headingOffset={headingOffset} />);

describe("an authored identifier on a level-3 heading", () => {
   it("renders `### Q {#q}` as Q with the API id, an anchor and an accessible name that show no suffix", () => {
      show("## Parent\n\n### Q {#q}\n\nProse.\n\n### Other\n", [h("parent", 2, "Parent", false), h("q", 3, "Q", true), h("other", 3, "Other", false)]);
      const heading = screen.getByRole("heading", { level: 3, name: "Q" });
      expect(heading).toHaveAttribute("id", "q");
      expect(heading).toHaveTextContent(/^Q#$/);
      expect(screen.getByRole("link", { name: "Link to section: Q" })).toHaveAttribute("href", "#q");
      expect(document.body.textContent).not.toContain("{#");
   });

   it("uses the authored id, not a slug of the text, and keeps level-2 authored headings working beside it", () => {
      show("## Being stuck {#being-stuck}\n\n### Customer obsession, question one {#alp-customer-obsession-01}\n", [
         h("being-stuck", 2, "Being stuck", true),
         h("alp-customer-obsession-01", 3, "Customer obsession, question one", true),
      ]);
      expect(screen.getByRole("heading", { level: 2, name: "Being stuck" })).toHaveAttribute("id", "being-stuck");
      const question = screen.getByRole("heading", { level: 3, name: "Customer obsession, question one" });
      expect(question).toHaveAttribute("id", "alp-customer-obsession-01");
      expect(document.getElementById("customer-obsession-question-one")).toBeNull();
      expect(document.body.textContent).not.toContain("{#");
   });

   it("lists the Contents entry as Q at level 3 with the API id", () => {
      const entries = contentsOf([h("parent", 2, "Parent", false), h("q", 3, "Q", true)]);
      expect(entries).toEqual([
         { id: "parent", level: 2, text: "Parent" },
         { id: "q", level: 3, text: "Q" },
      ]);
      render(<LessonContents entries={entries} />);
      const link = within(screen.getAllByRole("navigation", { name: "Contents" })[0]).getByRole("link", { name: "Q" });
      expect(link).toHaveAttribute("href", "#q");
   });

   it("hides the suffix after inline markup, across extra spaces, and when the body renders its headings one level lower", () => {
      show("## P\n\n### Sizing **it**   {#sizing}\n\n### `kv` cache {#kv}\n", [
         h("p", 2, "P", false),
         h("sizing", 3, "Sizing **it**", true),
         h("kv", 3, "`kv` cache", true),
      ], 1);
      expect(screen.getByRole("heading", { level: 4, name: "Sizing it" })).toHaveAttribute("id", "sizing");
      expect(screen.getByRole("heading", { level: 4, name: "kv cache" })).toHaveAttribute("id", "kv");
      expect(document.body.textContent).not.toContain("{#");
   });

   it("leaves a level-3 heading without an authored flag exactly as before, including literal {#x} text", () => {
      show("## P\n\n### Plain\n\n### Literal {#x}\n\n### Old backend {#y}\n", [
         h("p", 2, "P", false),
         h("plain", 3, "Plain", false),
         h("literal-x", 3, "Literal {#x}", false),
         h("old-backend-y", 3, "Old backend {#y}"),
      ]);
      expect(screen.getByRole("heading", { level: 3, name: "Plain" })).toHaveAttribute("id", "plain");
      expect(screen.getByRole("heading", { level: 3, name: "Literal {#x}" })).toHaveAttribute("id", "literal-x");
      expect(screen.getByRole("heading", { level: 3, name: "Old backend {#y}" })).toHaveAttribute("id", "old-backend-y");
   });

   it("pairs a level-3 heading with the API entry only when level, text and its own suffix agree, never with a wrong id", () => {
      const blocks = parseBlocks("## P\n\n### T {#t}\n");
      expect(headingIds(blocks, [h("p", 2, "P", false), h("t", 3, "T", true)])).not.toBeNull();
      expect(headingIds(blocks, [h("p", 2, "P", false), h("t", 2, "T", true)])).toBeNull();
      expect(headingIds(blocks, [h("p", 2, "P", false), h("u", 3, "T", true)])).toBeNull();
      expect(headingIds(parseBlocks("## P\n\n### T\n"), [h("p", 2, "P", false), h("t", 3, "T", true)])).toBeNull();
   });
});
