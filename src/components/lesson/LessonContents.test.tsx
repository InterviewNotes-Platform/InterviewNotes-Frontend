import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentsEntry } from "@/lib/catalog/lesson";
import { LessonContents } from "./LessonContents";

const ENTRIES: ContentsEntry[] = [
   { id: "why", level: 2, text: "Why it matters" },
   { id: "how", level: 3, text: "How it works" },
   { id: "wrap-up", level: 2, text: "Wrap up" },
];

let observe: (() => void) | null = null;
const scrollIntoView = vi.fn();

function mockReducedMotion(reduce: boolean) {
   vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => {
   vi.useFakeTimers();
   observe = null;
   scrollIntoView.mockClear();
   Element.prototype.scrollIntoView = scrollIntoView;
   vi.stubGlobal(
      "IntersectionObserver",
      class {
         constructor(callback: IntersectionObserverCallback) {
            observe = () => callback([], this as unknown as IntersectionObserver);
         }
         observe() {}
         disconnect() {}
      }
   );
   mockReducedMotion(false);
});
afterEach(() => {
   vi.useRealTimers();
   vi.unstubAllGlobals();
   vi.restoreAllMocks();
});

function show(entries = ENTRIES) {
   return render(
      <>
         <LessonContents entries={entries} />
         {entries.map(({ id, text }) => (
            <h2 key={id} id={id} tabIndex={-1}>
               {text}
            </h2>
         ))}
      </>
   );
}
const desktop = () => screen.getAllByRole("navigation", { name: "Contents" })[1];
const mobile = () => screen.getAllByRole("navigation", { name: "Contents" })[0];
const trigger = () => screen.getByRole("button", { name: "Contents" });
const heading = (id: string) => document.getElementById(id)!;

describe("desktop contents", () => {
   it("is a labelled navigation landmark of real in-page links, sticky from lg", () => {
      show();
      expect(desktop()).toHaveClass("hidden", "lg:block", "sticky");
      expect(within(desktop()).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
         ["Why it matters", "#why"],
         ["How it works", "#how"],
         ["Wrap up", "#wrap-up"],
      ]);
   });

   it("indents h3 entries under their h2 and adds no tab stop beyond the links", () => {
      show();
      const links = within(desktop()).getAllByRole("link");
      expect(links[0]).toHaveClass("pl-3");
      expect(links[1]).toHaveClass("pl-6");
      for (const link of links) expect(link).not.toHaveAttribute("tabindex");
   });

   it("marks the current section with aria-current, following the page as it scrolls", () => {
      show();
      expect(within(desktop()).queryByRole("link", { current: "location" })).not.toBeInTheDocument();

      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
         return { top: ({ why: -400, how: 30, "wrap-up": 600 } as Record<string, number>)[this.id] ?? 0 } as DOMRect;
      });
      act(() => observe!());
      expect(within(desktop()).getByRole("link", { current: "location" })).toHaveTextContent("How it works");
      expect(within(desktop()).getAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toHaveLength(1);
   });

   it("moves focus to the heading on click and scrolls to it, following the page's motion preference", () => {
      show();
      const replace = vi.spyOn(window.history, "replaceState");
      const link = within(desktop()).getByRole("link", { name: "Wrap up" });
      const notPrevented = fireEvent.click(link);

      expect(notPrevented).toBe(false); // the jump is ours, so focus and scroll cannot disagree
      expect(heading("wrap-up")).toHaveFocus();
      expect(replace).toHaveBeenCalledWith(null, "", "#wrap-up");
      expect(within(desktop()).getByRole("link", { name: "Wrap up" })).toHaveAttribute("aria-current", "location");

      act(() => vi.advanceTimersByTime(0));
      expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "start" }); // no `behavior`: the CSS rule decides
   });

   it("keeps the reader's place when the target is missing: nothing moves", () => {
      render(<LessonContents entries={[...ENTRIES, { id: "gone", level: 2, text: "Gone" }]} />);
      fireEvent.click(within(desktop()).getByRole("link", { name: "Gone" }));
      act(() => vi.advanceTimersByTime(500));
      expect(scrollIntoView).not.toHaveBeenCalled();
   });
});

describe("mobile contents", () => {
   it("is a Contents disclosure that starts collapsed, hidden from lg, with an inert panel", () => {
      show();
      expect(trigger()).toHaveAttribute("aria-expanded", "false");
      expect(trigger().closest("div.lg\\:hidden")).toBeInTheDocument();
      const panel = document.getElementById(trigger().getAttribute("aria-controls")!)!;
      expect(panel).toHaveAttribute("inert");
      expect(panel).toContainElement(mobile());
   });

   it("opens and closes from the native button, and says so", () => {
      show();
      fireEvent.click(trigger());
      expect(trigger()).toHaveAttribute("aria-expanded", "true");
      expect(document.getElementById(trigger().getAttribute("aria-controls")!)).not.toHaveAttribute("inert");
      fireEvent.click(trigger());
      expect(trigger()).toHaveAttribute("aria-expanded", "false");
      expect(trigger().tagName).toBe("BUTTON");
   });

   it("makes each entry a 44px touch target", () => {
      show();
      for (const link of within(mobile()).getAllByRole("link")) expect(link).toHaveClass("min-h-11");
   });

   it("closes on selection, keeps focus on the heading, and scrolls only once the panel has collapsed", () => {
      show();
      fireEvent.click(trigger());
      fireEvent.click(within(mobile()).getByRole("link", { name: "How it works" }));

      expect(trigger()).toHaveAttribute("aria-expanded", "false");
      expect(heading("how")).toHaveFocus(); // never stranded inside the panel that is closing
      expect(scrollIntoView).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(219));
      expect(scrollIntoView).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "start" });
   });

   it("does not wait for a collapse that reduced motion makes instant", () => {
      mockReducedMotion(true);
      show();
      fireEvent.click(trigger());
      fireEvent.click(within(mobile()).getByRole("link", { name: "Wrap up" }));
      act(() => vi.advanceTimersByTime(0));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(trigger()).toHaveAttribute("aria-expanded", "false");
   });
});
