import { describe, expect, it } from "vitest";
import { isLevelChoiceTrack, LEVEL_CHOICE_TRACKS, levelsOf } from "./levelChoice";
import type { CatalogTrack } from "./types";

const entry = (id: string) => {
   const [type, slug] = id.split(".");
   return { id, type, slug, title: `Title ${slug}`, access: "free", primary: true } as CatalogTrack["modules"][number]["items"][number];
};
const track = (slug: string, modules: string[][]): CatalogTrack => ({
   id: `track.${slug}`,
   slug,
   title: "Track",
   summary: "",
   modules: modules.map((ids, index) => ({ key: `m${index}`, title: `M${index}`, position: index + 1, items: ids.map(entry) })),
});

describe("level-choice Tracks", () => {
   it("lists only the frozen Behavioral Track", () => {
      expect([...LEVEL_CHOICE_TRACKS]).toEqual(["behavioral-interview-preparation"]);
      expect(isLevelChoiceTrack({ slug: "behavioral-interview-preparation" })).toBe(true);
      expect(isLevelChoiceTrack({ slug: "genai-system-design" })).toBe(false);
   });

   it("returns every Lesson in curriculum order and never a Problem", () => {
      const levels = levelsOf(track("behavioral-interview-preparation", [["lesson.a", "problem.p", "lesson.b"], ["lesson.c"]]));
      expect(levels.map(({ id }) => id)).toEqual(["lesson.a", "lesson.b", "lesson.c"]);
   });
});
