import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LinkedMeta } from "@/lib/catalog/lesson";
import type { TrackPlacement } from "@/lib/catalog/navigation";
import type { CatalogMeta, CatalogOutlineEntry, CatalogTrack } from "@/lib/catalog/types";

vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return {
      default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) =>
         createElement("a", { "data-prefetch": String(prefetch), ...props }),
   };
});

import { LessonHeader } from "./LessonHeader";
import { PracticeTransition, RelationGroup } from "./LessonRelated";
import { LessonBreadcrumb, TrackPrevNext } from "./TrackContext";

const meta = (id: string, over: Partial<CatalogMeta> = {}): CatalogMeta => {
   const [type, slug] = id.split(".");
   return { id, type: type as CatalogMeta["type"], slug, title: `Title ${slug}`, summary: `Summary ${slug}`, tags: [], category: null, difficulty: null, level: null, access: "free", ...over };
};
const linked = (id: string, over: Partial<CatalogMeta> = {}): LinkedMeta => {
   const entry = meta(id, over);
   return { entry, href: `/${entry.type === "knowledge" ? "knowledge" : `${entry.type}s`}/${entry.slug}` };
};

describe("RelationGroup", () => {
   it("renders nothing at all for an empty group, heading included", () => {
      const { container } = render(<RelationGroup id="g" label="Related Knowledge" rows={[]} />);
      expect(container).toBeEmptyDOMElement();
   });

   it("is a labelled h2 section of canonical, never-prefetched links in the given order", () => {
      render(<RelationGroup id="lesson_related_knowledge" label="Related Knowledge" rows={[linked("knowledge.zeta"), linked("knowledge.alpha")]} />);
      const region = screen.getByRole("region", { name: "Related Knowledge" });
      expect(within(region).getByRole("heading", { level: 2 })).toHaveAttribute("id", "lesson_related_knowledge");
      const links = within(region).getAllByRole("link");
      expect(links.map((link) => link.getAttribute("href"))).toEqual(["/knowledge/zeta", "/knowledge/alpha"]);
      for (const link of links) expect(link).toHaveAttribute("data-prefetch", "false");
   });

   it("keeps its ids out of reach of a heading slug", () => {
      render(<RelationGroup id="lesson_related_knowledge" label="L" rows={[linked("knowledge.a")]} />);
      expect(document.querySelector("[id]")!.id).not.toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
   });

   it("names the type only where a group mixes types, and shows a summary only when asked", () => {
      const rows = [linked("knowledge.base"), linked("lesson.first")];
      const { rerender } = render(<RelationGroup id="g" label="Prerequisites" rows={rows} withType />);
      expect(screen.getByText("Knowledge")).toBeInTheDocument();
      expect(screen.getByText("Lesson")).toBeInTheDocument();
      expect(screen.queryByText("Summary base")).not.toBeInTheDocument();

      rerender(<RelationGroup id="g" label="Related Knowledge" rows={rows} withSummary />);
      expect(screen.queryByText("Knowledge")).not.toBeInTheDocument();
      expect(screen.getByText("Summary base")).toBeInTheDocument();
   });

   it("marks premium targets and shows a Problem's difficulty, as metadata only", () => {
      render(<RelationGroup id="g" label="Related Problems" rows={[linked("problem.hard", { difficulty: "hard", access: "premium" }), linked("problem.plain")]} />);
      const [first, second] = screen.getAllByRole("listitem");
      expect(first).toHaveTextContent("Hard");
      expect(first).toHaveTextContent("Premium");
      expect(second).not.toHaveTextContent(/Premium|Easy|Medium|Hard/);
   });

   it("does not show a Lesson's or Knowledge's own difficulty", () => {
      render(<RelationGroup id="g" label="Related Lessons" rows={[linked("lesson.x", { difficulty: "easy" })]} />);
      expect(screen.getByRole("listitem")).not.toHaveTextContent("Easy");
   });
});

describe("PracticeTransition", () => {
   const problems = [linked("problem.first", { difficulty: "medium" }), linked("problem.second", { access: "premium" })];

   it("renders nothing without Problems", () => {
      expect(render(<PracticeTransition problems={[]} />).container).toBeEmptyDOMElement();
   });

   it("is one prominent 'Ready to apply this?' section with each Problem in the API's order", () => {
      render(<PracticeTransition problems={problems} />);
      const section = screen.getByRole("region", { name: "Ready to apply this?" });
      expect(within(section).getByRole("heading", { level: 2, name: "Ready to apply this?" })).toBeInTheDocument();
      expect(within(section).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
         ["Title first", "/problems/first"],
         ["Title second", "/problems/second"],
      ]);
   });

   it("has one link and one focus stop per Problem, stretched over its row, never prefetched", () => {
      render(<PracticeTransition problems={problems} />);
      for (const link of screen.getAllByRole("link")) {
         expect(link).toHaveClass("after:absolute", "after:inset-0");
         expect(link).toHaveAttribute("data-prefetch", "false");
      }
      expect(screen.getAllByRole("listitem").every((item) => within(item).getAllByRole("link").length === 1)).toBe(true);
      expect(document.querySelector("a a, button")).toBeNull();
   });

   it("marks a premium Problem with the restrained indicator and states difficulty", () => {
      render(<PracticeTransition problems={problems} />);
      const [first, second] = screen.getAllByRole("listitem");
      expect(first).toHaveTextContent("Medium");
      expect(first).not.toHaveTextContent("Premium");
      expect(second).toHaveTextContent("Premium");
   });

   it("keeps each arrow decorative", () => {
      render(<PracticeTransition problems={problems} />);
      const arrows = [...document.querySelectorAll("svg.lucide-arrow-right")];
      expect(arrows).toHaveLength(2);
      for (const arrow of arrows) expect(arrow).toHaveAttribute("aria-hidden", "true");
   });
});

describe("LessonHeader", () => {
   it("puts the title first, then the summary, then one quiet metadata line", () => {
      render(<LessonHeader meta={meta("lesson.x", { level: "foundational", difficulty: "easy", summary: "A summary." })} />);
      expect(screen.getByRole("heading", { level: 1, name: "Title x" })).toBeInTheDocument();
      const line = screen.getByText("Foundational").closest("p")!;
      expect(line).toHaveTextContent(/^Level: Foundational\s*·\s*Difficulty: Easy$/);
      expect(line).not.toHaveTextContent("Premium");
      const header = document.querySelector("header")!;
      expect([...header.children].map((child) => child.tagName)).toEqual(["H1", "P", "P"]);
   });

   it("omits the line for a Lesson with nothing to say, and marks only premium", () => {
      const { rerender } = render(<LessonHeader meta={meta("lesson.x", { summary: "" })} />);
      expect(document.querySelector("header")!.children).toHaveLength(1);
      rerender(<LessonHeader meta={meta("lesson.x", { access: "premium" })} />);
      expect(screen.getByText("Premium")).toBeInTheDocument();
   });
});

const entry = (id: string, over: Partial<CatalogOutlineEntry> = {}): CatalogOutlineEntry => {
   const [type, slug] = id.split(".");
   return { id, type: type as CatalogOutlineEntry["type"], slug, title: `Step ${slug}`, access: "free", primary: true, ...over };
};
const track = (): CatalogTrack => ({
   id: "track.home",
   slug: "home",
   title: "A Rather Long Home Track Title",
   summary: "",
   modules: [{ key: "m", title: "A Rather Long Module Title", position: 0, items: [entry("lesson.a")] }],
});
const placement = (previous: string | null, next: string | null): TrackPlacement => ({
   track: track(),
   module: track().modules[0],
   previousLesson: previous ? entry(previous) : null,
   nextLesson: next ? entry(next, { access: "premium" }) : null,
});

describe("LessonBreadcrumb", () => {
   it("reads Learn / Track / Module, linking Learn and the Track but never the Module", () => {
      render(<LessonBreadcrumb placement={placement(null, null)} />);
      const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
      expect(within(nav).getAllByRole("listitem")).toHaveLength(3);
      expect(within(nav).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
         ["Learn", "/tracks"],
         ["A Rather Long Home Track Title", "/tracks/home"],
      ]);
      expect(within(nav).getByText("A Rather Long Module Title").closest("a")).toBeNull();
      for (const link of within(nav).getAllByRole("link")) expect(link).toHaveAttribute("data-prefetch", "false");
   });

   it("keeps the separators out of the accessibility tree and lets long names truncate instead of wrapping the page", () => {
      render(<LessonBreadcrumb placement={placement(null, null)} />);
      const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
      expect([...nav.querySelectorAll("[aria-hidden='true']")].map((separator) => separator.textContent)).toEqual(["/", "/"]);
      expect(within(nav).getByRole("link", { name: "A Rather Long Home Track Title" })).toHaveClass("truncate", "min-w-0");
      expect(within(nav).getByText("A Rather Long Module Title")).toHaveClass("truncate", "min-w-0");
      expect(nav.querySelector("ol")).toHaveClass("min-w-0");
   });
});

describe("TrackPrevNext, reading", () => {
   it("keeps the labels and canonical links, as open text with no box and no prefetch", () => {
      render(<TrackPrevNext placement={placement("lesson.before", "lesson.after")} reading />);
      const nav = screen.getByRole("navigation", { name: "Previous and next in A Rather Long Home Track Title" });
      const [previous, next] = within(nav).getAllByRole("link");
      expect(previous).toHaveAccessibleName("Previous lesson: Step before");
      expect(previous).toHaveAttribute("href", "/lessons/before");
      expect(next).toHaveAccessibleName("Next lesson: Step after, premium");
      expect(next).toHaveTextContent("Next lesson");
      expect(next).toHaveTextContent("Premium");
      for (const link of [previous, next]) {
         expect(link).toHaveAttribute("data-prefetch", "false");
         expect(link).not.toHaveClass("border", "rounded-lg");
      }
   });

   it("renders nothing for a missing side, and keeps Next at the end of the row", () => {
      render(<TrackPrevNext placement={placement(null, "lesson.after")} reading />);
      expect(screen.getAllByRole("link")).toHaveLength(1);
      expect(screen.getByRole("navigation").children).toHaveLength(1);
      expect(screen.getByRole("link", { name: /^Next lesson/ })).toHaveClass("sm:col-start-2");
   });

   it("never prefetches a neighbour, free or premium, in either presentation", () => {
      render(<TrackPrevNext placement={placement("lesson.before", "lesson.after")} />);
      for (const link of screen.getAllByRole("link")) expect(link).toHaveAttribute("data-prefetch", "false");
   });
});
