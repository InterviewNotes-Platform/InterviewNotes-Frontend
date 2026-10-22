import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
