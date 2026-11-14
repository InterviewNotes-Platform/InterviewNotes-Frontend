import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/lessons/a", useRouter: () => ({ push: vi.fn() }) }));

import { CatalogBody } from "@/components/catalog/CatalogBody";
import { ReaderToolStoreProvider } from "@/components/reader/readerState";
import { LessonFolio } from "./LessonFolio";

beforeAll(() => {
   Element.prototype.scrollIntoView = vi.fn();
});

const TABLE = "| a | b |\n|---|---|\n| 1 | 2 |";
// One source Markdown block: two identical tables around a paragraph, no callout or other block between them.
const TEXT = `Intro.\n\n${TABLE}\n\nBetween.\n\n${TABLE}\n`;

const lesson = () => (
   <ReaderToolStoreProvider>
      <CatalogBody body={{ format: "markdown@1", text: TEXT }} reading={{ headings: [], exhibits: true }} />
      <LessonFolio entries={[]} />
   </ReaderToolStoreProvider>
);
const anchors = () => screen.getAllByRole("group", { name: /^Table/ }).map((group) => group.id);

describe("exhibit identity through the real Lesson body renderer (R1)", () => {
   it("gives two identical tables in one Markdown block different ids, stable across a rerender", () => {
      const view = render(lesson());
      const first = anchors();
      expect(first).toHaveLength(2);
      expect(first[0]).toMatch(/^exhibit-/);
      expect(first[0]).not.toBe(first[1]);
      view.rerender(lesson());
      expect(anchors()).toEqual(first);
   });

   it("lets each be pinned on its own, and the slip's Go to source reaches that exact table", () => {
      render(lesson());
      const groups = screen.getAllByRole("group", { name: /^Table/ });
      fireEvent.click(within(groups[1]).getByRole("button", { name: "Pin table" }));
      expect(within(groups[1]).getByRole("button", { name: "Unpin table" })).toHaveAttribute("aria-pressed", "true");
      expect(within(groups[0]).getByRole("button", { name: "Pin table" })).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(within(groups[0]).getByRole("button", { name: "Pin table" }));
      expect(screen.getAllByRole("button", { name: /^Unpin table [12]$/ })).toHaveLength(2);
      fireEvent.click(screen.getByRole("button", { name: "Go to source of table 1" }));
      expect(groups[1]).toHaveFocus();
   });
});
