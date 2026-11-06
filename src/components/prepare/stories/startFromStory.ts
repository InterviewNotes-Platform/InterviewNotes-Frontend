import type { PrepClient } from "@/lib/prep/client";
import type { Answer, AnswerCreate, PrepResult, Story } from "@/lib/prep/types";

type Failed = Exclude<PrepResult<unknown>, { status: "ok" }>;

/**
 * - `started`    the answer exists with a copy of the story's text, and the link is confirmed
 * - `unlinked`   the answer exists, but the link is not confirmed; the copy must not be made again
 * - `no-story`   the story could not be read (missing, someone else's, or the call failed): nothing was created
 * - `no-answer`  the story was read but creating the answer failed; its outcome is `result`'s (it may be unknown)
 */
export type Start =
   | { status: "started"; answer: Answer }
   | { status: "unlinked"; answer: Answer }
   | { status: "no-story"; result: Failed }
   | { status: "no-answer"; result: Failed };

/** A story's framework is a free string; only the two an answer can take are carried over. */
const frameworkOf = (story: Story) => (story.framework === "free_form" ? "free_form" : "star");

/**
 * The one-time copy: the story's text only. Title, year and tags stay with the story, and the answer keeps the question,
 * status and identity of the one chosen. Nothing here is shared with the story afterwards (contract §5.2).
 */
export function withStoryText(question: AnswerCreate, story: Story): AnswerCreate {
   return { ...question, framework: frameworkOf(story), fields: { ...story.fields }, body: story.notes === "" ? null : story.notes };
}

/** Read the story, create the answer from a copy of what is saved, then link them: the two ordinary calls of contract §5.2. */
export async function startFromStory(client: PrepClient, storyId: string, question: AnswerCreate): Promise<Start> {
   const story = await client.getStory(storyId);
   if (story.status !== "ok") return { status: "no-story", result: story };
   const created = await client.createAnswer(withStoryText(question, story.data));
   if (created.status !== "ok") return { status: "no-answer", result: created };
   const link = await client.linkStory(created.data.id, storyId);
   return { status: link.status === "ok" ? "started" : "unlinked", answer: created.data };
}
