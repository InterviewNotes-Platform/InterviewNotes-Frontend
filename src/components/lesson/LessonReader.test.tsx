import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname: () => "/lessons/a", useRouter: () => ({ push }) }));

import { ReaderModeProvider, ReaderToolStoreProvider, ToolsSheetProvider, useReaderToolState } from "@/components/reader/readerState";
import type { ReaderMode } from "@/lib/reader/shellPolicy";
import { Exhibit } from "./Exhibit";
import { LessonFolio } from "./LessonFolio";
import { countExhibits } from "./LessonOpening";
import { chapterNumbers, LessonOutline } from "./LessonOutline";
import { LessonReaderFrame } from "./LessonReaderFrame";
import { exhibitAnchor, NO_PINS, pinKey, PINS_KEY, togglePin, type Pin } from "./pins";

beforeAll(() => {
   Element.prototype.scrollIntoView = vi.fn();
});

const ENTRIES = [
   { id: "one", level: 2 as const, text: "One" },
   { id: "one-a", level: 3 as const, text: "One A" },
   { id: "two", level: 2 as const, text: "Two" },
];
const pin = (key: string): Omit<Pin, "no"> => ({ key, kind: "Table", route: "/lessons/a", anchor: key, section: null, preview: "2 rows · 2 columns" });

function Table({ anchor }: { anchor: string }) {
   return (
      <Exhibit kind="Table" anchor={anchor} size="1 rows · 2 columns" label="Table: a, b">
         <table>
            <thead><tr><th>a</th><th>b</th></tr></thead>
            <tbody><tr><td>1</td><td><a href="#x">link</a></td></tr></tbody>
         </table>
      </Exhibit>
   );
}

describe("pins", () => {
   it("numbers pins in order, newest first, and unpins by key", () => {
      const two = togglePin(togglePin(NO_PINS, pin("a")), pin("b"));
      expect(two.map(({ key, no }) => [key, no])).toEqual([["b", 2], ["a", 1]]);
      expect(togglePin(two, pin("a")).map(({ key }) => key)).toEqual(["b"]);
   });

   it("keys a pin by its route and its exhibit's own anchor, so identical content still has two identities (R1)", () => {
      expect(exhibitAnchor("3", 120)).toBe("exhibit-3-120");
      expect(exhibitAnchor("3", 120)).not.toBe(exhibitAnchor("4", 120));
      expect(pinKey("/lessons/a", "exhibit-3-120")).not.toBe(pinKey("/lessons/b", "exhibit-3-120"));
   });
});

describe("the Lesson's outline", () => {
   it("numbers chapters (h2) only", () => {
      expect([...chapterNumbers(ENTRIES)]).toEqual([["one", 1], ["two", 2]]);
   });

   it("counts tables and diagrams from the body's own markdown, never inside other fences", () => {
      expect(countExhibits("| a | b |\n|---|---|\n| 1 | 2 |\n\n```mermaid\ngraph LR\n```\n\n|x|\n|:--|")).toEqual({ tables: 2, diagrams: 1 });
      expect(countExhibits("```text\n| a |\n|---|\n```\n\n---\n")).toEqual({ tables: 0, diagrams: 0 });
   });

   it("opens with the full contents as real fragment links, and keeps the docked bar inert until it docks", () => {
      render(<LessonOutline entries={ENTRIES} previous={null} next={{ href: "/lessons/b", title: "B", premium: true }} />);
      const opening = screen.getByRole("navigation", { name: "In this lesson" });
      expect(within(opening).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["#one", "#one-a", "#two"]);
      const bar = screen.getByRole("navigation", { name: "Lesson sections", hidden: true });
      expect(bar.closest("[data-docked]")).toHaveAttribute("data-docked", "false");
      expect(bar.closest("[inert]")).not.toBeNull();
      expect(within(bar).getByRole("link", { name: "Next in the Track: B, premium", hidden: true })).toHaveAttribute("href", "/lessons/b");
   });
});

/** Two exhibits with identical content; the folio can be unmounted, as the shell does in Read. */
function Harness({ show }: { show: boolean }) {
   const [pins] = useReaderToolState<readonly Pin[]>(PINS_KEY, NO_PINS);
   return (
      <>
         <Table anchor="exhibit-1-0" />
         <Table anchor="exhibit-5-0" />
         {show ? <LessonFolio entries={ENTRIES} /> : null}
         <output data-testid="count">{pins.length}</output>
      </>
   );
}
const store = (show: boolean) => (
   <ReaderToolStoreProvider>
      <Harness show={show} />
   </ReaderToolStoreProvider>
);

describe("Margin Folio, Pin and Scratch", () => {
   it("pins and unpins two identical exhibits independently, through a rerender and a remount (R1)", () => {
      const view = render(store(true));
      const [first, second] = screen.getAllByRole("button", { name: "Pin table" });
      fireEvent.click(second);
      expect(second).toHaveAttribute("aria-pressed", "true");
      expect(first).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(first);
      expect(screen.getByTestId("count")).toHaveTextContent("2");
      view.rerender(store(false));
      view.rerender(store(true));
      const pressed = screen.getAllByRole("button", { name: "Unpin table" });
      expect(pressed).toHaveLength(2);
      fireEvent.click(pressed[1]);
      const groups = screen.getAllByRole("group", { name: "Table: a, b" });
      expect(within(groups[0]).getByRole("button", { name: "Unpin table" })).toHaveAttribute("aria-pressed", "true");
      expect(within(groups[1]).getByRole("button", { name: "Pin table" })).toHaveAttribute("aria-pressed", "false");
   });

   it("keeps Scratch across an unmount (Read) and back, and states that nothing is saved", async () => {
      const view = render(store(true));
      fireEvent.change(screen.getByLabelText("Scratch"), { target: { value: "fermi: 3e6" } });
      view.rerender(store(false));
      view.rerender(store(true));
      expect(screen.getByLabelText("Scratch")).toHaveValue("fermi: 3e6");
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Insert where I am" })));
      expect(screen.getByLabelText("Scratch")).toHaveValue("fermi: 3e6\n— The opening —\n");
      expect(screen.getByText("Not saved or synced. Kept while this tab is open; reloading clears it.")).toBeInTheDocument();
   });

   it("Go to source reaches the exact exhibit on the same page (R2)", () => {
      render(store(true));
      const groups = screen.getAllByRole("group", { name: "Table: a, b" });
      fireEvent.click(within(groups[1]).getByRole("button", { name: "Pin table" }));
      fireEvent.click(screen.getByRole("button", { name: "Go to source of table 1" }));
      expect(groups[1]).toHaveFocus();
      expect(groups[1].scrollIntoView).toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
   });

   it("from the Study tools sheet, closes the sheet through the shell's explicit close before moving (R2)", () => {
      const close = vi.fn((after: () => void) => after());
      render(
         <ReaderToolStoreProvider>
            <Table anchor="exhibit-1-0" />
            <ToolsSheetProvider value={close}>
               <LessonFolio entries={ENTRIES} />
            </ToolsSheetProvider>
         </ReaderToolStoreProvider>
      );
      fireEvent.click(screen.getByRole("button", { name: "Pin table" }));
      fireEvent.click(screen.getByRole("button", { name: "Go to source of table 1" }));
      expect(close).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("group", { name: "Table: a, b" })).toHaveFocus();
   });

   it("a slip's Expand opens its own table's viewer and returns focus to the slip (R4)", async () => {
      render(store(true));
      const groups = screen.getAllByRole("group", { name: "Table: a, b" });
      fireEvent.click(within(groups[0]).getByRole("button", { name: "Pin table" }));
      const expand = screen.getByRole("button", { name: "Expand table 1" });
      fireEvent.click(expand);
      const dialog = screen.getByRole("dialog", { name: "Table: a, b" });
      expect(within(dialog).getByText("1 rows · 2 columns")).toBeInTheDocument();
      fireEvent.keyDown(dialog, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => expect(expand).toHaveFocus());
   });

   it("offers Expand on a pinned diagram only while it has a viewer, and Go to source always (R5)", async () => {
      const diagram = (viewer: boolean) => (
         <ReaderToolStoreProvider>
            <Exhibit kind="Diagram" anchor="exhibit-2-0" label="Diagram: flow">
               <figure>{viewer ? <button type="button" aria-haspopup="dialog" onClick={opened}>Expand diagram</button> : null}</figure>
            </Exhibit>
            <LessonFolio entries={ENTRIES} />
         </ReaderToolStoreProvider>
      );
      const opened = vi.fn();
      const view = render(diagram(false));
      fireEvent.click(screen.getByRole("button", { name: "Pin diagram" }));
      expect(screen.queryByRole("button", { name: "Expand diagram 1" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Go to source of diagram 1" }));
      expect(screen.getByRole("group", { name: "Diagram: flow" })).toHaveFocus();
      view.rerender(diagram(true));
      fireEvent.click(await screen.findByRole("button", { name: "Expand diagram 1" }));
      expect(opened).toHaveBeenCalledTimes(1);
   });
});

describe("exhibit viewers (R4)", () => {
   const wrap = () => render(<ReaderToolStoreProvider><Table anchor="exhibit-1-0" /></ReaderToolStoreProvider>);

   it("opens the table viewer from a plain click on a cell, as a modal dialog with the same table", () => {
      wrap();
      fireEvent.click(screen.getByRole("cell", { name: "1" }));
      const dialog = screen.getByRole("dialog", { name: "Table: a, b" });
      expect(within(dialog).getByRole("table")).toBeInTheDocument();
      fireEvent.keyDown(dialog, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
   });

   it("leaves links, modifier clicks and text selections alone", () => {
      wrap();
      const link = within(screen.getByRole("group", { name: "Table: a, b" })).getByRole("link", { name: "link" });
      fireEvent.click(link);
      fireEvent.click(screen.getByRole("cell", { name: "1" }), { metaKey: true });
      const selection = vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "1" } as Selection);
      fireEvent.click(screen.getByRole("cell", { name: "1" }));
      selection.mockRestore();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
   });
});

describe("Read text sizes (R3)", () => {
   const frame = (mode: ReaderMode) => (
      <ReaderModeProvider mode={mode}>
         <LessonReaderFrame chapters={2}>
            <p>Body</p>
         </LessonReaderFrame>
      </ReaderModeProvider>
   );

   it("offers 17.5, 19.5 and 21.5 px in Read only, by keyboard, and keeps the choice across Study and back", () => {
      // From 768 px, as in the probe; jsdom has no matchMedia of its own.
      vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
      const view = render(frame("study"));
      expect(screen.queryByRole("radiogroup", { name: "Text size" })).not.toBeInTheDocument();
      view.rerender(frame("read"));
      const group = screen.getByRole("radiogroup", { name: "Text size" });
      expect(within(group).getAllByRole("radio").map((radio) => radio.getAttribute("data-read-size-option"))).toEqual(["17.5", "19.5", "21.5"]);
      expect(within(group).getByRole("radio", { name: "Standard text" })).toHaveAttribute("aria-checked", "true");
      fireEvent.keyDown(within(group).getByRole("radio", { name: "Standard text" }), { key: "ArrowRight" });
      expect(within(group).getByRole("radio", { name: "Larger text" })).toHaveAttribute("aria-checked", "true");
      const scope = document.querySelector("[data-lesson-reader]");
      expect(scope).toHaveAttribute("data-read-size", "21.5");
      view.rerender(frame("study"));
      expect(scope).not.toHaveAttribute("data-read-size");
      view.rerender(frame("read"));
      expect(document.querySelector("[data-lesson-reader]")).toHaveAttribute("data-read-size", "21.5");
      vi.unstubAllGlobals();
   });
});
