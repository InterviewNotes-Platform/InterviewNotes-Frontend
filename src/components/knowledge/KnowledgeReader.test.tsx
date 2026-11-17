import type { ComponentProps } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/knowledge/topic", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => null }));
vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});

import { KnowledgePage, knowledgeTools } from "@/app/_catalog/KnowledgePage";
import { LessonFolio } from "@/components/lesson/LessonFolio";
import { EXHIBIT_REVEAL } from "@/components/lesson/pins";
import { useActiveHeading } from "@/components/lesson/useActiveHeading";
import { ReaderModeProvider, ReaderToolStoreProvider } from "@/components/reader/readerState";
import type { CatalogItem } from "@/lib/catalog/types";
import { depthNote, outlineAt, type DepthBand } from "./KnowledgeReader";

beforeAll(() => {
   Element.prototype.scrollIntoView = vi.fn();
});

const TABLE = "| a | b |\n|---|---|\n| 1 | 2 |";
const section = (type: string, id = type.replace(/_/g, "-"), text = `Body of ${id}.`) => ({
   id,
   type,
   title: `Heading of ${id}`,
   body: { format: "markdown@1", text },
});
const entry = (sections = [section("definition"), section("how_it_works"), section("failure_modes")]) =>
   ({
      id: "knowledge.topic", type: "knowledge", slug: "topic", title: "Synthetic Topic", summary: "Synthetic summary.", tags: [],
      category: "concept", difficulty: null, level: null, access: "free", body: null, headings: [], sections, sections_withheld: false,
   }) as CatalogItem;

const page = (item = entry()) =>
   render(
      <ReaderToolStoreProvider>
         <ReaderModeProvider mode="study">
            <KnowledgePage item={item} navigation={null} stayOnDeployment={false} />
            {knowledgeTools(item)}
         </ReaderModeProvider>
      </ReaderToolStoreProvider>
   );
const contents = () => screen.getByRole("navigation", { name: "In this entry" });
const bar = () => screen.getByRole("navigation", { name: "Knowledge sections", hidden: true });
const names = (nav: HTMLElement) => within(nav).queryAllByRole("link", { hidden: true }).map((link) => link.textContent);
const depthOption = (rank: number) => screen.getByRole("radiogroup", { name: "Read at depth" }).querySelector<HTMLElement>(`[data-depth-option="${rank}"]`)!;
const depthOf = () => document.querySelector("[data-knowledge-depth]")!.getAttribute("data-knowledge-depth");

const BANDS: DepthBand[] = [
   { id: "knowledge_fast", label: "Fast understanding", rank: 1, sections: [{ id: "d", text: "Definition" }] },
   { id: "knowledge_explanation", label: "Explanation", rank: 2, sections: [] },
   { id: "knowledge_reference", label: "Deeper reference", rank: 3, sections: [{ id: "f", text: "Failure modes" }] },
];

describe("Read at depth", () => {
   it("lists the bands up to the depth with their sections, and an empty band as Nothing yet (not a link)", () => {
      expect(outlineAt(BANDS, 1).map(({ id }) => id)).toEqual(["knowledge_fast", "d"]);
      expect(outlineAt(BANDS, 3).find(({ id }) => id === "knowledge_explanation")).toMatchObject({ note: "Nothing yet" });
      expect(depthNote(BANDS, 2)).toBe("Showing fast understanding and explanation only.");
      expect(depthNote(BANDS, 3)).toBe("Showing every section.");
   });

   it("offers the three canonical depths, every section shown by default", () => {
      page();
      const radios = within(screen.getByRole("radiogroup", { name: "Read at depth" })).getAllByRole("radio");
      expect(radios.map((radio) => radio.textContent)).toEqual(["1 Fast understanding", "2 Explanation", "3 Deeper reference"]);
      expect(radios[2]).toHaveAttribute("aria-checked", "true");
      expect(depthOf()).toBe("3");
      expect(screen.getByText("Showing every section.")).toBeInTheDocument();
   });

   it("filters the body, the opening contents and the docked bar alike, and says what it shows", () => {
      page();
      fireEvent.click(depthOption(1));
      expect(depthOf()).toBe("1");
      expect(names(contents())).toEqual(["1Fast understanding", "Heading of definition"]);
      fireEvent.click(bar().querySelector('[aria-controls="lesson-dock-list"]')!);
      expect(names(document.getElementById("lesson-dock-list")!)).toEqual(["1Fast understanding", "Heading of definition"]);
      expect(screen.getByText("Showing fast understanding only.")).toBeInTheDocument();
      // The bar's own control follows the same state.
      expect(screen.getByRole("radiogroup", { name: "Depth", hidden: true }).querySelector('[data-depth-option="1"]')).toHaveAttribute("aria-checked", "true");
      // Hidden bands keep their canonical rank, which the stylesheet hides by.
      expect(document.getElementById("failure-modes")!.closest("[data-knowledge-band]")).toHaveAttribute("data-knowledge-band", "3");
   });

   it("moves and selects with the arrow keys, as a radio group", () => {
      page();
      const group = screen.getByRole("radiogroup", { name: "Read at depth" });
      fireEvent.keyDown(group, { key: "ArrowRight" });
      expect(depthOf()).toBe("1");
      fireEvent.keyDown(group, { key: "ArrowLeft" });
      expect(depthOf()).toBe("3");
      expect(within(group).getAllByRole("radio").map((radio) => radio.tabIndex)).toEqual([-1, -1, 0]);
   });

   it("shows Nothing yet for an empty band and links nowhere for it", () => {
      page(entry([section("definition"), section("failure_modes")]));
      expect(within(contents()).getByText(/Nothing yet/).closest("a")).toBeNull();
      expect(names(contents())).toEqual(["1Fast understanding", "Heading of definition", "3Deeper reference", "Heading of failure-modes"]);
      expect(document.getElementById("knowledge_explanation")).toBeNull();
   });

   it("shows every band when a deep link, Back or Forward reaches a section the depth hides", () => {
      page();
      fireEvent.click(depthOption(1));
      act(() => {
         window.history.replaceState(null, "", "#failure-modes");
         window.dispatchEvent(new HashChangeEvent("hashchange"));
      });
      expect(depthOf()).toBe("3");
      expect(document.activeElement).toBe(document.getElementById("failure-modes"));
      window.history.replaceState(null, "", "#");
   });

   it("leaves the depth alone for a fragment it already shows", () => {
      page();
      fireEvent.click(depthOption(1));
      act(() => {
         window.history.replaceState(null, "", "#definition");
         window.dispatchEvent(new HashChangeEvent("hashchange"));
      });
      expect(depthOf()).toBe("1");
      window.history.replaceState(null, "", "#");
   });
});

describe("pins and exhibits on a Knowledge entry", () => {
   const twins = () => entry([section("definition", "definition", TABLE), section("how_it_works", "how-it-works", TABLE), section("failure_modes", "failure-modes", TABLE)]);

   it("gives identical tables in different sections their own exhibit ids, and pins them apart under their sections", () => {
      page(twins());
      const exhibits = [...document.querySelectorAll("[data-exhibit='table']")].map(({ id }) => id);
      expect(exhibits).toHaveLength(3);
      expect(new Set(exhibits).size).toBe(3);
      expect(exhibits[0]).toMatch(/^exhibit-definition-/);
      const pins = screen.getAllByRole("button", { name: "Pin table" });
      fireEvent.click(pins[0]);
      fireEvent.click(pins[1]);
      const folio = screen.getByRole("heading", { name: /Pinned/ }).parentElement!;
      expect(within(folio).getByText("Heading of definition")).toBeInTheDocument();
      expect(within(folio).getByText("Heading of how-it-works")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /^Unpin table/ })).toHaveLength(4); // two exhibits, two slips
   });

   it("reveals a hidden band before a slip reaches its exhibit", () => {
      page(twins());
      fireEvent.click(screen.getAllByRole("button", { name: "Pin table" })[2]);
      fireEvent.click(depthOption(1));
      expect(depthOf()).toBe("1");
      fireEvent.click(screen.getByRole("button", { name: "Go to source of table 1" }));
      expect(depthOf()).toBe("3");
      const exhibit = document.querySelector("[data-pin-section='Heading of failure-modes'] [data-exhibit]")!;
      expect(exhibit.dispatchEvent(new CustomEvent(EXHIBIT_REVEAL, { bubbles: true }))).toBe(true);
   });

   it("keeps Knowledge Scratch apart from the Lesson's, in the same tab-level store", () => {
      const item = entry();
      render(
         <ReaderToolStoreProvider>
            <ReaderModeProvider mode="study">
               <div data-testid="knowledge">{knowledgeTools(item)}</div>
               <div data-testid="lesson"><LessonFolio entries={[]} /></div>
            </ReaderModeProvider>
         </ReaderToolStoreProvider>
      );
      fireEvent.change(within(screen.getByTestId("knowledge")).getByLabelText("Scratch"), { target: { value: "kv sums" } });
      expect(within(screen.getByTestId("lesson")).getByLabelText("Scratch")).toHaveValue("");
      expect(within(screen.getByTestId("knowledge")).getByText("Not saved or synced. Kept while this tab is open; reloading clears it.")).toBeInTheDocument();
   });

   it("names Now reading by section in reading order, and writes nothing to browser storage", () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      page(entry([section("failure_modes"), section("definition")]));
      fireEvent.change(screen.getByLabelText("Scratch"), { target: { value: "note" } });
      expect(screen.getByRole("heading", { name: "Now reading" }).nextElementSibling).toHaveTextContent("The opening");
      expect(setItem).not.toHaveBeenCalled();
      setItem.mockRestore();
   });
});

describe("the current section under depth", () => {
   it("never reports a heading the page does not render", () => {
      function Probe() {
         const [active] = useActiveHeading(["a", "b"], 100);
         return <p role="status">{active ?? "none"}</p>;
      }
      const observers: IntersectionObserverCallback[] = [];
      vi.stubGlobal("IntersectionObserver", class {
         constructor(callback: IntersectionObserverCallback) { observers.push(callback); }
         observe() {}
         disconnect() {}
      });
      render(<><h2 id="a">A</h2><h2 id="b">B</h2><Probe /></>);
      const [a, b] = ["a", "b"].map((id) => document.getElementById(id)!);
      a.getBoundingClientRect = () => ({ top: -200 }) as DOMRect;
      b.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
      b.checkVisibility = () => false;
      act(() => observers[0]([], {} as IntersectionObserver));
      expect(screen.getByRole("status")).toHaveTextContent("a");
      vi.unstubAllGlobals();
   });
});
