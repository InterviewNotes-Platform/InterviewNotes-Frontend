import type { Metadata } from "next";

// Tracks are the primary product, Knowledge supports them (P2 spec §5.3). STATS and TESTIMONIALS are the pre-P0
// claims (51b99f3) restored verbatim at the product owner's request, not backed by product data. Prices: spec §5.1.
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
   primaryAction: { label: "Start Learning", href: "/tracks" },
   secondaryAction: { label: "View Pricing", href: "#pricing" },
};

/** The animated subject cycles through these once, then rests on the first. */
export const HERO_TOPICS = ["ML Platform Design", "LLM Platform Design", "GenAI Native Design", "ML System Design"] as const;

/** Subject areas the library covers; descriptive chips, not links. */
export const HERO_AREAS = ["GenAI & Agentic Patterns", "ML Platform & MLOps", "LLM Platform Design", "ML System Design"] as const;

export const STATS = [
   { key: "modules", value: "80+", label: "Design Modules" },
   { key: "engineers", value: "5K+", label: "Engineers" },
   { key: "offers", value: "90%", label: "Offer Rate" },
   { key: "tracks", value: "6", label: "Tracks" },
] as const;

export const TRACKS = {
   label: "Tracks",
   heading: "Choose Your Path",
   lead: "Tracks are the way in: pick one, work through its modules, and explore the lessons, knowledge and practice problems inside it.",
   steps: ["Select a track", "Work through its modules", "Explore lessons, knowledge and problems"],
   /** Titles and taglines are the pre-P0 track cards; the page is static, so a card opens the Track index. */
   items: [
      { key: "gen-ai-native", title: "Gen AI Native Design", tagline: "RAG, Agents, LLM Ops & more", grid: "lg:col-span-7 md:col-span-2" },
      { key: "ml-system-design", title: "ML System Design", tagline: "Recommendations, search, ranking & more", grid: "lg:col-span-5" },
      { key: "llm-platform", title: "LLM Platform Design", tagline: "Inference serving, fine-tuning & guardrails", grid: "lg:col-span-5" },
      { key: "ml-platform", title: "ML Platform Design", tagline: "MLOps, feature stores & inference", grid: "lg:col-span-7" },
      { key: "gen-ai-foundations", title: "Gen AI Foundations", tagline: "Transformers, attention, tokenization & more", grid: "lg:col-span-12 md:col-span-2" },
   ],
   cardAction: "Explore",
   action: { label: "Explore Tracks", href: "/tracks" },
};

export const KNOWLEDGE = {
   label: "Knowledge",
   heading: "Build the Foundations",
   lead: "Reusable technical knowledge behind every track. Each topic stands on its own and links to the lessons that rely on it.",
   /** The four editorial groups of the Knowledge explorer (P2 spec §2.3). */
   groups: [
      { key: "core", title: "Core Concepts", description: "The concepts and key terms behind ML and GenAI systems, explained one at a time." },
      { key: "technologies", title: "Technologies & Research", description: "The technologies and research that real systems are built on." },
      { key: "patterns", title: "Patterns", description: "Reusable design patterns you can apply across interview problems." },
      { key: "references", title: "Quick References", description: "Short references to scan before an interview." },
   ],
   action: { label: "Browse Knowledge", href: "/knowledge" },
};

export const TESTIMONIALS_SECTION = {
   label: "Testimonials",
   heading: "Engineers Who Landed Offers",
   lead: "Trusted by engineers at Google, Meta, Amazon, Netflix, Apple & Microsoft.",
};

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

/** Planned, informational pricing (P2 spec §5.1). No discount, trial, tax, refund, guarantee or billing term is defined. */
export const PRICING = {
   label: "Pricing",
   heading: "Simple, Transparent Pricing",
   lead: "Three plans are planned for the full library. Paid access is not available yet, and nothing is for sale today.",
   listLabel: "Planned pricing",
   badge: "Planned",
   plans: [
      { name: "Annual", amount: "$50", unit: "/year" },
      { name: "3-year", amount: "$100", unit: "/3 years" },
      { name: "Lifetime", amount: "$150", unit: "/lifetime" },
   ],
   included: {
      label: "Every planned plan",
      points: ["Every Track, Lesson and Knowledge topic in one library", "Premium material open once paid access launches", "Premium content is labelled wherever it appears"],
   },
   note: "For information only. Paid access is not available yet.",
   free: {
      label: "Free",
      title: "Start with free content",
      body: "Read free content to judge the depth for yourself. Premium content is labelled wherever it appears.",
      action: { label: "Start Learning", href: "/tracks" },
   },
};

export const FAQ = {
   label: "FAQ",
   heading: "Frequently Asked Questions",
   items: [
      {
         q: "What interview types does InterviewNotes cover?",
         a: "We cover ML System Design, ML Platform Design, LLM Platform Design, Gen AI Foundations, and Gen AI Native Design — everything you need for MLE, Senior MLE, and Staff AI/ML roles.",
      },
      {
         q: "How is the content structured?",
         a: "Each track is broken into modules and lessons that build on each other, from foundational concepts to real interview problems. Knowledge topics stand on their own and link to the lessons that rely on them.",
      },
      {
         q: "Can I try it for free?",
         a: "Yes. Free content lets you judge the depth for yourself, and premium content is labelled wherever it appears.",
      },
      {
         q: "What does Premium include?",
         a: "Paid access is planned, not available yet. It is planned to open the premium material across the full library; see Pricing for the planned plans. Nothing is for sale today.",
      },
      {
         q: "How often is new content added?",
         a: "We add new lessons and tracks over time. Each section shows what is available today.",
      },
   ],
};
