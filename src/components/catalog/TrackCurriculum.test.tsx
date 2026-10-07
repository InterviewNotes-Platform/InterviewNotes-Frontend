import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { curriculumOf } from "@/lib/catalog/track";
import type { CatalogModule, CatalogOutlineEntry, CatalogTrack } from "@/lib/catalog/types";

// Expose Link's `prefetch` so the test can see which targets are never prefetched.
vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return {
      default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) =>
         createElement("a", { "data-prefetch": String(prefetch), ...props }),
   };
});

import { curriculumSummary, TrackCurriculum, TrackHeader, TrackSupport } from "./TrackCurriculum";

const entry = (id: string, over: Partial<CatalogOutlineEntry> = {}): CatalogOutlineEntry => {
   const [type, slug] = id.split(".");
   return { id, type: type as CatalogOutlineEntry["type"], slug, title: `Title ${slug}`, access: "free", primary: true, ...over };
};
const mod = (key: string, items: CatalogOutlineEntry[]): CatalogModule => ({ key, title: `Part ${key}`, position: 0, items });
const track = (modules: CatalogModule[], over: Partial<CatalogTrack> = {}): CatalogTrack => ({
   id: "track.home",
   slug: "home",
   title: "Home Track",
   summary: "What this Track covers.",
   modules,
   ...over,
});

const TRACK = track([
   mod("basics", [entry("lesson.alpha"), entry("problem.beta")]),
   mod("depth", [entry("lesson.gamma", { access: "premium" }), entry("lesson.delta")]),
   mod("later", []),
]);

const view = (t: CatalogTrack = TRACK, summaries?: ReadonlyMap<string, string> | null) => {
   const curriculum = curriculumOf(t);
   return render(
      <main>
         <TrackHeader track={t} curriculum={curriculum} />
         <TrackCurriculum track={t} curriculum={curriculum} summaries={summaries} />
         <TrackSupport curriculum={curriculum} />
      </main>
   );
};
const moduleButton = (key: string) => screen.getByRole("button", { name: new RegExp(`^Module \\d+ Part ${key}`) });
const panelOf = (button: HTMLElement) => document.getElementById(button.getAttribute("aria-controls")!)!;

describe("TrackHeader", () => {
   it("shows one h1 with the title, the summary and counts derived from the outline", () => {
      view();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1, name: "Home Track" })).toBeInTheDocument();
      expect(screen.getByText("What this Track covers.")).toBeInTheDocument();
      expect(document.querySelector('[data-slot="curriculum-summary"]')).toHaveTextContent(
         "3 modules · 3 lessons · 1 practice problem"
      );
   });

   it("omits a summary the Track does not have instead of inventing one", () => {
      view(track(TRACK.modules, { summary: "" }));
      expect(screen.getByRole("heading", { level: 1 }).parentElement?.querySelectorAll("p")).toHaveLength(3);
   });

   it("invents no outcomes, hours, ratings, learner counts or progress", () => {
      view();
      expect(document.body.textContent).not.toMatch(/\d+\s*(hours?|min|learners?|students?|reviews?|ratings?)|%|★|complete/i);
   });
});

describe("curriculumSummary", () => {
   it("counts only what exists and pluralizes", () => {
      expect(curriculumSummary(curriculumOf(track([mod("a", [entry("lesson.one")])])))).toBe("1 module · 1 lesson");
      expect(curriculumSummary(curriculumOf(track([mod("a", []), mod("b", [])])))).toBe("2 modules");
      expect(curriculumSummary(curriculumOf(track([])))).toBe("");
   });
});

describe("Start action", () => {
   it("is one link to the first Lesson, named for its destination, with the recommendation as its description", () => {
      view();
      const start = screen.getByRole("link", { name: "Start with Title alpha" });
      expect(start).toHaveAttribute("href", "/lessons/alpha");
      expect(screen.getAllByRole("link", { name: /^Start/ })).toHaveLength(1);
      expect(start).toHaveAccessibleDescription("Recommended starting point");
      expect(screen.getByText("Recommended starting point")).toBeInTheDocument();
   });

   it("starts at the first Lesson when a Problem is placed first, in its Module or an earlier one", () => {
      view(track([mod("m", [entry("problem.warmup"), entry("lesson.first")])]));
      expect(screen.getByRole("link", { name: "Start with Title first" })).toHaveAttribute("href", "/lessons/first");
      document.body.innerHTML = "";
      view(track([mod("drills", [entry("problem.a")]), mod("real", [entry("lesson.next")])]));
      expect(screen.getByRole("link", { name: "Start with Title next" })).toHaveAttribute("href", "/lessons/next");
   });

   it("skips empty modules and unlinkable entries", () => {
      const bad = entry("lesson.bad", { type: "problem" });
      view(track([mod("empty", []), mod("broken", [bad]), mod("real", [entry("lesson.first")])]));
      expect(screen.getByRole("link", { name: "Start with Title first" })).toHaveAttribute("href", "/lessons/first");
   });

   it("starts at a premium first Lesson and says it is Premium before it is followed, outside the link name", () => {
      view(track([mod("m", [entry("lesson.paid", { access: "premium" }), entry("lesson.free")])]));
      const start = screen.getByRole("link", { name: "Start with Title paid" });
      expect(start).toHaveAttribute("href", "/lessons/paid");
      expect(start).not.toHaveTextContent("Premium");
      expect(screen.getByText("Recommended starting point").parentElement).toHaveTextContent("Premium");
   });

   it("does not call a free start Premium", () => {
      view(track([mod("m", [entry("lesson.free"), entry("lesson.paid", { access: "premium" })])]));
      expect(screen.getByText("Recommended starting point").parentElement).not.toHaveTextContent("Premium");
   });

   it("uses no progress or learner-state wording", () => {
      view();
      expect(document.body.textContent).not.toMatch(/continue|resume|progress|where you left/i);
   });

   it("is a calm empty state, with no destination invented, when nothing is linkable", () => {
      view(track([mod("empty", []), mod("broken", [entry("lesson.bad", { type: "problem" })])]));
      expect(screen.queryByRole("link", { name: /^Start/ })).not.toBeInTheDocument();
      expect(screen.getByText("Nothing is published in this Track yet.")).toBeInTheDocument();
   });

   it("has no Start and no placeholder for a Track that places only Problems (S-TRK-6)", () => {
      view(track([mod("drills", [entry("problem.a"), entry("problem.b")])]));
      expect(screen.queryByRole("link", { name: /^Start/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/Recommended starting point|Nothing is published/)).not.toBeInTheDocument();
      const outline = screen.getByRole("navigation", { name: "Home Track outline" });
      expect(within(outline).getByRole("link", { name: /Title a/ })).toHaveAttribute("href", "/problems/a");
   });
});

describe("TrackCurriculum modules", () => {
   it("gives each module an h2 with its number, title and Lesson and Problem counts, and opens only the first", () => {
      view();
      expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.replace(/\s+/g, " "))).toEqual([
         "Module 1 Part basics 1 lesson · 1 practice problem",
         "Module 2 Part depth 2 lessons",
         "Module 3 Part later",
         "In this Track",
      ]);
      expect(moduleButton("basics")).toHaveAttribute("aria-expanded", "true");
      expect(moduleButton("depth")).toHaveAttribute("aria-expanded", "false");
      expect(moduleButton("later")).toHaveAttribute("aria-expanded", "false");
   });

   it("shows a collapsed module as its number, title and counts only", () => {
      view();
      expect(moduleButton("depth")).toHaveAccessibleName("Module 2 Part depth 2 lessons");
      expect(panelOf(moduleButton("depth"))).toHaveAttribute("inert");
   });

   it("wires aria-controls to the panel that holds exactly that module's entries", () => {
      view();
      const basics = within(panelOf(moduleButton("basics")));
      expect(basics.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/lessons/alpha", "/problems/beta"]);
      const depth = within(panelOf(moduleButton("depth")));
      expect(depth.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/lessons/gamma", "/lessons/delta"]);
   });

   it("expands and collapses on click, keeping aria-expanded and inert in step", () => {
      view();
      const depth = moduleButton("depth");
      fireEvent.click(depth);
      expect(depth).toHaveAttribute("aria-expanded", "true");
      expect(panelOf(depth)).not.toHaveAttribute("inert");
      fireEvent.click(moduleButton("basics"));
      expect(panelOf(moduleButton("basics"))).toHaveAttribute("inert");
      expect(depth).toHaveAttribute("aria-expanded", "true");
   });

   it("uses native buttons, which Enter and Space activate, and no tabindex tricks", () => {
      view();
      for (const button of screen.getAllByRole("button")) {
         expect(button.tagName).toBe("BUTTON");
         expect(button).not.toHaveAttribute("tabindex");
      }
   });

   it("says so in an empty module instead of rendering a broken list", () => {
      view();
      expect(within(panelOf(moduleButton("later"))).getByText("No published items in this Module yet.")).toBeInTheDocument();
      expect(within(panelOf(moduleButton("later"))).queryByRole("list")).not.toBeInTheDocument();
   });

   it("numbers a module by its place among all modules, empty ones included, and never says 'items'", () => {
      view(track([mod("empty", []), mod("real", [entry("lesson.one")])]));
      expect(moduleButton("empty")).toHaveAccessibleName("Module 1 Part empty");
      expect(moduleButton("real")).toHaveAccessibleName("Module 2 Part real 1 lesson");
      expect(document.body.textContent).not.toMatch(/\d+ items?/);
   });

   it("words each count with the right singular or plural and leaves a zero out", () => {
      view(
         track([
            mod("both", [entry("lesson.a"), entry("problem.b")]),
            mod("many", [entry("lesson.c"), entry("lesson.d"), entry("problem.e"), entry("problem.f"), entry("problem.g")]),
            mod("lessons", [entry("lesson.h")]),
            mod("problems", [entry("problem.i"), entry("problem.j"), entry("problem.k")]),
         ])
      );
      expect(moduleButton("both")).toHaveAccessibleName("Module 1 Part both 1 lesson · 1 practice problem");
      expect(moduleButton("many")).toHaveAccessibleName("Module 2 Part many 2 lessons · 3 practice problems");
      expect(moduleButton("lessons")).toHaveAccessibleName("Module 3 Part lessons 1 lesson");
      expect(moduleButton("problems")).toHaveAccessibleName("Module 4 Part problems 3 practice problems");
      expect(document.body.textContent).not.toMatch(/\b0 (lessons?|practice problems?)/);
   });

   it("separates modules with rules, never cards", () => {
      view();
      for (const disclosure of document.querySelectorAll('[data-slot="disclosure"]')) {
         expect(disclosure.className).toContain("border-t");
         expect(disclosure.className).not.toMatch(/shadow|rounded|bg-/);
      }
   });

   it("creates no Module route: no link points at a module", () => {
      view();
      for (const link of screen.getAllByRole("link")) {
         expect(link.getAttribute("href")).toMatch(/^\/(lessons|problems)\/[a-z-]+$/);
      }
   });

   it("renders no outline for a Track with no modules, leaving the header to say nothing is published", () => {
      view(track([]));
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
      expect(screen.getAllByText(/published/)).toHaveLength(1);
      expect(screen.getByText("Nothing is published in this Track yet.")).toBeInTheDocument();
   });
});

describe("curriculum entries", () => {
   it("are ordered rows with a fixed leading slot, a title and a type label", () => {
      view();
      const rows = within(panelOf(moduleButton("basics"))).getAllByRole("listitem");
      expect(rows).toHaveLength(2);
      for (const row of rows) expect(row.querySelector('[data-slot="entry-leading"]')?.className).toContain("size-8");
      expect(within(rows[0]).getByText("Lesson")).toBeInTheDocument();
      expect(within(rows[0]).getByText("Title alpha")).toBeInTheDocument();
   });

   it("reads a Problem as a practice step, not a library entry", () => {
      view();
      const row = within(panelOf(moduleButton("basics"))).getAllByRole("listitem")[1];
      expect(row).toHaveTextContent("Practice problem");
      expect(row).not.toHaveTextContent(/difficulty|level|tags?/i);
   });

   it("shows a Lesson's summary under its title, whole, and none on a Problem", () => {
      const long = "A long summary that must wrap naturally and never be clamped. ".repeat(6).trim();
      view(TRACK, new Map([["lesson.alpha", long], ["problem.beta", "Must never appear."]]));
      const [lesson, problem] = within(panelOf(moduleButton("basics"))).getAllByRole("listitem");
      expect(within(lesson).getByText(long)).toBeInTheDocument();
      expect(lesson.textContent!.indexOf("Title alpha")).toBeLessThan(lesson.textContent!.indexOf(long));
      expect(within(lesson).getByText(long).className).not.toMatch(/line-clamp|truncate|overflow-hidden|text-ellipsis/);
      expect(problem).toHaveTextContent("Practice problem");
      expect(problem).not.toHaveTextContent("Must never appear.");
   });

   it("maps each summary to its own Lesson by id, across modules", () => {
      view(TRACK, new Map([["lesson.alpha", "Alpha summary."], ["lesson.gamma", "Gamma summary."]]));
      const outline = within(screen.getByRole("navigation", { name: "Home Track outline" }));
      expect(within(outline.getByRole("link", { name: /Title alpha/ })).getByText("Alpha summary.")).toBeInTheDocument();
      expect(within(outline.getByRole("link", { name: /Title gamma/ })).getByText("Gamma summary.")).toBeInTheDocument();
      expect(outline.getByRole("link", { name: /Title delta/ })).not.toHaveTextContent("summary");
      expect(screen.getAllByText(/summary\./)).toHaveLength(2);
   });

   it("shows no summary at all without a completed scan, and no empty summary line", () => {
      for (const summaries of [undefined, null, new Map<string, string>()]) {
         document.body.innerHTML = "";
         view(TRACK, summaries);
         for (const row of screen.getAllByRole("listitem")) expect(row.querySelectorAll("span.mt-1")).toHaveLength(0);
      }
      document.body.innerHTML = "";
      view(TRACK, new Map([["lesson.alpha", ""]]));
      expect(document.querySelectorAll("span.mt-1")).toHaveLength(0);
   });

   it("keeps a Lesson visibly different from a Problem by words and icon, not colour", () => {
      view();
      const [lesson, problem] = within(panelOf(moduleButton("basics"))).getAllByRole("listitem");
      expect(lesson).toHaveTextContent("Lesson");
      expect(problem).toHaveTextContent("Practice problem");
      expect(lesson.querySelector("svg")!.getAttribute("class")).not.toBe(problem.querySelector("svg")!.getAttribute("class"));
   });

   it("shows a Knowledge entry nowhere: a Track places Lessons and Problems only", () => {
      view(track([mod("m", [entry("lesson.one"), entry("knowledge.stray")])]));
      expect(screen.queryByText("Title stray")).not.toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/knowledge/i);
      expect(moduleButton("m")).toHaveAccessibleName("Module 1 Part m 1 lesson");
      expect(screen.getByRole("link", { name: "Start with Title one" })).toHaveAttribute("href", "/lessons/one");
   });

   it("marks premium entries and keeps them linkable", () => {
      view();
      const premium = within(panelOf(moduleButton("depth"))).getByRole("link", { name: /Title gamma/ });
      expect(premium).toHaveAttribute("href", "/lessons/gamma");
      expect(premium).toHaveTextContent("Premium");
      const free = within(panelOf(moduleButton("basics"))).getByRole("link", { name: /Title alpha/ });
      expect(free).not.toHaveTextContent("Premium");
   });

   it("never prefetches a link, free or premium: only following one reads the next page", () => {
      view();
      const links = screen.getAllByRole("link");
      expect(links.length).toBeGreaterThan(4);
      for (const link of links) expect(link, link.outerHTML).toHaveAttribute("data-prefetch", "false");
   });

   it("drops an entry that cannot map to a canonical route, and counts only what it shows", () => {
      view(track([mod("m", [entry("lesson.ok"), entry("lesson.bad", { type: "problem", title: "Unsafe" })])]));
      expect(screen.queryByText("Unsafe")).not.toBeInTheDocument();
      expect(moduleButton("m")).toHaveAccessibleName("Module 1 Part m 1 lesson");
   });

   it("hides decorative icons from assistive technology, since the type is also text", () => {
      view();
      for (const slot of document.querySelectorAll('[data-slot="entry-leading"]')) expect(slot).toHaveAttribute("aria-hidden", "true");
   });

   it("have no interactive element inside another", () => {
      view();
      const interactive = "a[href], button, input, select, textarea, [tabindex]";
      for (const element of document.querySelectorAll(interactive)) {
         expect(element.parentElement?.closest(interactive), element.outerHTML).toBeNull();
      }
   });
});

describe("TrackSupport", () => {
   it("derives Practice context from the outline's own Problem placements", () => {
      view();
      const support = screen.getByRole("region", { name: "In this Track" });
      expect(within(support).getAllByRole("heading").map((h) => h.textContent)).toEqual(["In this Track", "Practice"]);
      expect(within(support).getByText("1 practice problem placed in the curriculum above.")).toBeInTheDocument();
      expect(within(support).getByRole("link", { name: "Title beta" })).toHaveAttribute("href", "/problems/beta");
      expect(support).toHaveTextContent(/Title beta\s*\/ Part basics/);
   });

   it("has no Knowledge context, since Knowledge is not placed in a Track", () => {
      view();
      expect(screen.getByRole("region", { name: "In this Track" })).not.toHaveTextContent(/knowledge/i);
      expect(screen.queryByRole("heading", { name: /knowledge/i })).not.toBeInTheDocument();
   });

   it("renders nothing for a Track with no Problem", () => {
      view(track([mod("m", [entry("lesson.one")])]));
      expect(screen.queryByRole("region", { name: "In this Track" })).not.toBeInTheDocument();
   });
});
