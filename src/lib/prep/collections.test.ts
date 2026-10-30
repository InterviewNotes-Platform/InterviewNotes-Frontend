import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCatalogItem = vi.hoisted(() => vi.fn());
vi.mock("@/lib/catalog/client", () => ({ getCatalogItem }));

import type { CatalogHeading, CatalogItem } from "@/lib/catalog/types";
import { COLLECTIONS, collectionOfContent, findCollection, loadCollectionQuestions, type Collection } from "./collections";
import { loadBehavioralQuestions, type CatalogQuestion } from "./questions";

/*
 * Fixtures (src/lib/prep/fixtures): the two company Lessons byte for byte from content branch feat/p7-company-collections
 * @ b4f81ec (P7-T57's final commit), with `collections-headings.json`, the `headings[]` that backend `dev` 8d73ac2
 * `scan_body` produces for them. The expectations below are written out from the frozen contract `company-collections-
 * contract.md` section 3 (never from the parser under test); the digests come from a separate Python extraction.
 */
const FIXTURES = join(__dirname, "fixtures");
const HEADINGS: Record<string, CatalogHeading[]> = {
   ...JSON.parse(readFileSync(join(FIXTURES, "headings.json"), "utf8")),
   ...JSON.parse(readFileSync(join(FIXTURES, "collections-headings.json"), "utf8")),
};

const AMAZON: [string, string[]][] = [
   ["Customer Obsession", ["alp-customer-obsession-01", "alp-customer-obsession-02", "alp-customer-obsession-03"]],
   ["Ownership", ["alp-ownership-01", "alp-ownership-02", "alp-ownership-03"]],
   ["Invent and Simplify", ["alp-invent-and-simplify-01", "alp-invent-and-simplify-02", "alp-invent-and-simplify-03"]],
   ["Are Right, A Lot", ["alp-are-right-a-lot-01", "alp-are-right-a-lot-02", "alp-are-right-a-lot-03"]],
   ["Learn and Be Curious", ["alp-learn-and-be-curious-01", "alp-learn-and-be-curious-02", "alp-learn-and-be-curious-03"]],
   ["Hire and Develop the Best", ["alp-hire-and-develop-the-best-01", "alp-hire-and-develop-the-best-02", "alp-hire-and-develop-the-best-03"]],
   ["Insist on the Highest Standards", ["alp-insist-on-highest-standards-01", "alp-insist-on-highest-standards-02", "alp-insist-on-highest-standards-03"]],
   ["Think Big", ["alp-think-big-01", "alp-think-big-02", "alp-think-big-03"]],
   ["Bias for Action", ["alp-bias-for-action-01", "alp-bias-for-action-02", "alp-bias-for-action-03"]],
   ["Frugality", ["alp-frugality-01", "alp-frugality-02", "alp-frugality-03"]],
   ["Earn Trust", ["alp-earn-trust-01", "alp-earn-trust-02", "alp-earn-trust-03"]],
   ["Dive Deep", ["alp-dive-deep-01", "alp-dive-deep-02", "alp-dive-deep-03"]],
   ["Have Backbone; Disagree and Commit", ["alp-have-backbone-disagree-and-commit-01", "alp-have-backbone-disagree-and-commit-02", "alp-have-backbone-disagree-and-commit-03"]],
   ["Deliver Results", ["alp-deliver-results-01", "alp-deliver-results-02", "alp-deliver-results-03"]],
   ["Strive to be Earth’s Best Employer", ["alp-strive-to-be-earths-best-employer-01", "alp-strive-to-be-earths-best-employer-02", "alp-strive-to-be-earths-best-employer-03"]],
   ["Success and Scale Bring Broad Responsibility", ["alp-broad-responsibility-01", "alp-broad-responsibility-02", "alp-broad-responsibility-03"]],
];

const GOOGLE: [string, string[]][] = [
   ["Collaboration, respect, and inclusion", ["googleyness-collaboration-respect-inclusion-01", "googleyness-collaboration-respect-inclusion-02", "googleyness-collaboration-respect-inclusion-03"]],
   ["Navigating ambiguity and asking good questions", ["googleyness-ambiguity-clarification-01", "googleyness-ambiguity-clarification-02", "googleyness-ambiguity-clarification-03"]],
   ["Learning and intellectual humility", ["googleyness-learning-intellectual-humility-01", "googleyness-learning-intellectual-humility-02", "googleyness-learning-intellectual-humility-03"]],
   ["Adaptability and resilience", ["googleyness-adaptability-resilience-01", "googleyness-adaptability-resilience-02", "googleyness-adaptability-resilience-03"]],
   ["Leadership without formal authority", ["googleyness-leadership-without-authority-01", "googleyness-leadership-without-authority-02", "googleyness-leadership-without-authority-03"]],
   ["Responsible impact, integrity, and judgment", ["googleyness-responsible-impact-integrity-01", "googleyness-responsible-impact-integrity-02", "googleyness-responsible-impact-integrity-03"]],
];

const AMAZON_ID = "lesson.amazon-leadership-principles";
const GOOGLE_ID = "lesson.googleyness-and-leadership";
const DIGESTS: Record<string, { rows: string; groups: string }> = {
   [AMAZON_ID]: { rows: "aee577a893b32df4991430ee39cb28646af787662223b8ef068a754621e8a086", groups: "82c0f9eba0b233875a91afcacfd53d7bf37976510af2313f0273aef4fa34d906" },
   [GOOGLE_ID]: { rows: "e094acebf8b3f437f747fa8be38d21b04b1d7926e24ee694486eb358c359b94c", groups: "23aa9a2408ba64edf902a65e3e515d78546da368cd875626db19f10075716408" },
};
// The 40 general questions as the P7-T17 source produced them before P7-T58 (content_id, id, level, text, fallback).
const GENERAL_DIGEST = "e2e22753a1a23f3ebb8d754934bf71f7acce4eee762e8db710e662133703d35e";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const collection = (id: string): Collection => findCollection(id)!;
const lessonOf = (id: string) => COLLECTIONS.flatMap(({ lessons }) => lessons).find(({ content_id }) => content_id === id)!;

function itemOf(slug: string, id: string, overrides: Partial<CatalogItem> = {}): CatalogItem {
   const text = readFileSync(join(FIXTURES, `${slug}.md`), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^\n+/, "");
   return {
      id,
      type: "lesson",
      slug,
      title: "Synthetic Lesson",
      summary: "Synthetic test fixture",
      tags: [],
      category: null,
      difficulty: null,
      level: null,
      access: "free",
      body: { format: "markdown@1", text },
      headings: HEADINGS[slug],
      sections: [],
      sections_withheld: false,
      ...overrides,
   };
}

/** Serves every fixture Lesson; `overrides` replaces the response of one slug. */
function serve(overrides: Record<string, unknown> = {}) {
   getCatalogItem.mockReset();
   getCatalogItem.mockImplementation(async (_type: string, slug: string) => {
      if (slug in overrides) return overrides[slug];
      const lesson = COLLECTIONS.flatMap(({ lessons }) => lessons).find((candidate) => candidate.slug === slug)!;
      return { status: "ok", data: itemOf(slug, lesson.content_id) };
   });
}

async function open(id: string, ...rest: Parameters<typeof serve>) {
   serve(...rest);
   const result = await loadCollectionQuestions(collection(id));
   if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
   return result.data;
}

const reads = () => getCatalogItem.mock.calls.map(([type, slug]) => `${type}:${slug}`).sort();
const expectedOf = (rows: [string, string[]][]) => rows.flatMap(([, ids]) => ids);

/** What the manifest check reports for a question list against a Lesson's expected identifiers. */
function manifestDiff(questions: CatalogQuestion<null>[], contentId: string, expected: string[]) {
   const ids = questions.map((question) => question.question_id);
   return {
      missing: expected.filter((id) => !ids.includes(id)),
      unexpected: ids.filter((id) => !expected.includes(id)),
      duplicated: ids.filter((id, index) => ids.indexOf(id) !== index),
      wrongContent: questions.filter((question) => question.content_id !== contentId).map((question) => question.question_id),
      inOrder: JSON.stringify(ids) === JSON.stringify(expected),
   };
}

describe("the registry", () => {
   it("declares exactly three collections, in picker order", () => {
      expect(COLLECTIONS.map(({ id, title }) => [id, title])).toEqual([
         ["behavioral", "General Behavioral"],
         ["amazon", "Amazon Leadership Principles"],
         ["google", "Googleyness & Leadership"],
      ]);
      expect(new Set(COLLECTIONS.map(({ id }) => id)).size).toBe(3);
   });

   it("lists the four Behavioral Lessons for the general collection and one Lesson for each company collection", () => {
      expect(collection("behavioral").lessons.map(({ content_id }) => content_id)).toEqual([
         "lesson.behavioral-prep-sde-1",
         "lesson.behavioral-prep-sde-2",
         "lesson.behavioral-prep-sde-3",
         "lesson.behavioral-prep-engineering-manager",
      ]);
      expect(collection("amazon").lessons).toEqual([{ content_id: AMAZON_ID, slug: "amazon-leadership-principles", level: null }]);
      expect(collection("google").lessons).toEqual([{ content_id: GOOGLE_ID, slug: "googleyness-and-leadership", level: null }]);
   });

   it("applies the level filter to the general collection only", () => {
      expect(COLLECTIONS.map(({ id, levelFilter }) => [id, levelFilter])).toEqual([["behavioral", true], ["amazon", false], ["google", false]]);
      expect(COLLECTIONS.filter(({ grouped }) => grouped).map(({ id }) => id)).toEqual(["amazon", "google"]);
   });

   it("holds the frozen manifests: 40 general, 48 Amazon, 18 Google", () => {
      expect(Object.values(collection("behavioral").manifest).map((ids) => ids.length)).toEqual([10, 10, 10, 10]);
      expect(collection("amazon").manifest).toEqual({ [AMAZON_ID]: expectedOf(AMAZON) });
      expect(collection("google").manifest).toEqual({ [GOOGLE_ID]: expectedOf(GOOGLE) });
      expect(expectedOf(AMAZON)).toHaveLength(48);
      expect(expectedOf(GOOGLE)).toHaveLength(18);
   });

   it("derives the collection of an answer from its content_id", () => {
      expect(collectionOfContent("lesson.behavioral-prep-sde-2")?.id).toBe("behavioral");
      expect(collectionOfContent(AMAZON_ID)?.id).toBe("amazon");
      expect(collectionOfContent(GOOGLE_ID)?.id).toBe("google");
      expect(collectionOfContent("lesson.unknown")).toBeUndefined();
      expect(findCollection("unknown")).toBeUndefined();
   });
});

describe.each([
   ["amazon", AMAZON_ID, AMAZON],
   ["google", GOOGLE_ID, GOOGLE],
] as const)("the %s collection against its manifest", (id, contentId, expectedRows) => {
   const expected = expectedOf(expectedRows);

   it("yields exactly the manifest identifiers, in order, with none missing, unexpected, duplicated or from another Lesson", async () => {
      const questions = await open(id);
      expect(manifestDiff(questions as CatalogQuestion<null>[], contentId, expected)).toEqual({
         missing: [],
         unexpected: [],
         duplicated: [],
         wrongContent: [],
         inOrder: true,
      });
      expect(questions).toHaveLength(expected.length);
      expect(questions.every(({ level }) => level === null)).toBe(true);
   });

   it("assigns each question to the nearest preceding ## group named in the manifest", async () => {
      const questions = await open(id);
      const expectedGroups = expectedRows.flatMap(([label, ids]) => ids.map(() => label));
      expect(questions.map(({ group }) => group?.title)).toEqual(expectedGroups);
   });

   it("takes every snapshot and group explanation from the Lesson text", async () => {
      const questions = await open(id);
      expect(questions.every(({ snapshot_fallback }) => !snapshot_fallback)).toBe(true);
      const rows = questions.map(({ content_id, question_id, group, text }) => `${content_id}\t${question_id}\t${group?.title}\t${text}\n`).join("");
      expect(sha256(rows)).toBe(DIGESTS[contentId].rows);
      const groups = [...new Map(questions.map(({ group }) => [group!.title, group!.explanation])).entries()];
      expect(sha256(groups.map(([title, explanation]) => `${title}\t${explanation}\n`).join(""))).toBe(DIGESTS[contentId].groups);
      expect(groups.every(([, explanation]) => explanation.length > 0 && !explanation.includes("The question:"))).toBe(true);
   });

   it("offers no group heading and no heading without an authored identifier", async () => {
      const questions = await open(id);
      const headings = HEADINGS[contentId.slice("lesson.".length)];
      expect(headings.filter(({ level }) => level === 2).every(({ authored }) => !authored)).toBe(true);
      expect(new Set(questions.map(({ question_id }) => question_id))).toEqual(new Set(headings.filter(({ authored }) => authored).map(({ id }) => id)));
      expect(questions.some(({ question_id, text }) => expectedRows.some(([label]) => label === text || question_id === label))).toBe(false);
   });
});

describe("manifest failures are detected", () => {
   const slug = "amazon-leadership-principles";
   const headings = HEADINGS[slug];
   const questionsWith = async (overrides: Partial<CatalogItem>) =>
      (await open("amazon", { [slug]: { status: "ok", data: itemOf(slug, AMAZON_ID, overrides) } })) as CatalogQuestion<null>[];
   const expected = expectedOf(AMAZON);

   it("reports a missing identifier", async () => {
      const diff = manifestDiff(await questionsWith({ headings: headings.filter(({ id }) => id !== "alp-dive-deep-02") }), AMAZON_ID, expected);
      expect(diff).toMatchObject({ missing: ["alp-dive-deep-02"], unexpected: [], inOrder: false });
   });

   it("reports an unexpected identifier, and an unauthored heading is simply not offered", async () => {
      const extra = { id: "alp-extra-01", level: 3, text: "Extra", authored: true };
      const text = `${itemOf(slug, AMAZON_ID).body!.text}\n### Extra {#alp-extra-01}\n\nThe question: "Extra?"\n`;
      const added = await questionsWith({ headings: [...headings, extra], body: { format: "markdown@1", text } });
      expect(manifestDiff(added, AMAZON_ID, expected)).toMatchObject({ unexpected: ["alp-extra-01"], inOrder: false });
      expect(added.at(-1)?.group?.title).toBe("Success and Scale Bring Broad Responsibility");
      const unauthored = headings.map((heading) => (heading.id === "alp-ownership-01" ? { ...heading, authored: false } : heading));
      expect(manifestDiff(await questionsWith({ headings: unauthored }), AMAZON_ID, expected)).toMatchObject({ missing: ["alp-ownership-01"], unexpected: [] });
   });

   it("never lists a duplicated identifier twice", async () => {
      const duplicated = [...headings, headings.find(({ id }) => id === "alp-frugality-01")!];
      const questions = await questionsWith({ headings: duplicated });
      expect(manifestDiff(questions, AMAZON_ID, expected)).toMatchObject({ duplicated: [], inOrder: true });
      expect(questions).toHaveLength(48);
   });

   it("is not satisfied by a Lesson read under another content ID", async () => {
      serve({ [slug]: { status: "ok", data: itemOf(slug, GOOGLE_ID) } });
      expect(await loadCollectionQuestions(collection("amazon"))).toEqual({ status: "unavailable", cause: "malformed" });
   });

   it("follows the nearest preceding ## heading when a group is renamed", async () => {
      const text = itemOf(slug, AMAZON_ID).body!.text.replace("## Ownership\n", "## Ownership and more\n");
      const questions = await questionsWith({ body: { format: "markdown@1", text } });
      const titles = questions.filter(({ question_id }) => question_id.startsWith("alp-ownership-")).map(({ group }) => group?.title);
      expect(titles).toEqual(["Ownership and more", "Ownership and more", "Ownership and more"]);
      expect(questions.find(({ question_id }) => question_id === "alp-think-big-01")?.group?.title).toBe("Think Big");
   });

   it("flags a missing The question: line as a heading fallback instead of inventing a snapshot", async () => {
      const lines = itemOf(slug, AMAZON_ID).body!.text.split("\n");
      const at = lines.findIndex((line) => line.includes("{#alp-ownership-02}"));
      const next = lines.findIndex((line, index) => index > at && line.startsWith("The question:"));
      const stripped = lines.filter((_, index) => index !== next).join("\n");
      const questions = await questionsWith({ body: { format: "markdown@1", text: stripped } });
      expect(questions.find(({ question_id }) => question_id === "alp-ownership-02")).toMatchObject({
         snapshot_fallback: true,
         text: "Inheriting something fragile",
      });
      expect(questions.filter(({ snapshot_fallback }) => snapshot_fallback)).toHaveLength(1);
   });
});

describe("the general Behavioral collection is unchanged", () => {
   it("yields exactly the 40 questions of P7-T17, in the same order, with the same levels, and none from a company Lesson", async () => {
      const questions = await open("behavioral");
      expect(questions).toHaveLength(40);
      const rows = questions.map((q) => `${q.content_id}\t${q.question_id}\t${q.level}\t${q.text}\t${q.snapshot_fallback}\n`).join("");
      expect(sha256(rows)).toBe(GENERAL_DIGEST);
      expect(questions.filter(({ content_id }) => !content_id.startsWith("lesson.behavioral-prep-"))).toEqual([]);
      expect(questions.every((question) => !("group" in question) && question.level !== null)).toBe(true);
      expect(Object.values(collection("behavioral").manifest).flat()).toEqual(questions.map(({ question_id }) => question_id));
   });

   it("returns the same result as loadBehavioralQuestions", async () => {
      serve();
      const direct = await loadBehavioralQuestions();
      serve();
      expect(await loadCollectionQuestions(collection("behavioral"))).toStrictEqual(direct);
   });
});

describe("catalog reads", () => {
   beforeEach(() => serve());

   it("adds none for the workspace home: the registry is plain data", () => {
      expect(COLLECTIONS).toHaveLength(3);
      findCollection("amazon");
      collectionOfContent(AMAZON_ID);
      expect(getCatalogItem).not.toHaveBeenCalled();
   });

   it.each([
      ["behavioral", 4, ["behavioral-prep-engineering-manager", "behavioral-prep-sde-1", "behavioral-prep-sde-2", "behavioral-prep-sde-3"]],
      ["amazon", 1, ["amazon-leadership-principles"]],
      ["google", 1, ["googleyness-and-leadership"]],
   ])("opening %s makes %i Lesson reads, one per Lesson, and reads no other collection", async (id, count, slugs) => {
      await open(id);
      expect(getCatalogItem).toHaveBeenCalledTimes(count);
      expect(reads()).toEqual(slugs.map((slug) => `lesson:${slug}`));
   });

   it("makes no per-question read: 48 questions cost one read", async () => {
      expect(await open("amazon")).toHaveLength(48);
      expect(getCatalogItem).toHaveBeenCalledTimes(1);
   });

   it.each([["amazon"], ["google"], ["behavioral"]])("hides %s, with no data and no empty list, when a Lesson read fails", async (id) => {
      const slug = collection(id).lessons[collection(id).lessons.length - 1].slug;
      serve({ [slug]: { status: "unavailable", cause: "upstream" } });
      const result = await loadCollectionQuestions(collection(id));
      expect(result).toEqual({ status: "unavailable", cause: "upstream" });
      expect("data" in result).toBe(false);
   });

   it("hides a company collection whose Lesson is not published, instead of showing it empty", async () => {
      serve({ "googleyness-and-leadership": { status: "notFound" } });
      expect(await loadCollectionQuestions(collection("google"))).toEqual({ status: "notFound" });
   });

   it("hides a company collection whose Lesson reads fine but has no authored question", async () => {
      const slug = "amazon-leadership-principles";
      const unauthored = HEADINGS[slug].map((heading) => ({ ...heading, authored: false }));
      serve({ [slug]: { status: "ok", data: itemOf(slug, AMAZON_ID, { headings: unauthored }) } });
      expect(await loadCollectionQuestions(collection("amazon"))).toEqual({ status: "unavailable", cause: "malformed" });
   });

   it("hides a company collection that has a question outside any ## group", async () => {
      const slug = "googleyness-and-leadership";
      const text = itemOf(slug, GOOGLE_ID).body!.text.replace(/^## .*$/gm, "Plain line");
      serve({ [slug]: { status: "ok", data: itemOf(slug, GOOGLE_ID, { body: { format: "markdown@1", text } }) } });
      expect(await loadCollectionQuestions(collection("google"))).toEqual({ status: "unavailable", cause: "malformed" });
      expect(lessonOf(GOOGLE_ID).level).toBeNull();
   });
});
