import type { Metadata } from "next";

// Provisional homepage copy: the final hero copy is deferred (P2 spec §5). Revise prose here only.
// It is product description, not catalog content: no counts, outcomes, testimonials or purchase terms.
// The three prices are the senior-approved planned pricing (P2 spec §5.1), shown for information only.

export const HOME_METADATA: Metadata = {
   title: "InterviewNotes: ML interview preparation",
   description:
      "Structured learning paths, reusable technical knowledge and interview problems for ML and AI engineering interviews, in one connected library.",
};

export const HERO = {
   eyebrow: "ML and GenAI interview prep",
   /** The h1 reads `${lead} ${subject} ${tail}`; the page animates the subject, assistive technology reads this text. */
   lead: "Crack your next",
   subject: "ML and AI engineering",
   tail: "interview",
   body: "Structured learning paths, reusable technical foundations and interview problems, in one connected library for ML and AI engineering interviews.",
   primaryAction: { label: "Start learning", href: "/tracks" },
   secondaryAction: { label: "How access works", href: "#access" },
};

/** The animated subject cycles through these once, then rests on the first. */
export const HERO_TOPICS = ["ML Platform Design", "LLM Platform Design", "GenAI Native Design", "ML System Design"] as const;

/** Subject areas the library covers; descriptive chips, not links. */
export const HERO_AREAS = ["GenAI & Agentic Patterns", "ML Platform & MLOps", "LLM Platform Design", "ML System Design"] as const;

export const ENTRY_HEADING = {
   label: "Start here",
   heading: "Where to start",
   lead: "Three ways in, each linked to the others.",
};

/** The three discovery doors, in reading order: understanding, then foundations, then application. */
export const ENTRY_POINTS = [
   {
      key: "learn",
      title: "Learn",
      href: "/tracks",
      description: "Structured learning paths. Tracks group lessons into a curriculum that builds from fundamentals to interview problems.",
      action: "Browse tracks",
   },
   {
      key: "knowledge",
      title: "Knowledge",
      href: "/knowledge",
      description: "Reusable technical foundations. Each topic stands on its own and links to the lessons and problems that rely on it.",
      action: "Browse topics",
   },
   {
      key: "practice",
      title: "Practice",
      href: "/practice",
      description: "Interview problems that apply what you know. Work from framing and requirements through design and trade-offs.",
      action: "Browse problems",
   },
] as const;

export const CONNECTION =
   "Learn builds understanding. Knowledge provides the reusable foundations behind it. Practice applies both on interview problems. Each links to the others: a lesson to the knowledge it relies on, a problem to the lessons that prepare for it.";

export const PREMIUM = {
   label: "Access",
   heading: "Free to start, with a fuller library planned.",
   lead: "Free content lets you judge the depth for yourself. The full library is planned as paid access on the same connected structure, so each lesson, topic and problem leads into the next.",
   free: {
      label: "Free",
      title: "Start with free content",
      points: ["Read free content to judge the depth for yourself", "Premium content is labelled wherever it appears"],
      action: { label: "Start learning", href: "/tracks" },
   },
   full: {
      label: "Full library",
      title: "Planned as paid access",
      body: "The same lessons, topics and problems, with the premium material open. Locked content will open up once paid access launches.",
   },
   note: "Premium content is labelled wherever it appears. Paid access is not available yet, and nothing is for sale today.",
};

/** Planned, informational pricing (P2 spec §5.1). No discount, trial, tax, refund, guarantee or billing term is defined. */
export const PRICING = {
   label: "Planned pricing",
   note: "For information only. Paid access is not available yet.",
   plans: ["$50/year", "$100/3 years", "$150/lifetime"],
};

export const FAQ = {
   label: "FAQ",
   heading: "Frequently asked questions",
   items: [
      {
         q: "What does InterviewNotes cover?",
         a: "ML system design, ML platform design, LLM platform design, GenAI foundations and GenAI-native design: preparation for ML and AI engineering interviews.",
      },
      {
         q: "How is the library organised?",
         a: "Learn groups lessons into tracks that build from fundamentals to interview problems. Knowledge holds reusable topics. Practice holds interview problems. Each links to the others.",
      },
      {
         q: "Can I try it for free?",
         a: "Yes. Free content lets you judge the depth for yourself, and premium content is labelled wherever it appears.",
      },
      {
         q: "Is there a paid plan?",
         a: "Paid access is not available yet. The full library is planned as paid access later, and nothing is for sale today.",
      },
      {
         q: "How often is new content added?",
         a: "Content is added over time. Each section shows what is available today.",
      },
   ],
};
