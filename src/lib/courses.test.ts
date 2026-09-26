import { describe, expect, it } from "vitest";
import { getGroupedChapters, type Chapter, type Course } from "./courses";

const chapter = (id: string, section: string, order: number): Chapter => ({
  id,
  title: id,
  slug: id,
  courseId: "c1",
  section,
  order,
  isPremium: false,
  estimatedReadTime: 5,
});

describe("getGroupedChapters", () => {
  it("groups chapters by section, preserving chapter order", () => {
    const course = {
      chapters: [chapter("a", "Intro", 1), chapter("b", "Deep Dive", 2), chapter("c", "Intro", 3)],
    } as Course;

    const grouped = getGroupedChapters(course);

    expect(Object.keys(grouped)).toEqual(["Intro", "Deep Dive"]);
    expect(grouped["Intro"].map((c) => c.id)).toEqual(["a", "c"]);
  });
});
