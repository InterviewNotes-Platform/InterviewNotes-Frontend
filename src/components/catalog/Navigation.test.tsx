import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ItemNavigation as ItemNavigationData, TrackPlacement } from "@/lib/catalog/navigation";
import type { CatalogMeta, CatalogModule, CatalogOutlineEntry, CatalogTrack } from "@/lib/catalog/types";

// Expose Link's `prefetch` so the test can see which targets are never prefetched.
vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return {
      default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) =>
         createElement("a", { "data-prefetch": String(prefetch), ...props }),
   };
});

import { ItemNavigation } from "./ItemNavigation";
import { RelatedContent } from "./RelatedContent";
import { AlternateTracks, TrackBreadcrumb, TrackPrevNext } from "./TrackContext";
import { ModuleNavigation, TrackOutline } from "./TrackOutline";

const CANONICAL = /^\/(lessons|problems|knowledge|tracks)\/[a-z0-9]+(-[a-z0-9]+)*$/;

const entry = (id: string, over: Partial<CatalogOutlineEntry> = {}): CatalogOutlineEntry => {
   const [type, slug] = id.split(".");
   return { id, type: type as CatalogOutlineEntry["type"], slug, title: `Title ${slug}`, access: "free", primary: true, ...over };
};
const meta = (id: string, over: Partial<CatalogMeta> = {}): CatalogMeta => {
   const [type, slug] = id.split(".");
   return { id, type: type as CatalogMeta["type"], slug, title: `Title ${slug}`, summary: `Summary ${slug}`, tags: [], difficulty: null, level: null, access: "free", ...over };
};
const mod = (key: string, items: CatalogOutlineEntry[]): CatalogModule => ({ key, title: `Module ${key}`, position: 0, items });
const track = (slug: string, modules: CatalogModule[]): CatalogTrack => ({ id: `track.${slug}`, slug, title: `Track ${slug}`, summary: "", modules });

// Neither modules nor items are alphabetical: the rendered order must be the data's order.
const TRACK = track("home", [
   mod("second", [entry("lesson.zeta"), entry("problem.mid", { access: "premium" })]),
   mod("first", [entry("lesson.alpha")]),
]);
const placement = (t: CatalogTrack, previous: string | null, next: string | null): TrackPlacement => ({
   track: t,
   module: t.modules[0],
   previous: previous ? entry(previous) : null,
   next: next ? entry(next) : null,
});
const hrefs = () => screen.getAllByRole("link").map((link) => link.getAttribute("href"));

describe("TrackOutline", () => {
   it("keeps the backend's module and item order and links each item canonically", () => {
      render(<TrackOutline track={TRACK} />);
      expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Module second", "Module first"]);
      expect(hrefs()).toEqual(["/lessons/zeta", "/problems/mid", "/lessons/alpha"]);
   });

   it("distinguishes modules from the items they contain", () => {
      render(<TrackOutline track={TRACK} />);
      const second = screen.getByRole("heading", { name: "Module second" }).closest("section")!;
      expect(within(second).getAllByRole("link").map((l) => l.textContent)).toEqual(["Title zeta", "Title mid"]);
      expect(within(second).queryByText("Title alpha")).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Module second" })).not.toBeInTheDocument();
   });

   it("marks only the current item, by the backend's id", () => {
      render(<TrackOutline track={TRACK} currentId="problem.mid" />);
      const current = screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
      expect(current.map((link) => link.textContent)).toEqual(["Title mid"]);
   });

   it("marks nothing when the current item is not in the outline", () => {
      render(<TrackOutline track={TRACK} currentId="lesson.absent" />);
      expect(document.querySelector("[aria-current]")).toBeNull();
   });

   it("says so for a Track or module with nothing in it", () => {
      render(<TrackOutline track={track("empty", [])} />);
      expect(screen.getByText("This Track has no published content yet.")).toBeInTheDocument();
      render(<TrackOutline track={track("hollow", [mod("m", [])])} />);
      expect(screen.getByText("No published items.")).toBeInTheDocument();
   });

   it("marks premium items and never prefetches them", () => {
      render(<TrackOutline track={TRACK} />);
      const premium = screen.getByRole("link", { name: "Title mid" });
      expect(premium).toHaveAttribute("data-prefetch", "false");
      expect(premium.parentElement).toHaveTextContent("Premium");
      expect(screen.getByRole("link", { name: "Title zeta" })).not.toHaveAttribute("data-prefetch", "false");
   });

   it("drops an entry that cannot map to a canonical route instead of linking it", () => {
      const bad = entry("lesson.bad", { type: "problem", title: "Unsafe entry" });
      render(<TrackOutline track={track("t", [mod("m", [entry("lesson.ok"), bad])])} />);
      expect(screen.queryByText("Unsafe entry")).not.toBeInTheDocument();
      expect(hrefs()).toEqual(["/lessons/ok"]);
   });
});

describe("ModuleNavigation", () => {
   it("lists the module's members in backend order with the current one marked", () => {
      render(<ModuleNavigation module={TRACK.modules[0]} currentId="lesson.zeta" />);
      expect(screen.getByRole("navigation", { name: "Module: Module second" })).toBeInTheDocument();
      expect(hrefs()).toEqual(["/lessons/zeta", "/problems/mid"]);
      expect(screen.getByRole("link", { name: "Title zeta" })).toHaveAttribute("aria-current", "page");
   });

   it("handles a module with no members", () => {
      render(<ModuleNavigation module={mod("m", [])} />);
      expect(screen.getByText("No published items.")).toBeInTheDocument();
   });
});

describe("TrackPrevNext", () => {
   it("shows only Next for the first item", () => {
      render(<TrackPrevNext placement={placement(TRACK, null, "lesson.b")} />);
      expect(screen.queryByRole("link", { name: /Previous/ })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute("href", "/lessons/b");
   });

   it("shows only Previous for the last item", () => {
      render(<TrackPrevNext placement={placement(TRACK, "lesson.a", null)} />);
      expect(screen.getByRole("link", { name: /Previous/ })).toHaveAttribute("href", "/lessons/a");
      expect(screen.queryByRole("link", { name: /Next/ })).not.toBeInTheDocument();
   });

   it("shows both for a middle item, within the named Track", () => {
      render(<TrackPrevNext placement={placement(TRACK, "lesson.a", "problem.c")} />);
      expect(screen.getByRole("navigation", { name: "Previous and next in Track home" })).toBeInTheDocument();
      expect(hrefs()).toEqual(["/lessons/a", "/problems/c"]);
   });

   it("renders nothing for a Track of one", () => {
      const { container } = render(<TrackPrevNext placement={placement(TRACK, null, null)} />);
      expect(container).toBeEmptyDOMElement();
   });
});

describe("TrackBreadcrumb", () => {
   it("links the home Track canonically and shows the module as plain context", () => {
      render(<TrackBreadcrumb placement={placement(TRACK, null, null)} />);
      expect(screen.getByRole("link", { name: "Track home" })).toHaveAttribute("href", "/tracks/home");
      expect(screen.getByText("Module second")).toBeInTheDocument();
      expect(screen.getAllByRole("link")).toHaveLength(1);
   });
});

describe("AlternateTracks", () => {
   const alt = placement(track("other", [mod("x", [])]), null, null);

   it("links each alternate Track and says it is navigation, not a second address", () => {
      render(<AlternateTracks placements={[alt]} />);
      expect(screen.getByRole("link", { name: "Track other" })).toHaveAttribute("href", "/tracks/other");
      expect(screen.getByText(/one canonical address/)).toBeInTheDocument();
      expect(hrefs().every((href) => href && CANONICAL.test(href))).toBe(true);
   });

   it("renders nothing when there are none", () => {
      const { container } = render(<AlternateTracks placements={[]} />);
      expect(container).toBeEmptyDOMElement();
   });
});

describe("RelatedContent", () => {
   const RELATIONS = {
      prerequisite: [meta("knowledge.zz"), meta("lesson.aa")],
      applied_in: [meta("problem.pp", { access: "premium", summary: "Premium teaser" })],
   };

   it("renders groups and items in backend order, linking canonical routes and keeping types distinct", () => {
      render(<RelatedContent relations={RELATIONS} />);
      expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Read first", "Applied in"]);
      expect(hrefs()).toEqual(["/knowledge/zz", "/lessons/aa", "/problems/pp"]);
      expect(screen.getByText("Knowledge")).toBeInTheDocument();
      expect(screen.getByText("Lesson")).toBeInTheDocument();
      expect(screen.getByText("Problem")).toBeInTheDocument();
   });

   it("renders nothing for no relations, or only empty groups", () => {
      expect(render(<RelatedContent relations={{}} />).container).toBeEmptyDOMElement();
      expect(render(<RelatedContent relations={{ related: [] }} />).container).toBeEmptyDOMElement();
   });

   it("shows a gated target as exposed metadata only, marked premium, still linking its canonical page", () => {
      render(<RelatedContent relations={RELATIONS} />);
      const link = screen.getByRole("link", { name: "Title pp" });
      expect(link).toHaveAttribute("href", "/problems/pp");
      expect(link).toHaveAttribute("data-prefetch", "false");
      expect(link.parentElement).toHaveTextContent("Premium");
      expect(screen.getByText("Premium teaser")).toBeInTheDocument();
   });

   it.each([
      ["a type that disagrees with the id", meta("lesson.x", { type: "problem" })],
      ["a path-like slug", meta("lesson.x/../y", { slug: "x/../y" })],
      ["a query-bearing id", meta("lesson.x?branch=main", { slug: "x?branch=main" })],
   ])("generates no link for %s", (_name, bad) => {
      render(<RelatedContent relations={{ related: [meta("lesson.good"), bad] }} />);
      expect(hrefs()).toEqual(["/lessons/good"]);
   });

   it("leaves out a group whose every reference is invalid, heading included", () => {
      render(<RelatedContent relations={{ mentions: [meta("lesson.x", { type: "problem" })] }} />);
      expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
   });

   it("labels an unknown relation by its own name rather than dropping it", () => {
      render(<RelatedContent relations={{ extends_idea: [meta("lesson.x")] }} />);
      expect(screen.getByRole("heading", { level: 3, name: "extends idea" })).toBeInTheDocument();
   });
});

describe("ItemNavigation", () => {
   const full: ItemNavigationData = {
      id: "lesson.zeta",
      relations: { related: [meta("lesson.rel")] },
      home: placement(TRACK, null, "problem.mid"),
      alternates: [placement(track("other", [mod("x", [])]), null, null)],
   };

   it("composes Track navigation, related content and alternates using canonical URLs only", () => {
      render(<ItemNavigation navigation={full} />);
      expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute("href", "/problems/mid");
      expect(screen.getByRole("navigation", { name: "Module: Module second" })).toBeInTheDocument();
      expect(screen.getByText("Full outline of Track home")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Related content" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Also in these Tracks" })).toBeInTheDocument();
      for (const href of hrefs()) expect(href).toMatch(CANONICAL);
   });

   it("fabricates no Track navigation when there is no home Track", () => {
      render(<ItemNavigation navigation={{ ...full, home: null, alternates: [] }} />);
      expect(screen.queryByRole("link", { name: /Next|Previous/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/Full outline/)).not.toBeInTheDocument();
      expect(hrefs()).toEqual(["/lessons/rel"]);
   });

   it("marks the current item in the module list by identity", () => {
      render(<ItemNavigation navigation={full} />);
      const moduleNav = screen.getByRole("navigation", { name: "Module: Module second" });
      expect(within(moduleNav).getByRole("link", { name: "Title zeta" })).toHaveAttribute("aria-current", "page");
   });
});
