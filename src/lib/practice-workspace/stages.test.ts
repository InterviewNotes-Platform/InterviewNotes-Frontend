import { describe, expect, it } from "vitest";
import { POSITION_COPY } from "@/lib/catalog/positionCopy";
import { isKnownPosition, FIELD_KEY_PATTERN, MAX_FIELD_CHARS, MAX_FIELDS_PER_STAGE, STAGE_COPY, stageFields } from "./stages";
import { POSITIONS } from "./guards";

describe("the stage vocabulary", () => {
   it("has exactly the seven interview positions of the contract, and the reader's P4 labels", () => {
      expect(Object.keys(STAGE_COPY).sort()).toEqual([...POSITIONS].sort());
      for (const position of POSITIONS) expect(STAGE_COPY[position].label).toBe(POSITION_COPY.get(position)?.label);
   });

   it("knows no review surface: Reference Solution and Self-review are not stages here", () => {
      expect(isKnownPosition("reference_solution")).toBe(false);
      expect(isKnownPosition("self_review")).toBe(false);
      expect(isKnownPosition("frame")).toBe(true);
   });

   it("uses only field keys the contract accepts, within its limits, with no duplicate in a stage", () => {
      expect(MAX_FIELD_CHARS).toBe(6000);
      expect(MAX_FIELDS_PER_STAGE).toBe(12);
      for (const position of POSITIONS) {
         const fields = stageFields(position);
         expect(fields.length).toBeGreaterThan(0);
         expect(fields.length).toBeLessThanOrEqual(MAX_FIELDS_PER_STAGE);
         expect(new Set(fields.map((field) => field.key)).size).toBe(fields.length);
         for (const field of fields) expect(field.key).toMatch(FIELD_KEY_PATTERN);
      }
   });

   it("gives ML reasoning one field per authored sub-section, and never invents Features or Training", () => {
      expect(stageFields("ml_reasoning").map((field) => field.label)).toEqual(["Your ML reasoning"]);
      const authored = [
         { key: "ml_objective", title: "Objective" },
         { key: "labels", title: "Labels" },
      ];
      expect(stageFields("ml_reasoning", authored).map((field) => field.label)).toEqual(["Objective", "Labels"]);
      expect(stageFields("ml_reasoning", [{ key: "Bad Key", title: "x" }, { key: "model", title: "  " }]).map((field) => field.label)).toEqual(["Your ML reasoning"]);
      expect(stageFields("requirements", authored)).toEqual(stageFields("requirements"));
   });
});

describe("saved text whose sub-prompt is no longer listed", () => {
   it("stays visible under a neutral label that names no section", async () => {
      const { stageFields, withSavedFields, OTHER_NOTES_LABEL } = await import("./stages");
      const listed = stageFields("ml_reasoning", [{ key: "data", title: "Data" }]);
      expect(withSavedFields(listed, { data: "x", model: "my model notes", labels: "" }).map((f) => [f.key, f.label])).toEqual([
         ["data", "Data"],
         ["model", OTHER_NOTES_LABEL],
      ]);
      expect(withSavedFields(listed, { data: "x" })).toBe(listed);
      expect(withSavedFields(listed, { model: "a", training: "b" }).map((f) => f.label)).toEqual(["Data", `${OTHER_NOTES_LABEL} 1`, `${OTHER_NOTES_LABEL} 2`]);
   });
});
