/** The Story Bank's own paths. Sign-in is asked to return here, and `safeRedirectPath` allow-lists them. */
export const PREPARE_STORIES_HREF = "/prepare/stories";
export const PREPARE_STORY_NEW_HREF = "/prepare/stories/new";

/** A story's id is a server-generated UUID (contract §2.2); anything else cannot name a story. */
export const STORY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `/prepare/stories/<id>`. The id is opaque and carries nothing about the reader's text. */
export const storyHref = (id: string) => `${PREPARE_STORIES_HREF}/${id}`;
