import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { outlineOf } from "@/lib/catalog/outline";
import type { CatalogOutlineEntry, CatalogTrack } from "@/lib/catalog/types";
import { TrackSidebar } from "./TrackSidebar";

const entry = (id: string, over: Partial<CatalogOutlineEntry> = {}): CatalogOutlineEntry => {
   const [type, slug] = id.split(".");
   return { id, type: type as CatalogOutlineEntry["type"], slug, title: `Title ${slug}`, access: "free", primary: true, ...over };
};
const TRACK: CatalogTrack = {
   id: "track.t",
   slug: "t",
   title: "Track t",
   summary: "",
   modules: [
      { key: "one", title: "First", position: 1, items: [entry("lesson.a"), entry("lesson.b", { access: "premium" })] },
      { key: "two", title: "Second", position: 2, items: [entry("lesson.c"), entry("problem.p")] },
   ],
};

function renderSidebar(currentId: string) {
   return render(<TrackSidebar outline={outlineOf(TRACK, currentId)!} />);
}

describe("TrackSidebar", () => {
   it("is one navigation landmark named Track contents, headed by a link to the Track", () => {
      renderSidebar("lesson.a");
      const nav = screen.getByRole("navigation", { name: "Track contents" });
      expect(within(nav).getByRole("link", { name: "Track t" })).toHaveAttribute("href", "/tracks/t");
   });

   it("renders every Module's entries in the HTML, as native details, with the current Module open and the rest closed", () => {
      const { container } = renderSidebar("lesson.c");
      const groups = [...container.querySelectorAll("details")];
      expect(groups.map((group) => group.open)).toEqual([false, true]);
      expect(groups[0]).toHaveTextContent("Module 1");
      expect(groups[0]).toHaveTextContent("First");
      expect(groups[1]).toHaveTextContent("Module 2");
      // Closed groups still carry their links in the markup: nothing needs JavaScript to be there.
      expect(container.querySelectorAll("a[href^='/lessons/'], a[href^='/problems/']")).toHaveLength(4);
   });

   it("gives each Module's summary its entry count as text", () => {
      const { container } = renderSidebar("lesson.a");
      expect([...container.querySelectorAll("summary")].map((summary) => summary.textContent)).toEqual(
         expect.arrayContaining([expect.stringContaining("2 items"), expect.stringContaining("2 items")])
      );
   });

   it("marks only the current entry with aria-current=page", () => {
      renderSidebar("lesson.c");
      const current = screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
      expect(current).toHaveLength(1);
      expect(current[0]).toHaveAccessibleName(/Title c/);
      expect(current[0]).toHaveAttribute("href", "/lessons/c");
   });

   it("labels a Problem Practice problem and marks premium access, and nothing else", () => {
      renderSidebar("lesson.a");
      expect(screen.getByRole("link", { name: /Title p/ })).toHaveTextContent("Practice problem");
      expect(screen.getByRole("link", { name: /Title b/ })).toHaveTextContent("Premium");
      expect(screen.getByRole("link", { name: /Title a/ })).not.toHaveTextContent(/Premium|Practice problem/);
   });
});

describe("TrackSidebar title filter (S6-RDR-4, S6-A11Y-4)", () => {
   const filter = () => screen.getByRole("searchbox", { name: "Filter by title" });
   const type = (value: string) => fireEvent.change(filter(), { target: { value } });
   const open = (container: HTMLElement) => [...container.querySelectorAll("details")].map((group) => group.open);

   it("has an accessible name and narrows the rendered list case-insensitively, in order, opening the Modules that match", () => {
      const { container } = renderSidebar("lesson.a");
      expect(open(container)).toEqual([true, false]);
      type("TITLE C");
      expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/tracks/t", "/lessons/c"]);
      expect(open(container)).toEqual([true]);
      type("title");
      expect(open(container)).toEqual([true, true]);
      expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/tracks/t", "/lessons/a", "/lessons/b", "/lessons/c", "/problems/p"]);
   });

   it("announces the result politely, says No entries match when empty, and restores the list when cleared", () => {
      const { container } = renderSidebar("lesson.a");
      const status = screen.getByRole("status");
      expect(status).toHaveTextContent("");
      type("title c");
      expect(status).toHaveTextContent("1 match");
      type("zzz");
      expect(status).toHaveTextContent("No entries match");
      expect(screen.getAllByText("No entries match")).toHaveLength(2);
      expect(container.querySelectorAll("details")).toHaveLength(0);
      type("");
      expect(open(container)).toEqual([true, false]);
      expect(status).toHaveTextContent("");
      expect(screen.queryByText("No entries match")).not.toBeInTheDocument();
   });

   it("makes no request and does not persist the query", () => {
      const fetcher = vi.spyOn(globalThis, "fetch");
      const { unmount } = renderSidebar("lesson.a");
      type("title b");
      expect(fetcher).not.toHaveBeenCalled();
      expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
      unmount();
      renderSidebar("lesson.a");
      expect(filter()).toHaveValue("");
      fetcher.mockRestore();
   });

   it("calls onNavigate for a Track or entry link, and gives the drawer's touch targets 44 px", () => {
      const onNavigate = vi.fn();
      render(<TrackSidebar outline={outlineOf(TRACK, "lesson.a")!} touch onNavigate={onNavigate} />);
      fireEvent.click(screen.getByRole("link", { name: /Title b/ }));
      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("link", { name: /Title b/ })).toHaveClass("min-h-11");
      expect(filter()).toHaveClass("min-h-11");
   });
});
