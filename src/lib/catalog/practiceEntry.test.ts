import { describe, expect, it } from "vitest";
import { targetedSeniorities } from "./practiceEntry";
import type { CatalogSection } from "./types";

const section = (type: string, text: string): CatalogSection => ({ id: `${type}-1`, type, title: null, body: { format: "markdown@1", text } });
const bar = (seniority: string | null) => `::: part name=bar${seniority ? ` seniority=${seniority}` : ""}\nWhat the bar looks like.\n:::`;

describe("the seniorities a Problem targets", () => {
   it("reads the attributed bars of the released rubric dimensions, in the P4 order", () => {
      const sections = [section("rubric_dimension", `${bar("staff")}\n${bar("senior")}`), section("rubric_dimension", bar("senior"))];
      expect(targetedSeniorities({ sections })).toEqual(["senior", "staff"]);
   });

   it("reads the bars of a structured level_expectations too", () => {
      expect(targetedSeniorities({ sections: [section("level_expectations", `${bar("mid")}\n${bar("principal")}`)] })).toEqual(["mid", "principal"]);
   });

   it("offers none when no released section writes a bar for a seniority: an unattributed bar names no seniority", () => {
      expect(targetedSeniorities({ sections: [section("rubric_dimension", bar(null))] })).toEqual([]);
      expect(targetedSeniorities({ sections: [section("level_expectations", "This Problem targets senior and staff candidates.")] })).toEqual([]);
      expect(targetedSeniorities({ sections: [] })).toEqual([]);
   });

   it("never offers a seniority outside the P4 vocabulary, and no Track label", () => {
      expect(targetedSeniorities({ sections: [section("rubric_dimension", `${bar("sde-2")}\n${bar("manager")}\n${bar("senior")}`)] })).toEqual(["senior"]);
   });

   it("ignores bars in sections that are not rubric dimensions or level expectations", () => {
      expect(targetedSeniorities({ sections: [section("prompt", bar("staff")), section("reference_design", bar("senior"))] })).toEqual([]);
   });
});
