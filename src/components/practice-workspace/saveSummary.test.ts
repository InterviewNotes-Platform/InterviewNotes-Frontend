import { describe, expect, it } from "vitest";
import type { AutosaveSnapshot, Phase } from "@/lib/practice-workspace/autosave";
import type { Position } from "@/lib/practice-workspace/types";
import { summarizeSaves } from "./saveSummary";

const snap = (phase: Phase, dirty = false, note?: string): AutosaveSnapshot<unknown, unknown> => ({ saved: {}, draft: {}, phase, dirty, resolving: false, theirs: null, note });
const of = (entries: [Position, AutosaveSnapshot<unknown, unknown>][]) => new Map(entries);

describe("the one save status", () => {
   it("is quiet until something was written, and says Saved only after the server acknowledged and nothing is unsaved", () => {
      expect(summarizeSaves(of([["frame", snap("idle")]])).state).toBe("idle");
      expect(summarizeSaves(of([["frame", snap("saved")], ["design", snap("idle")]])).state).toBe("saved");
      expect(summarizeSaves(of([["frame", snap("saved")], ["design", snap("idle", true)]])).state).toBe("unsaved");
   });

   it("says Saving while any write is in the air, ahead of Unsaved", () => {
      expect(summarizeSaves(of([["frame", snap("saving", true)], ["design", snap("idle", true)]])).state).toBe("saving");
   });

   it("puts a stage that needs the learner ahead of everything, names it, and lists it", () => {
      const summary = summarizeSaves(of([["frame", snap("saved")], ["requirements", snap("offline", true)], ["design", snap("conflict", true)]]));
      expect(summary.state).toBe("error");
      expect(summary.message).toBe("Not saved (Requirements). You appear to be offline. Your text is kept here and we will try again.");
      expect(summary.troubled).toEqual(["requirements", "design"]);
   });

   it("does not call a clean stage after an ended attempt a problem", () => {
      expect(summarizeSaves(of([["frame", snap("terminal", false)]])).state).toBe("idle");
      expect(summarizeSaves(of([["frame", snap("terminal", true)]])).state).toBe("error");
   });

   it("carries the note of a resolved conflict on the saved status", () => {
      expect(summarizeSaves(of([["frame", snap("saved", false, "Saved: loaded the other version. Your earlier text was replaced.")]])).message).toMatch(/loaded the other version/);
   });
});
