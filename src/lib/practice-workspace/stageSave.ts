/**
 * The stage-work resource for the autosave engine (P9-T13): the draft is `{status, fields}`, the canonical copy is the
 * `StageWorkOut` the stage PATCH returns (G-01), and a write sends only the keys whose text differs from that copy, with the
 * canonical `version` (compare-and-set). The merge rules are per key, so a conflict is only ever about text both sides changed.
 */

import type { AutosaveEngine, LoadOutcome, Resource, SaveOutcome } from "./autosave";
import { AutosaveEngine as Engine } from "./autosave";
import type { PracticeClient, PracticeResult } from "./client";
import { MAX_FIELD_CHARS } from "./stages";
import type { Position, StagePatchIn, StageStatus, StageWorkOut } from "./types";

export interface StageDraft {
   status: StageStatus;
   fields: Record<string, string>;
}

export type StagePatch = Omit<StagePatchIn, "version">;
export type StageEngine = AutosaveEngine<StageDraft, StageWorkOut, StagePatch>;

const at = (fields: Record<string, string>, key: string) => fields[key] ?? "";
const keysOf = (...maps: Record<string, string>[]) => [...new Set(maps.flatMap((map) => Object.keys(map)))];

export function draftOfStage(saved: StageWorkOut): StageDraft {
   return { status: saved.status, fields: { ...saved.fields } };
}

export function diffStage(draft: StageDraft, saved: StageWorkOut): StagePatch | null {
   const set_fields: Record<string, string> = {};
   for (const key of keysOf(draft.fields, saved.fields)) {
      if (at(draft.fields, key) !== at(saved.fields, key)) set_fields[key] = at(draft.fields, key);
   }
   const changedFields = Object.keys(set_fields).length > 0;
   const changedStatus = draft.status !== saved.status;
   if (!changedFields && !changedStatus) return null;
   return { ...(changedStatus ? { status: draft.status } : {}), ...(changedFields ? { set_fields } : {}) };
}

/** Mine where I changed it from the base, otherwise theirs. */
function keepMine(mine: StageDraft, theirs: StageWorkOut, base: StageWorkOut): StageDraft {
   const fields: Record<string, string> = {};
   for (const key of keysOf(mine.fields, theirs.fields, base.fields)) {
      const value = at(mine.fields, key) !== at(base.fields, key) ? at(mine.fields, key) : at(theirs.fields, key);
      if (value !== "" || key in theirs.fields || key in mine.fields) fields[key] = value;
   }
   return { status: mine.status !== base.status ? mine.status : theirs.status, fields };
}

/** Where both changed the same field to different text, mine then theirs, separated by a blank line; kept as mine where that would not fit. */
function combine(mine: StageDraft, theirs: StageWorkOut, base: StageWorkOut): { draft: StageDraft; note?: string } {
   const draft = keepMine(mine, theirs, base);
   const tooLong: string[] = [];
   for (const key of keysOf(mine.fields, theirs.fields)) {
      const m = at(mine.fields, key);
      const t = at(theirs.fields, key);
      if (m !== at(base.fields, key) && t !== at(base.fields, key) && m !== t) {
         const joined = `${m}\n\n${t}`;
         if (joined.length <= MAX_FIELD_CHARS) draft.fields[key] = joined;
         else tooLong.push(key);
      }
   }
   return {
      draft,
      note: tooLong.length > 0 ? "Some combined text would be too long, so there your version was kept. Tidy the text and it will save again." : "Combined: where you both changed a field, your text comes first and the other version follows. Edit it if you like; it saves again shortly.",
   };
}

function outcomeOf(result: PracticeResult<StageWorkOut>): SaveOutcome<StageWorkOut> {
   switch (result.status) {
      case "ok":
         return { kind: "ok", saved: result.data };
      case "unauthenticated":
         return { kind: "signin" };
      case "notFound":
      case "disabled":
         return { kind: "gone" };
      case "unavailable":
         return result.cause === "aborted" ? { kind: "aborted" } : { kind: "offline" };
      default:
         if (result.code === "version_conflict") return { kind: "conflict" };
         if (result.code === "attempt_not_active") return { kind: "not_active" };
         if (result.code === "stage_not_available") return { kind: "gone" };
         if (result.code === "validation_error") return { kind: "invalid" };
         return { kind: "offline" };
   }
}

/** The resource for one stage of one attempt. */
export function stageResource(client: PracticeClient, attemptId: string, position: Position): Resource<StageDraft, StageWorkOut, StagePatch> {
   return {
      draftOf: draftOfStage,
      diff: diffStage,
      keepMine,
      combine,
      async send(saved, patch, signal): Promise<SaveOutcome<StageWorkOut>> {
         return outcomeOf(await client.patchStage(attemptId, position, { version: saved.version, ...patch }, { signal }));
      },
      async load(signal): Promise<LoadOutcome<StageWorkOut>> {
         const result = await client.getAttempt(attemptId, { signal });
         if (result.status === "ok") {
            const saved = result.data.stage_work.find((stage) => stage.position === position);
            return saved ? { kind: "ok", saved, active: result.data.status === "active" } : { kind: "gone" };
         }
         if (result.status === "unauthenticated") return { kind: "signin" };
         if (result.status === "notFound" || result.status === "disabled") return { kind: "gone" };
         return result.status === "unavailable" && result.cause === "aborted" ? { kind: "aborted" } : { kind: "offline" };
      },
   };
}

export function createStageEngine(client: PracticeClient, attemptId: string, initial: StageWorkOut, onTerminal?: () => void): StageEngine {
   return new Engine({ resource: stageResource(client, attemptId, initial.position), initial, onTerminal });
}
