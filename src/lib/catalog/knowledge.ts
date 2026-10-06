import { PRIMARY_NAV } from "@/lib/primary-navigation";
import type { LinkedMeta } from "./lesson";
import { linkableEntries } from "./routes";
import type { CatalogCategory, CatalogMeta, CatalogSection } from "./types";

export type KnowledgeCategory = Extract<CatalogCategory, "concept" | "term" | "technology" | "research" | "pattern" | "quick_reference">;

const CATEGORY_LABEL = new Map<string, string>([
   ["concept", "Concept"],
   ["term", "Term"],
   ["technology", "Technology"],
   ["research", "Research"],
   ["pattern", "Pattern"],
   ["quick_reference", "Quick reference"],
]);

/** The friendly name of a Knowledge category; none for null, a Problem category or any other value. */
export function categoryLabel(category: string | null | undefined): string | null {
   return (category && CATEGORY_LABEL.get(category)) || null;
}

export interface KnowledgeGroup {
   id: string;
   label: string;
   summary: string;
   categories: readonly KnowledgeCategory[];
}

/** P2's editorial grouping of the canonical `category` (spec §2.3): a presentation constant, never a replacement for the field. */
export const KNOWLEDGE_GROUPS: readonly KnowledgeGroup[] = [
   { id: "core-concepts", label: "Core Concepts", summary: "The ideas and vocabulary everything else builds on.", categories: ["concept", "term"] },
   { id: "technologies-research", label: "Technologies & Research", summary: "The tools, systems and papers worth knowing.", categories: ["technology", "research"] },
   { id: "patterns", label: "Patterns", summary: "Reusable designs, and when to reach for them.", categories: ["pattern"] },
   { id: "quick-references", label: "Quick References", summary: "Facts and numbers to scan before you need them.", categories: ["quick_reference"] },
];

/** The group a category belongs to; none for a null category, which is listed but never grouped. */
export function groupOf(category: string | null | undefined): KnowledgeGroup | null {
   return KNOWLEDGE_GROUPS.find(({ categories }) => categories.some((member) => member === category)) ?? null;
}

export function inGroup(meta: Pick<CatalogMeta, "category">, group: KnowledgeGroup): boolean {
   return group.categories.some((member) => member === meta.category);
}

/** URL state is untrusted: only a group defined here counts, so nothing else can shape a request. */
export function parseGroup(value: unknown): KnowledgeGroup | null {
   return typeof value === "string" ? (KNOWLEDGE_GROUPS.find(({ id }) => id === value) ?? null) : null;
}

export interface ExplorerQuery {
   group: KnowledgeGroup | null;
   tag: string | null;
   /** The API's own `next_cursor`, passed back untouched. */
   cursor: string | null;
}

const MAX_TAG_LENGTH = 100;
const MAX_CURSOR_LENGTH = 200;

function bounded(value: unknown, max: number): string | null {
   return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

/** The explorer's three URL inputs. A repeated or oversized parameter, or an unknown group, is as if it were absent. */
export function parseExplorerQuery(raw: Record<string, string | string[] | undefined>): ExplorerQuery {
   return {
      group: parseGroup(raw.group),
      tag: bounded(raw.tag, MAX_TAG_LENGTH)?.trim() || null,
      cursor: bounded(raw.cursor, MAX_CURSOR_LENGTH),
   };
}

const KNOWLEDGE_HREF = PRIMARY_NAV.find(({ area }) => area === "knowledge")!.href;

export function explorerHref({ group, tag, cursor }: { group?: KnowledgeGroup | null; tag?: string | null; cursor?: string | null } = {}): string {
   const named: [string, string | null | undefined][] = [["group", group?.id], ["tag", tag], ["cursor", cursor]];
   const pairs = named.flatMap(([name, value]) => (value ? [`${name}=${encodeURIComponent(value)}`] : []));
   return pairs.length ? `${KNOWLEDGE_HREF}?${pairs.join("&")}` : KNOWLEDGE_HREF;
}

/** The distinct tags on these items, sorted: the topics a reader can narrow to. */
export function topicsOf(items: readonly CatalogMeta[]): string[] {
   return [...new Set(items.flatMap((item) => item.tags))].sort();
}

export interface KnowledgeBand {
   id: string;
   label: string;
   sections: CatalogSection[];
}

// Band ids use `_`, which a section id (kebab-case) never contains, so they cannot collide with one.
const BANDS = [
   { id: "knowledge_fast", label: "Fast understanding" },
   { id: "knowledge_explanation", label: "Explanation" },
   { id: "knowledge_reference", label: "Deeper reference" },
];
const [FAST, EXPLANATION, REFERENCE] = [0, 1, 2];

const SECTION_TYPES = new Map<string, { label: string; band: number }>([
   ["definition", { label: "Definition", band: FAST }],
   ["quick_facts", { label: "Quick facts", band: FAST }],
   ["why_it_matters", { label: "Why it matters", band: FAST }],
   ["how_it_works", { label: "How it works", band: EXPLANATION }],
   ["architecture", { label: "Architecture", band: EXPLANATION }],
   ["when_to_use", { label: "When to use", band: EXPLANATION }],
   ["when_not_to_use", { label: "When not to use", band: EXPLANATION }],
   ["trade_offs", { label: "Trade-offs", band: EXPLANATION }],
   ["failure_modes", { label: "Failure modes", band: REFERENCE }],
   ["example", { label: "Example", band: REFERENCE }],
   ["interview_considerations", { label: "Interview considerations", band: REFERENCE }],
]);

/** The reading bands that have content, each with its sections in the API's order. An unknown type is deeper reference. */
export function bandsOf(sections: readonly CatalogSection[]): KnowledgeBand[] {
   const bands = BANDS.map((band) => ({ ...band, sections: [] as CatalogSection[] }));
   for (const section of sections) bands[SECTION_TYPES.get(section.type)?.band ?? REFERENCE].sections.push(section);
   return bands.filter(({ sections: members }) => members.length > 0);
}

/** A section's own title, else its type's name; an untitled section of an unknown type has no heading. */
export function sectionHeading(section: Pick<CatalogSection, "type" | "title">): string | null {
   return section.title?.trim() || SECTION_TYPES.get(section.type)?.label || null;
}

/** One related target and, unless it is the generic `related` edge, how it relates to this item. */
export type RelatedRow = LinkedMeta & { relation: string | null };

export interface KnowledgeRelations {
   lessons: RelatedRow[];
   problems: RelatedRow[];
   knowledge: RelatedRow[];
}

// The closed P1 vocabulary (§6.5) in reading order. `related` is the generic edge, so it carries no label.
const RELATIONS: [string, string | null][] = [
   ["prerequisite", "Read first"],
   ["applied_in", "Applied in"],
   ["prerequisite_of", "Prerequisite for"],
   ["applies", "Applies"],
   ["related", null],
];

/**
 * Groups the relation payload by target type, from metadata alone. A target appears once, under the first relation that
 * names it; order within a relation is the API's. Unlinkable targets, unknown relation names and the item itself are dropped.
 */
export function knowledgeRelations(relations: Record<string, CatalogMeta[]>, selfId: string): KnowledgeRelations {
   const grouped: KnowledgeRelations = { lessons: [], problems: [], knowledge: [] };
   const bucket = { lesson: grouped.lessons, problem: grouped.problems, knowledge: grouped.knowledge };
   const seen = new Set([selfId]);
   for (const [name, relation] of RELATIONS) {
      for (const link of linkableEntries(relations[name] ?? [])) {
         if (seen.has(link.entry.id)) continue;
         seen.add(link.entry.id);
         bucket[link.entry.type].push({ ...link, relation });
      }
   }
   return grouped;
}
