import "server-only";

import type { CatalogResult } from "@/lib/catalog/types";
import { BEHAVIORAL_LESSONS, loadLessonQuestions, type CatalogQuestion, type CollectionLesson } from "./questions";
import type { TargetLevel } from "./types";

/*
 * The registry of preparation collections (P7-T58; contract `learning-progress/company-collections-contract.md` §8 and
 * `spec.md` §2.11). It is the only place a collection is declared; nothing is told apart by tag, level or slug pattern.
 */

export type Collection = {
   /** Chosen here, unique in the registry. */
   id: string;
   title: string;
   lessons: readonly CollectionLesson[];
   /** The seniority-level filter applies to the general Behavioral collection only. */
   levelFilter: boolean;
   /** Questions are `###` headings and the group is the nearest preceding `##`; otherwise questions are `##` headings. */
   grouped: boolean;
   /** The expected question identifiers per Lesson, in source order (the manifests of P7-T3.5 and of P7-T51 section 3). */
   manifest: Readonly<Record<string, readonly string[]>>;
};

const GENERAL_MANIFEST = {
   "lesson.behavioral-prep-sde-1": [
      "a-piece-of-work-that-was-clearly-yours", "being-stuck",
      "feedback-that-was-hard-to-hear", "a-mistake-that-affected-someone-else",
      "learning-something-quickly", "disagreeing-with-a-teammate",
      "more-work-than-time", "helping-someone-who-was-struggling",
      "requirements-that-weren-t-clear", "something-nobody-asked-for",
   ],
   "lesson.behavioral-prep-sde-2": [
      "a-project-you-owned-from-start-to-launch", "when-the-plan-slipped",
      "a-technical-disagreement-you-did-not-decide", "depending-on-a-team-with-other-priorities",
      "hard-feedback-for-a-peer", "improving-how-the-team-works",
      "a-serious-bug-or-incident", "turning-a-vague-goal-into-something-concrete",
      "helping-a-newer-engineer-get-productive", "shipping-sooner-or-shipping-more-carefully",
   ],
   "lesson.behavioral-prep-sde-3": [
      "a-technical-direction-several-teams-adopted", "changing-your-mind-after-others-had-built-on-it",
      "helping-strong-engineers-reach-a-decision", "a-problem-nobody-asked-you-to-solve",
      "an-unwelcome-technical-message", "developing-other-engineers",
      "a-project-that-failed-or-was-stopped", "deciding-with-incomplete-information",
      "delivery-pressure-and-technical-health", "a-reliability-problem-that-crossed-teams",
   ],
   "lesson.behavioral-prep-engineering-manager": [
      "feedback-that-was-hard-to-hear", "an-engineer-below-what-the-role-needs",
      "a-hiring-decision-you-would-make-differently", "conflict-between-two-engineers",
      "a-commitment-at-risk", "saying-no-to-a-partner",
      "helping-an-engineer-grow", "onboarding-someone-onto-the-team",
      "when-trust-or-morale-dropped", "a-decision-from-above-you-disagreed-with",
   ],
};

const AMAZON_MANIFEST = {
   "lesson.amazon-leadership-principles": [
      "alp-customer-obsession-01", "alp-customer-obsession-02", "alp-customer-obsession-03",
      "alp-ownership-01", "alp-ownership-02", "alp-ownership-03",
      "alp-invent-and-simplify-01", "alp-invent-and-simplify-02", "alp-invent-and-simplify-03",
      "alp-are-right-a-lot-01", "alp-are-right-a-lot-02", "alp-are-right-a-lot-03",
      "alp-learn-and-be-curious-01", "alp-learn-and-be-curious-02", "alp-learn-and-be-curious-03",
      "alp-hire-and-develop-the-best-01", "alp-hire-and-develop-the-best-02", "alp-hire-and-develop-the-best-03",
      "alp-insist-on-highest-standards-01", "alp-insist-on-highest-standards-02", "alp-insist-on-highest-standards-03",
      "alp-think-big-01", "alp-think-big-02", "alp-think-big-03",
      "alp-bias-for-action-01", "alp-bias-for-action-02", "alp-bias-for-action-03",
      "alp-frugality-01", "alp-frugality-02", "alp-frugality-03",
      "alp-earn-trust-01", "alp-earn-trust-02", "alp-earn-trust-03",
      "alp-dive-deep-01", "alp-dive-deep-02", "alp-dive-deep-03",
      "alp-have-backbone-disagree-and-commit-01", "alp-have-backbone-disagree-and-commit-02", "alp-have-backbone-disagree-and-commit-03",
      "alp-deliver-results-01", "alp-deliver-results-02", "alp-deliver-results-03",
      "alp-strive-to-be-earths-best-employer-01", "alp-strive-to-be-earths-best-employer-02", "alp-strive-to-be-earths-best-employer-03",
      "alp-broad-responsibility-01", "alp-broad-responsibility-02", "alp-broad-responsibility-03",
   ],
};

const GOOGLE_MANIFEST = {
   "lesson.googleyness-and-leadership": [
      "googleyness-collaboration-respect-inclusion-01", "googleyness-collaboration-respect-inclusion-02", "googleyness-collaboration-respect-inclusion-03",
      "googleyness-ambiguity-clarification-01", "googleyness-ambiguity-clarification-02", "googleyness-ambiguity-clarification-03",
      "googleyness-learning-intellectual-humility-01", "googleyness-learning-intellectual-humility-02", "googleyness-learning-intellectual-humility-03",
      "googleyness-adaptability-resilience-01", "googleyness-adaptability-resilience-02", "googleyness-adaptability-resilience-03",
      "googleyness-leadership-without-authority-01", "googleyness-leadership-without-authority-02", "googleyness-leadership-without-authority-03",
      "googleyness-responsible-impact-integrity-01", "googleyness-responsible-impact-integrity-02", "googleyness-responsible-impact-integrity-03",
   ],
};

export const COLLECTIONS: readonly Collection[] = [
   {
      id: "behavioral",
      title: "General Behavioral",
      lessons: BEHAVIORAL_LESSONS,
      levelFilter: true,
      grouped: false,
      manifest: GENERAL_MANIFEST,
   },
   {
      id: "amazon",
      title: "Amazon Leadership Principles",
      lessons: [{ content_id: "lesson.amazon-leadership-principles", slug: "amazon-leadership-principles", level: null }],
      levelFilter: false,
      grouped: true,
      manifest: AMAZON_MANIFEST,
   },
   {
      id: "google",
      title: "Googleyness & Leadership",
      lessons: [{ content_id: "lesson.googleyness-and-leadership", slug: "googleyness-and-leadership", level: null }],
      levelFilter: false,
      grouped: true,
      manifest: GOOGLE_MANIFEST,
   },
];

export const findCollection = (id: string) => COLLECTIONS.find((collection) => collection.id === id);

/** The collection an answer belongs to, derived from its `content_id`; undefined when no collection lists that Lesson. */
export const collectionOfContent = (contentId: string) =>
   COLLECTIONS.find(({ lessons }) => lessons.some(({ content_id }) => content_id === contentId));

/**
 * Opens one collection: one catalog read per Lesson of that collection (four, one, one) and none for any other. A result
 * that is not `ok` means the collection is hidden, never shown empty or partial.
 */
export const loadCollectionQuestions = ({
   lessons,
   grouped,
}: Collection): Promise<CatalogResult<CatalogQuestion<TargetLevel | null>[]>> => loadLessonQuestions(lessons, grouped);
