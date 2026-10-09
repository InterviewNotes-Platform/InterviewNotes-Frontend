import { PRACTICE_HREF } from "@/lib/primary-navigation";
import type { CatalogItemListParams, CatalogMeta } from "./types";

type Difficulty = NonNullable<CatalogMeta["difficulty"]>;
type Level = NonNullable<CatalogMeta["level"]>;

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
export const LEVELS: readonly Level[] = ["foundational", "intermediate", "advanced"];
export const ACCESS_VALUES: readonly CatalogMeta["access"][] = ["free", "premium"];

export interface PracticeQuery {
   tag: string | null;
   difficulty: Difficulty | null;
   level: Level | null;
   /** A Track slug; it counts only once `withKnownTrack` has checked it against the published Tracks. */
   track: string | null;
   access: CatalogMeta["access"] | null;
   /** The API's own `next_cursor`, passed back untouched. */
   cursor: string | null;
}

// P1 D-13: tags (and every slug) are lowercase kebab strings.
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_KEBAB_LENGTH = 80;
const MAX_CURSOR_LENGTH = 200;

function isKebab(value: unknown): value is string {
   return typeof value === "string" && value.length <= MAX_KEBAB_LENGTH && KEBAB.test(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
   return allowed.find((member) => member === value) ?? null;
}

/** URL state is untrusted: a repeated parameter, an unknown enum value or a malformed tag or slug is as if it were absent. */
export function parsePracticeQuery(raw: Record<string, string | string[] | undefined>): PracticeQuery {
   const { cursor } = raw;
   return {
      tag: isKebab(raw.tag) ? raw.tag : null,
      difficulty: oneOf(raw.difficulty, DIFFICULTIES),
      level: oneOf(raw.level, LEVELS),
      track: isKebab(raw.track) ? raw.track : null,
      access: oneOf(raw.access, ACCESS_VALUES),
      cursor: typeof cursor === "string" && cursor.length > 0 && cursor.length <= MAX_CURSOR_LENGTH ? cursor : null,
   };
}

/** Keeps the Track only if it is one the catalog lists, so an unknown slug can never reach the API (which would answer 404). */
export function withKnownTrack(query: PracticeQuery, trackSlugs: readonly string[]): PracticeQuery {
   return query.track !== null && trackSlugs.includes(query.track) ? query : { ...query, track: null };
}

export function activeFilterCount({ tag, difficulty, level, track, access }: PracticeQuery): number {
   return [tag, difficulty, level, track, access].filter((value) => value !== null).length;
}

/** The Practice URL for a query: filters in a fixed order, absent ones omitted, so a link never carries stale state. */
export function practiceHref(query: Partial<PracticeQuery> = {}): string {
   const named: [string, string | null | undefined][] = [
      ["tag", query.tag],
      ["difficulty", query.difficulty],
      ["level", query.level],
      ["track", query.track],
      ["access", query.access],
      ["cursor", query.cursor],
   ];
   const pairs = named.flatMap(([name, value]) => (value ? [`${name}=${encodeURIComponent(value)}`] : []));
   return pairs.length ? `${PRACTICE_HREF}?${pairs.join("&")}` : PRACTICE_HREF;
}

/** Exactly the list parameters Practice sends: Problems only, and never a Module or an unchecked value. */
export function problemListParams(query: PracticeQuery, limit: number): CatalogItemListParams {
   return {
      type: "problem",
      tag: query.tag ?? undefined,
      difficulty: query.difficulty ?? undefined,
      level: query.level ?? undefined,
      access: query.access ?? undefined,
      track: query.track ?? undefined,
      limit,
      cursor: query.cursor ?? undefined,
   };
}

/** The distinct, well-formed tags on these Problems, sorted: the topics a reader can narrow to. */
export function problemTopics(items: readonly CatalogMeta[]): string[] {
   return [...new Set(items.filter(({ type }) => type === "problem").flatMap(({ tags }) => tags.filter(isKebab)))].sort();
}
