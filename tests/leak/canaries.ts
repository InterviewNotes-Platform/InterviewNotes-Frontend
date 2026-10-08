/** Synthetic premium markers. They may appear only in the fixture files allowlisted in scanner.ts. */
export const CATALOG_CANARY = "CATALOG_PREMIUM_CANARY__DO_NOT_LEAK";
export const BODY_CANARY = "PREMIUM_CANARY_T24";
export const SOLUTION_CANARY = "PREMIUM_SOLUTION_CANARY_T24";
export const DEEP_DIVE_CANARY = "PREMIUM_DEEP_DIVE_CANARY_T24";

/** P3: body-borne elements of the locked premium Lesson, each in the place the P3 element would read it. */
export const P3_PROSE_CANARY = "P3_SENTINEL_PROSE";
export const P3_OBJECTIVES_CANARY = "P3_SENTINEL_OBJECTIVES";
export const P3_CODE_TITLE_CANARY = "P3_SENTINEL_CODE_TITLE";
export const P3_CAPTION_CANARY = "P3_SENTINEL_CAPTION";
export const P3_ALT_CANARY = "P3_SENTINEL_ALT";
export const P3_TAKEAWAYS_CANARY = "P3_SENTINEL_TAKEAWAYS";
/** P3: the prompt of a premium Problem that a Lesson's Practice step lists by its public fields only. */
export const P3_PRACTICE_PROMPT_CANARY = "P3_SENTINEL_PRACTICE_PROMPT";

export const P3_LESSON_CANARIES = [P3_PROSE_CANARY, P3_OBJECTIVES_CANARY, P3_CODE_TITLE_CANARY, P3_CAPTION_CANARY, P3_ALT_CANARY, P3_TAKEAWAYS_CANARY];
export const P3_CANARIES = [...P3_LESSON_CANARIES, P3_PRACTICE_PROMPT_CANARY];

export const PROTECTED_CANARIES = [CATALOG_CANARY, BODY_CANARY, SOLUTION_CANARY, DEEP_DIVE_CANARY, ...P3_CANARIES];
