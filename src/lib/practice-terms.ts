/**
 * The practice data terms (P9-T17, `P9-OD-15`): the `practice-data` consent document, separate from and linked from the
 * Privacy & AI Use page, so `PRIVACY_VERSION` and the P7 `AI_TERMS_VERSION` do not move and P7 consent is not asked again.
 *
 * Version rule, the P7 convention of `src/lib/privacy.ts`: the backend's `PRACTICE_TERMS_VERSION` must equal
 * `PRACTICE_TERMS_VERSION` here exactly. The start dialog offers acceptance only when it does; any other required version,
 * or none (unset), fails closed. Hosted environments leave the backend value unset until the owner authorizes it.
 *
 * Every learner-facing practice privacy string lives here so the start dialog, the terms page and the T15 export and delete
 * controls say the same thing. Plain strings only.
 */

export const PRACTICE_TERMS_HREF = "/privacy/practice";
export const PRACTICE_TERMS_DOCUMENT_ID = "practice-data";
export const PRACTICE_TERMS_VERSION = "2026-11-25";

/** The acknowledgement shown before a learner's first attempt (and again after a material change or a withdrawal). */
export const PRACTICE_DATA_NOTICE = {
   title: "Before you practise",
   intro: "Practice saves your work in your account so you can come back to it. Please read this, then choose whether to go on.",
   points: [
      "We save what you do in practice: your stage answers, your diagram, the hints and clarifications you open, the snapshots made when you submit, and your self-review.",
      "We keep it until you delete it or your account is removed. Nothing deletes it on a timer.",
      "It is associated with your account and is not visible to other learners. Self-guided practice does not send your work to an AI provider.",
      "You can export it, delete one attempt or delete all of it. We keep no automatic backups, so export anything you want to keep.",
      "You can withdraw this later. Withdrawing stops new attempts and deletes nothing.",
      "Practice stores no uploaded files and no audio.",
   ],
   readingNote: "You don't need to accept this to read Problems.",
   declineNote: "If you decline, nothing is saved and the Problem stays as it is.",
   termsLinkLabel: "Read the practice data terms",
   changedNote: "The practice data terms have changed. Please read them again.",
} as const;

/** One deletion confirmation text for every surface that deletes practice data (`P9-C-PVC-05`). */
export const PRACTICE_DELETE_COPY = {
   attempt: {
      title: "Delete this attempt?",
      body:
         "This permanently deletes this attempt: its stage answers, diagram, snapshots, the hints and clarifications you opened, and your self-review. " +
         "It can't be undone. Your other attempts stay. We keep no automatic backups of practice data, but a copy of the database we made before you delete it can still hold it until that copy is removed.",
      confirm: "Delete attempt",
      cancel: "Keep it",
      done: "Attempt deleted.",
   },
   all: {
      title: "Delete all practice data?",
      body:
         "This permanently deletes every practice attempt, everything saved with them and your practice preferences. It can't be undone. " +
         "Your record of accepting the practice data terms is kept, because deleting your data does not withdraw it. " +
         "Your Lesson and Problem progress and your preparation workspace are not affected. " +
         "We keep no automatic backups of practice data, but a copy of the database we made before you delete it can still hold it until that copy is removed.",
      confirm: "Delete all practice data",
      cancel: "Keep my data",
      done: "Your practice data is deleted.",
   },
} as const;

/** Export wording. An export is your own data as your account may see it, not a copy of internal records. */
export const PRACTICE_EXPORT_COPY = {
   complete: "Your export is complete. It holds your own practice work and leaves out anything you have not unlocked, such as reference answers.",
   incomplete: "This export did not finish, so the file is incomplete. Try again, or export one attempt at a time from your attempts.",
   perAttemptFallback: "If exporting everything does not finish, export one attempt at a time from your attempts.",
   failed: "The export did not start, so nothing was downloaded. Try again.",
} as const;

/** Withdrawing the practice-data acknowledgement (T12 behaviour: blocks new attempts only, deletes nothing). */
export const PRACTICE_WITHDRAW_COPY = {
   title: "Withdraw your practice data acknowledgement?",
   body:
      "You won't be able to start a new attempt until you accept again. This deletes nothing: your saved attempts stay, " +
      "and you can still open, edit, export and delete them while practice is available. To remove your data, delete it.",
   action: "Withdraw acknowledgement",
   confirm: "Withdraw",
   cancel: "Keep it",
   done: "Withdrawn. Your saved attempts are unchanged.",
   notAccepted: "You have not accepted the practice data terms, so there is nothing to withdraw.",
   failed: "We could not record your withdrawal. Nothing changed; try again.",
} as const;
