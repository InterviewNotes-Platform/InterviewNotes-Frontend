import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCatalogItem = vi.hoisted(() => vi.fn());
vi.mock("@/lib/catalog/client", () => ({ getCatalogItem }));

import type { CatalogHeading, CatalogItem } from "@/lib/catalog/types";
import {
   BEHAVIORAL_LESSONS,
   loadBehavioralQuestions,
   questionsOf,
   relateToCatalog,
   type BehavioralLesson,
   type CatalogQuestion,
} from "./questions";

/*
 * Fixtures (src/lib/prep/fixtures): the four Lessons byte for byte from content branch
 * feat/p7-behavioral-question-ids @ f7bc7e1 (P7-T17C), and `headings.json`, the `headings[]` that backend `dev`
 * b7646ed `scan_body` produces for them.
 */
const FIXTURES = join(__dirname, "fixtures");
const HEADINGS: Record<string, CatalogHeading[]> = JSON.parse(readFileSync(join(FIXTURES, "headings.json"), "utf8"));

function lessonText(slug: string): string {
   return readFileSync(join(FIXTURES, `${slug}.md`), "utf8");
}

function itemOf(lesson: BehavioralLesson, overrides: Partial<Pick<CatalogItem, "body" | "headings">> = {}): CatalogItem {
   const body = lessonText(lesson.slug).replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^\n+/, "");
   return {
      id: lesson.content_id,
      type: "lesson",
      slug: lesson.slug,
      title: "Synthetic Lesson",
      summary: "Synthetic test fixture",
      tags: [],
      category: null,
      difficulty: null,
      level: null,
      access: "free",
      body: { format: "markdown@1", text: body },
      headings: HEADINGS[lesson.slug],
      sections: [],
      sections_withheld: false,
      ...overrides,
   };
}

const [SDE_1, SDE_2, SDE_3, MANAGER] = BEHAVIORAL_LESSONS;
const questionsFor = (lesson: BehavioralLesson) => questionsOf(lesson, itemOf(lesson));

// The 40 `(content_id, question_id)` pairs, written out by hand from content f7bc7e1 and P7-D-048.
const MANIFEST: Record<string, string[]> = {
   "lesson.behavioral-prep-sde-1": [
      "a-piece-of-work-that-was-clearly-yours",
      "being-stuck",
      "feedback-that-was-hard-to-hear",
      "a-mistake-that-affected-someone-else",
      "learning-something-quickly",
      "disagreeing-with-a-teammate",
      "more-work-than-time",
      "helping-someone-who-was-struggling",
      "requirements-that-weren-t-clear",
      "something-nobody-asked-for",
   ],
   "lesson.behavioral-prep-sde-2": [
      "a-project-you-owned-from-start-to-launch",
      "when-the-plan-slipped",
      "a-technical-disagreement-you-did-not-decide",
      "depending-on-a-team-with-other-priorities",
      "hard-feedback-for-a-peer",
      "improving-how-the-team-works",
      "a-serious-bug-or-incident",
      "turning-a-vague-goal-into-something-concrete",
      "helping-a-newer-engineer-get-productive",
      "shipping-sooner-or-shipping-more-carefully",
   ],
   "lesson.behavioral-prep-sde-3": [
      "a-technical-direction-several-teams-adopted",
      "changing-your-mind-after-others-had-built-on-it",
      "helping-strong-engineers-reach-a-decision",
      "a-problem-nobody-asked-you-to-solve",
      "an-unwelcome-technical-message",
      "developing-other-engineers",
      "a-project-that-failed-or-was-stopped",
      "deciding-with-incomplete-information",
      "delivery-pressure-and-technical-health",
      "a-reliability-problem-that-crossed-teams",
   ],
   "lesson.behavioral-prep-engineering-manager": [
      "feedback-that-was-hard-to-hear",
      "an-engineer-below-what-the-role-needs",
      "a-hiring-decision-you-would-make-differently",
      "conflict-between-two-engineers",
      "a-commitment-at-risk",
      "saying-no-to-a-partner",
      "helping-an-engineer-grow",
      "onboarding-someone-onto-the-team",
      "when-trust-or-morale-dropped",
      "a-decision-from-above-you-disagreed-with",
   ],
};

const pairs = (questions: CatalogQuestion[]) => questions.map(({ content_id, question_id }) => `${content_id} ${question_id}`);
const expectedPairs = Object.entries(MANIFEST).flatMap(([contentId, ids]) => ids.map((id) => `${contentId} ${id}`));

describe("the 40-question manifest", () => {
   const all = BEHAVIORAL_LESSONS.flatMap(questionsFor);

   it("uses the immutable Lesson IDs of the catalog, not file slugs", () => {
      expect(BEHAVIORAL_LESSONS.map((lesson) => lesson.content_id)).toEqual(Object.keys(MANIFEST));
      for (const lesson of BEHAVIORAL_LESSONS) {
         expect(lessonText(lesson.slug)).toContain(`\nid: ${lesson.content_id}\n`);
      }
   });

   it("matches every expected (content_id, question_id) pair, in order, with none missing, changed, duplicated or extra", () => {
      expect(expectedPairs).toHaveLength(40);
      expect(new Set(expectedPairs).size).toBe(40);
      expect(pairs(all)).toEqual(expectedPairs);
   });

   it("has the two P7-D-048 identifiers, each within 48 characters", () => {
      expect(pairs(all)).toContain("lesson.behavioral-prep-sde-2 a-technical-disagreement-you-did-not-decide");
      expect(pairs(all)).toContain("lesson.behavioral-prep-engineering-manager an-engineer-below-what-the-role-needs");
      expect(all.every(({ question_id }) => question_id.length <= 48)).toBe(true);
   });

   it("has 10 questions per Lesson, 40 in all, and zero fallbacks", () => {
      for (const lesson of BEHAVIORAL_LESSONS) expect(questionsFor(lesson)).toHaveLength(10);
      expect(all).toHaveLength(40);
      expect(all.filter((question) => question.snapshot_fallback)).toEqual([]);
   });

   it("takes each text from its The question: line, without quotation marks", () => {
      expect(all.find((q) => q.question_id === "being-stuck")?.text).toBe(
         "Describe a time you were stuck and did not know what to try next."
      );
      expect(all.every((q) => !/^["“]|["”]$/.test(q.text) && q.text.length > 0)).toBe(true);
      expect(all.some((q) => q.text === q.question_id)).toBe(false);
   });
});

describe("exclusions and authored identifiers", () => {
   it("finds 44 The question: lines in the Lessons and still yields 40 questions", () => {
      const lines = BEHAVIORAL_LESSONS.flatMap(({ slug }) => lessonText(slug).split("\n")).filter((line) => line.startsWith("The question:"));
      expect(lines).toHaveLength(44);
      expect(BEHAVIORAL_LESSONS.flatMap(questionsFor)).toHaveLength(40);
   });

   it("drops What fits at this level and Worked example: sections even when marked authored", () => {
      const headings = HEADINGS[SDE_1.slug].map((heading) => ({ ...heading, authored: true }));
      expect(headings.filter((h) => h.text === "What fits at this level" || h.text.startsWith("Worked example:"))).toHaveLength(3);
      const found = questionsOf(SDE_1, itemOf(SDE_1, { headings }));
      expect(found).toHaveLength(10);
      expect(found.map((q) => q.question_id)).toEqual(MANIFEST[SDE_1.content_id]);
   });

   it("never offers a heading without authored: true, and never substitutes a slug", () => {
      const slugged = HEADINGS[SDE_1.slug].map((heading) => ({ ...heading, authored: false }));
      expect(questionsOf(SDE_1, itemOf(SDE_1, { headings: slugged }))).toEqual([]);
      const older = HEADINGS[SDE_1.slug].map(({ id, level, text }) => ({ id, level, text }));
      expect(questionsOf(SDE_1, itemOf(SDE_1, { headings: older }))).toEqual([]);
   });

   it("ignores an authored heading that is not level 2", () => {
      const headings = [{ id: "deep", level: 3, text: "Deep", authored: true }];
      const body = { format: "markdown@1" as const, text: '### Deep {#deep}\n\nThe question: "Q?"\n' };
      expect(questionsOf(SDE_1, itemOf(SDE_1, { headings, body }))).toEqual([]);
   });

   it("ignores a The question: line inside a code fence or a different section", () => {
      const body = {
         format: "markdown@1" as const,
         text: '## A {#a}\n\n```\nThe question: "Fenced"\n```\n\nThe question: "Real"\n\n## B {#b}\n\nNo line here.\n',
      };
      const headings = [
         { id: "a", level: 2, text: "A", authored: true },
         { id: "b", level: 2, text: "B", authored: true },
      ];
      const found = questionsOf(SDE_1, itemOf(SDE_1, { headings, body }));
      expect(found.map(({ question_id, text, snapshot_fallback }) => ({ question_id, text, snapshot_fallback }))).toEqual([
         { question_id: "a", text: "Real", snapshot_fallback: false },
         { question_id: "b", text: "B", snapshot_fallback: true },
      ]);
   });

   it("unwraps straight and curly quotation marks and leaves an unquoted line as written", () => {
      const lines = ['The question: "Straight?"', "The question: “Curly?”", "The question: Bare?"];
      const body = { format: "markdown@1" as const, text: lines.map((line, i) => `## H${i} {#h${i}}\n\n${line}\n`).join("\n") };
      const headings = lines.map((_, i) => ({ id: `h${i}`, level: 2, text: `H${i}`, authored: true }));
      expect(questionsOf(SDE_1, itemOf(SDE_1, { headings, body })).map((q) => q.text)).toEqual(["Straight?", "Curly?", "Bare?"]);
   });
});

describe("identity and snapshot states", () => {
   const saved = (question: CatalogQuestion) => ({
      content_id: question.content_id,
      question_id: question.question_id,
      question_snapshot: question.text,
      snapshot_fallback: question.snapshot_fallback,
   });
   const catalog = BEHAVIORAL_LESSONS.flatMap(questionsFor);
   const stuck = catalog.find((q) => q.question_id === "being-stuck")!;

   it("keeps the identity when a heading is renamed", () => {
      const headings = HEADINGS[SDE_1.slug].map((h) => (h.id === "being-stuck" ? { ...h, text: "When you hit a wall" } : h));
      const body = itemOf(SDE_1).body!;
      const renamed = { format: body.format, text: body.text.replace("## Being stuck {#being-stuck}", "## When you hit a wall {#being-stuck}") };
      expect(renamed.text).not.toBe(body.text);
      const found = questionsOf(SDE_1, itemOf(SDE_1, { headings, body: renamed })).find((q) => q.question_id === "being-stuck");
      expect(found).toEqual(stuck);
      expect(relateToCatalog(saved(stuck), [found!]).state).toBe("current");
   });

   it("reports current when the text matches the snapshot", () => {
      expect(relateToCatalog(saved(stuck), catalog)).toEqual({
         state: "current",
         snapshot: stuck.text,
         snapshot_fallback: false,
         question: stuck,
      });
   });

   it("reports changed, and returns the original snapshot, when The question: line is edited", () => {
      const body = itemOf(SDE_1).body!;
      const edited = { format: body.format, text: body.text.replace("Describe a time you were stuck", "Tell me about when you were stuck") };
      const now = questionsOf(SDE_1, itemOf(SDE_1, { body: edited }));
      const relation = relateToCatalog(saved(stuck), now);
      expect(relation.state).toBe("changed");
      expect(relation.snapshot).toBe("Describe a time you were stuck and did not know what to try next.");
      expect(relation.question?.text).toBe("Tell me about when you were stuck and did not know what to try next.");
   });

   it("reports removed, and returns the original snapshot, when the identifier is gone", () => {
      const headings = HEADINGS[SDE_1.slug].filter((h) => h.id !== "being-stuck");
      const now = questionsOf(SDE_1, itemOf(SDE_1, { headings }));
      expect(now).toHaveLength(9);
      expect(relateToCatalog(saved(stuck), now)).toEqual({
         state: "removed",
         snapshot: stuck.text,
         snapshot_fallback: false,
         question: null,
      });
   });

   it("matches on the pair: the same question_id in another Lesson is not the same question", () => {
      const feedbackSde1 = catalog.find((q) => q.content_id === SDE_1.content_id && q.question_id === "feedback-that-was-hard-to-hear")!;
      const feedbackManager = catalog.find((q) => q.content_id === MANAGER.content_id && q.question_id === "feedback-that-was-hard-to-hear")!;
      expect(feedbackManager.text).not.toBe(feedbackSde1.text);
      expect(relateToCatalog(saved(feedbackSde1), [feedbackManager]).state).toBe("removed");
   });

   it("keeps a fallback snapshot flagged and reports changed once the real line exists", () => {
      const fallback = { ...saved(stuck), question_snapshot: "Being stuck", snapshot_fallback: true };
      const relation = relateToCatalog(fallback, catalog);
      expect(relation).toMatchObject({ state: "changed", snapshot: "Being stuck", snapshot_fallback: true });
   });
});

describe("loadBehavioralQuestions", () => {
   beforeEach(() => {
      getCatalogItem.mockReset();
      getCatalogItem.mockImplementation(async (_type: string, slug: string) => {
         const lesson = BEHAVIORAL_LESSONS.find((candidate) => candidate.slug === slug)!;
         return { status: "ok", data: itemOf(lesson) };
      });
   });

   it("reads each Lesson once per load: 4 catalog reads for 40 questions", async () => {
      const result = await loadBehavioralQuestions();
      expect(result.status === "ok" && pairs(result.data)).toEqual(expectedPairs);
      expect(getCatalogItem).toHaveBeenCalledTimes(4);
      expect(getCatalogItem.mock.calls.map(([type, slug]) => `${type}:${slug}`).sort()).toEqual(
         BEHAVIORAL_LESSONS.map(({ slug }) => `lesson:${slug}`).sort()
      );
   });

   it("returns the failed read instead of partial questions", async () => {
      getCatalogItem.mockImplementation(async (_type: string, slug: string) =>
         slug === SDE_3.slug ? { status: "unavailable", cause: "upstream" } : { status: "ok", data: itemOf(BEHAVIORAL_LESSONS.find((l) => l.slug === slug)!) }
      );
      expect(await loadBehavioralQuestions()).toEqual({ status: "unavailable", cause: "upstream" });
      expect(getCatalogItem).toHaveBeenCalledTimes(4);
   });

   it("fails closed when every read succeeds but no heading is authored, instead of an ok empty source", async () => {
      const unauthored = (slug: string) => HEADINGS[slug].map(({ id, level, text }) => ({ id, level, text, authored: false }));
      getCatalogItem.mockImplementation(async (_type: string, slug: string) => {
         const lesson = BEHAVIORAL_LESSONS.find((l) => l.slug === slug)!;
         return { status: "ok", data: itemOf(lesson, { headings: unauthored(slug) }) };
      });
      expect(await loadBehavioralQuestions()).toEqual({ status: "unavailable", cause: "malformed" });
      expect(getCatalogItem).toHaveBeenCalledTimes(4);
   });

   it("fails closed when one Lesson has no authored question while the others do", async () => {
      getCatalogItem.mockImplementation(async (_type: string, slug: string) => {
         const lesson = BEHAVIORAL_LESSONS.find((l) => l.slug === slug)!;
         const headings = slug === SDE_3.slug ? HEADINGS[slug].map((h) => ({ ...h, authored: false })) : undefined;
         return { status: "ok", data: itemOf(lesson, headings ? { headings } : {}) };
      });
      expect(await loadBehavioralQuestions()).toEqual({ status: "unavailable", cause: "malformed" });
   });

   it("still reports a single absent identifier as removed from an otherwise available source", async () => {
      getCatalogItem.mockImplementation(async (_type: string, slug: string) => {
         const lesson = BEHAVIORAL_LESSONS.find((l) => l.slug === slug)!;
         const headings = slug === SDE_1.slug ? HEADINGS[slug].filter((h) => h.id !== "being-stuck") : HEADINGS[slug];
         return { status: "ok", data: itemOf(lesson, { headings }) };
      });
      const result = await loadBehavioralQuestions();
      if (result.status !== "ok") throw new Error("expected ok");
      expect(result.data).toHaveLength(39);
      const saved = { content_id: SDE_1.content_id, question_id: "being-stuck", question_snapshot: "Kept text.", snapshot_fallback: false };
      expect(relateToCatalog(saved, result.data)).toMatchObject({ state: "removed", snapshot: "Kept text.", question: null });
   });

   it("refuses a Lesson whose id is not the immutable content ID", async () => {
      getCatalogItem.mockImplementation(async (_type: string, slug: string) => {
         const lesson = BEHAVIORAL_LESSONS.find((l) => l.slug === slug)!;
         return { status: "ok", data: { ...itemOf(lesson), id: slug === SDE_2.slug ? "lesson.other" : lesson.content_id } };
      });
      expect(await loadBehavioralQuestions()).toEqual({ status: "unavailable", cause: "malformed" });
   });
});
