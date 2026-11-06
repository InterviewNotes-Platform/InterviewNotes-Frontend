import { STAR_KEYS, type StarKey } from "@/lib/prep/answerDraft";
import type { FrameworkInput, PrepFields, Story, StoryCreate, StoryUpdate } from "@/lib/prep/types";

/** The limits of contract §3.1 and §4.1, checked here only so a reader is told before the server has to refuse. */
export const TAG_MAX_LENGTH = 40;
export const TAG_MAX_COUNT = 20;
export const YEAR_MIN = 1900;
export const YEAR_MAX = 2100;

/**
 * What the form holds while the reader types. STAR and free-form are two views of one story: the framework only chooses
 * which is editable, and both `fields` and `notes` are always kept and always saved (contract §4.2).
 * `framework` is the stored value as read, so a later additive framework is not rewritten unless the reader switches.
 */
export type StoryDraft = {
   title: string;
   year: string;
   framework: string;
   notes: string;
   fields: Record<StarKey, string>;
   tags: string[];
};

export const emptyDraft = (): StoryDraft => ({
   title: "",
   year: "",
   framework: "star",
   notes: "",
   fields: { situation: "", task: "", action: "", result: "" },
   tags: [],
});

export const draftOf = (story: Story): StoryDraft => ({
   title: story.title,
   year: story.year === null ? "" : String(story.year),
   framework: story.framework,
   notes: story.notes,
   fields: Object.fromEntries(STAR_KEYS.map((key) => [key, story.fields[key] ?? ""])) as Record<StarKey, string>,
   tags: story.tags,
});

export type DraftProblems = { title?: string; year?: string };

/** The year as the API takes it, or why it cannot be sent. An empty year is no year. */
function parseYear(text: string): { value: number | null } | { error: string } {
   const trimmed = text.trim();
   if (trimmed === "") return { value: null };
   const year = Number(trimmed);
   return /^\d{4}$/.test(trimmed) && year >= YEAR_MIN && year <= YEAR_MAX
      ? { value: year }
      : { error: `Enter a year from ${YEAR_MIN} to ${YEAR_MAX}, or leave it empty.` };
}

export function problemsOf(draft: StoryDraft): DraftProblems {
   const year = parseYear(draft.year);
   return {
      ...(draft.title.trim() === "" ? { title: "Enter a title." } : {}),
      ..."error" in year ? { year: year.error } : {},
   };
}

/** `fields` is replaced as a whole, so only the non-empty keys are sent; clearing a field removes it. */
const fieldsOf = (fields: Record<StarKey, string>): PrepFields =>
   Object.fromEntries(STAR_KEYS.filter((key) => fields[key] !== "").map((key) => [key, fields[key]]));

const yearOf = (draft: StoryDraft) => {
   const parsed = parseYear(draft.year);
   return "value" in parsed ? parsed.value : null;
};

/** The body for a new story. Call it only when `problemsOf` found nothing. */
export const createBodyOf = (draft: StoryDraft): StoryCreate => ({
   title: draft.title.trim(),
   framework: draft.framework as FrameworkInput,
   notes: draft.notes,
   year: yearOf(draft),
   fields: fieldsOf(draft.fields),
   tags: draft.tags,
});

/** What differs between the draft and the saved story, as a PATCH body without `version`; null when nothing differs. */
export function changesOf(draft: StoryDraft, saved: Story): Omit<StoryUpdate, "version"> | null {
   const was = draftOf(saved);
   const changes: Omit<StoryUpdate, "version"> = {};
   if (draft.title.trim() !== was.title) changes.title = draft.title.trim();
   if (draft.year.trim() !== was.year) changes.year = yearOf(draft);
   if (draft.framework !== was.framework) changes.framework = draft.framework as FrameworkInput;
   if (draft.notes !== was.notes) changes.notes = draft.notes;
   if (STAR_KEYS.some((key) => draft.fields[key] !== was.fields[key])) changes.fields = fieldsOf(draft.fields);
   if (draft.tags.join("\n") !== was.tags.join("\n")) changes.tags = draft.tags;
   return Object.keys(changes).length > 0 ? changes : null;
}

export type TagAddition = { tags: string[]; error?: string };

/**
 * Adds what the reader typed to the tags, the way the API will store it: trimmed, lowercased, no commas inside a tag,
 * duplicates dropped keeping the first. A comma separates several tags typed at once. Nothing is added when a limit is hit.
 */
export function addTags(current: readonly string[], typed: string, subject: "story" | "answer" = "story"): TagAddition {
   const wanted = typed
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part !== "");
   const tags = [...current];
   for (const tag of wanted) {
      if ([...tag].length > TAG_MAX_LENGTH) return { tags: [...current], error: `A tag can be at most ${TAG_MAX_LENGTH} characters.` };
      if (!tags.includes(tag)) tags.push(tag);
   }
   if (tags.length > TAG_MAX_COUNT) return { tags: [...current], error: `${subject === "answer" ? "An answer" : "A story"} can have at most ${TAG_MAX_COUNT} tags.` };
   return { tags };
}
