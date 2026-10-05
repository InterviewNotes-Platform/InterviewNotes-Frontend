import type { Metadata } from "next";

// Provisional homepage copy: the final hero copy is deferred (P2 spec §5). Revise prose here only.
// It is product description, not catalog content: no counts, outcomes, testimonials or prices.

export const HOME_METADATA: Metadata = {
   title: "InterviewNotes: ML interview preparation",
   description:
      "Structured learning paths, reusable technical knowledge and interview problems for ML and AI engineering interviews, in one connected library.",
};

export const HERO = {
   heading: "The systems behind ML interviews.",
   lead: "Structured learning paths, reusable technical foundations and interview problems, in one connected library for ML and AI engineering interviews.",
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
   label: "Premium",
   heading: "Free to start, with a fuller library planned.",
   body: "Free content lets you judge the depth for yourself. The full library is planned as paid access on the same connected structure, so each lesson, topic and problem leads into the next.",
   note: "Premium content is labelled wherever it appears. Paid access is not available yet, and nothing is for sale today.",
};
