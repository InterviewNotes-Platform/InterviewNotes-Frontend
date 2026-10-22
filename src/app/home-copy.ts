import type { Metadata } from "next";
import { TRACKS_ENTRY } from "@/lib/primary-navigation";

// Tracks are the primary product, Knowledge supports them (P2 spec §5.3). STATS and TESTIMONIALS are the pre-P0
// claims (51b99f3), not backed by product data. Prices: spec §5.1. Provenance: core-experience/design-brief.md §8.
// All are UNVERIFIED and wait for Harshul's review (RG-2). Stats and quotes are shown only as labelled samples (P6-D-37).
export const HOME_METADATA: Metadata = {
   title: "InterviewNotes: ML interview preparation",
   description:
      "Structured learning tracks and reusable technical knowledge for ML and AI engineering interviews, in one connected library.",
};

export const HERO = {
   eyebrow: "Your complete interview prep",
   /** The h1 reads `${lead} ${subject} ${tail}`; the page animates the subject, assistive technology reads this text. */
   lead: "Crack Your Next",
   subject: "ML and AI engineering",
   tail: "Interview",
   /** Rendered as `${before}<strong>${emphasis}</strong>${after}`. */
   intro: {
      before: "One platform for ",
      emphasis: "ML System Design, LLM Platforms & GenAI",
      after: " interviews. Everything you need to land your dream ML/AI offer.",
   },
   primaryAction: { label: "Browse Tracks", href: TRACKS_ENTRY },
   /** Shown only when the API confirms the free Lesson (S6-HOME-4); its destination is that Lesson, so it is not set here. */
   freeChapterLabel: "Read a free chapter",
};

/** The animated subject cycles through these once, then rests on the first. */
export const HERO_TOPICS = ["ML Platform Design", "LLM Platform Design", "GenAI Native Design", "ML System Design"] as const;

/** Subject areas the library covers; descriptive chips, not links. */
export const HERO_AREAS = ["GenAI & Agentic Patterns", "ML Platform & MLOps", "LLM Platform Design", "ML System Design"] as const;

/** Pre-P0 51b99f3, unverified, wording unchanged (S6-HOME-6). No user, analytics or outcome data supports these figures. */
export const STATS_DISCLOSURE = { label: "Sample", text: "Sample statistics: illustrative figures, not verified results." };

export const STATS = [
   { key: "modules", value: "80+", label: "Design Modules" },
   { key: "engineers", value: "5K+", label: "Engineers" },
   { key: "offers", value: "90%", label: "Offer Rate" },
   { key: "tracks", value: "6", label: "Tracks" },
] as const;

export const TRACKS = {
   label: "Tracks",
   heading: "Choose Your Track",
   lead: "Tracks are the way in: pick one, work through its modules, and explore the lessons, knowledge and practice problems inside it.",
   steps: ["Select a track", "Work through its modules", "Explore lessons, knowledge and problems"],
   /** The cards come from the published catalog Tracks; nothing here describes a particular Track (S6-HOME-3). */
   cardAction: "Explore",
   empty: "No Tracks are published yet.",
   /** Shown with a link to Knowledge when the Track list cannot be read (S6-HOME-2). */
   unavailable: "Tracks could not be loaded right now.",
};

/** The explorer's own group ids (lib/catalog/knowledge.ts); a test holds each href to `explorerHref`. */
export const KNOWLEDGE = {
   label: "Knowledge",
   heading: "Build the Foundations",
   lead: "Reusable technical knowledge behind every track. Each topic stands on its own and links to the lessons that rely on it.",
   /** The four editorial groups of the Knowledge explorer (P2 spec §2.3). */
   groups: [
      { key: "core-concepts", href: "/knowledge?group=core-concepts", title: "Core Concepts", description: "The concepts and key terms behind ML and GenAI systems, explained one at a time." },
      { key: "technologies-research", href: "/knowledge?group=technologies-research", title: "Technologies & Research", description: "The technologies and research that real systems are built on." },
      { key: "patterns", href: "/knowledge?group=patterns", title: "Patterns", description: "Reusable design patterns you can apply across interview problems." },
      { key: "quick-references", href: "/knowledge?group=quick-references", title: "Quick References", description: "Short references to scan before an interview." },
   ],
   action: { label: "Browse Knowledge", href: "/knowledge" },
};

/** The pre-P0 section ("Engineers Who Landed Offers", "Trusted by engineers at Google, Meta, ...") named employers and
 *  outcomes no record supports (RG-2), so it now says plainly that these are samples. */
export const TESTIMONIALS_SECTION = {
   label: "Samples",
   heading: "Sample Testimonials",
   lead: "Illustrative examples only. These are not real customer testimonials, and the people, employers and results shown are placeholders.",
   cardLabel: "Sample, not a real customer",
};

/** Pre-P0 51b99f3 quotes, wording unchanged, with no consent or identity record found. All eight are shown, as samples. */
export const TESTIMONIALS = [
   { name: "Priya S.", role: "SDE-3", company: "Google", initials: "PS", quote: "The system design modules gave me a structured framework I was missing. Landed my L5 offer in 6 weeks of prep." },
   { name: "Marcus T.", role: "Senior MLE", company: "Meta", initials: "MT", quote: "ML Platform Design track is gold. Covered exactly what came up in my Meta loop — feature stores, model serving, the works." },
   { name: "Ananya R.", role: "Staff Engineer", company: "Amazon", initials: "AR", quote: "LLM Platform Design track is exactly what I needed for my Anthropic loop. Inference serving, fine-tuning, guardrails — all in one place." },
   { name: "Jake L.", role: "SDE-2", company: "Netflix", initials: "JL", quote: "GenAI design track is ahead of every other resource out there. RAG patterns and agent architectures — all covered." },
   { name: "Sarah K.", role: "Senior SDE", company: "Microsoft", initials: "SK", quote: "ML System Design track nailed it — recommendation systems, search ranking, fraud detection. Exactly what came up in my interview." },
   { name: "Ravi M.", role: "ML Engineer", company: "Apple", initials: "RM", quote: "Gen AI Foundations track gave me the theory I was missing. Went into my OpenAI interview confident on transformers and attention. Got the offer." },
   { name: "Emily C.", role: "SDE-2", company: "Google", initials: "EC", quote: "Worth every penny. The depth of each article is closer to a textbook chapter than a blog post. Premium was a no-brainer." },
   { name: "David W.", role: "Senior SDE", company: "Amazon", initials: "DW", quote: "I prepped with three other platforms before this. InterviewNotes is the only one that covers ML system design properly." },
] as const;

/** Informational pricing (P2 spec §5.1, P6-D-37: no "Planned" label). No discount, trial, tax, refund, guarantee or billing term is defined. */
export const PRICING = {
   label: "Pricing",
   heading: "Simple, Transparent Pricing",
   lead: "Three plans are planned for the full library. Paid access is not available yet, and nothing is for sale today.",
   listLabel: "Pricing plans",
   plans: [
      { name: "Annual", amount: "$50", unit: "/year" },
      { name: "3-year", amount: "$100", unit: "/3 years" },
      { name: "Lifetime", amount: "$150", unit: "/lifetime" },
   ],
   included: {
      label: "Every plan",
      points: ["Every Track, Lesson and Knowledge topic in one library", "Premium material open once paid access launches", "Premium content is labelled wherever it appears"],
   },
   note: "For information only. Paid access is not currently available, and nothing is for sale.",
   free: {
      label: "Free",
      title: "Start with free content",
      body: "Read free content to judge the depth for yourself. Premium content is labelled wherever it appears.",
      action: { label: "Start Learning", href: TRACKS_ENTRY },
   },
};

export const FAQ = {
   label: "FAQ",
   heading: "Frequently Asked Questions",
   items: [
      {
         q: "What interview types does InterviewNotes cover?",
         a: "The library is for ML and AI engineering interviews: ML system design, LLM platform design and GenAI, with the platform and MLOps work behind them. Each Track shows what is published today.",
      },
      {
         q: "How is the content structured?",
         a: "Each track is broken into modules and lessons that build on each other, from foundational concepts to real interview problems. Knowledge topics stand on their own and link to the lessons that rely on them.",
      },
      {
         q: "Can I try it for free?",
         a: "Yes. Some Lessons are free to read, so you can judge the depth for yourself, and premium content is labelled wherever it appears.",
      },
      {
         q: "What does Premium include?",
         a: "Paid access is planned, not available yet. It is planned to open the premium material across the full library; see the Pricing section for where that stands. Nothing is for sale today.",
      },
      {
         q: "How often is new content added?",
         a: "We add new lessons and tracks over time. Each section shows what is available today.",
      },
   ],
};

/** Browse Tracks only: no waitlist or unavailable action (DF-9). */
export const CLOSING = {
   heading: "Pick a Track and start reading",
   action: { label: "Browse Tracks", href: TRACKS_ENTRY },
};
