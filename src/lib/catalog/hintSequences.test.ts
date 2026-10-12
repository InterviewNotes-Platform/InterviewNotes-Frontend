import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sequenceHints, sequenceKey } from "./hintSequences";
import type { CatalogSection } from "./types";

const hint = (id: string, link?: CatalogSection["link"]): CatalogSection => ({
   id,
   type: "hint",
   title: null,
   body: { format: "markdown@1", text: id },
   ...(link === undefined ? {} : { link }),
});
const over = (target: string) => ({ target, withheld: false });
const WITHHELD = { target: null, withheld: true };
const ids = (hints: readonly CatalogSection[] | undefined) => hints?.map(({ id }) => id);
const units = (...unitIds: string[]) => unitIds.map((id) => ({ id }));

describe("sequenceHints: narrative stages (S-HNT-5)", () => {
   it("makes one stage sequence of hints over different sections, in authored order", () => {
      const result = sequenceHints("design", [hint("h1", over("entities")), hint("h2", over("interfaces")), hint("h3", over("high-level-design"))], []);
      expect(ids(result.stage)).toEqual(["h1", "h2", "h3"]);
      expect(result.units.size).toBe(0);
   });

   it("needs no link and ignores a withheld one", () => {
      const result = sequenceHints("frame", [hint("h1"), hint("h2", WITHHELD), hint("h3", null)], []);
      expect(ids(result.stage)).toEqual(["h1", "h2", "h3"]);
   });

   it("is empty when the stage has no hint", () => {
      expect(sequenceHints("requirements", [], units("a"))).toEqual({ stage: [], units: new Map() });
   });
});

describe("sequenceHints: unit stages (S-HNT-5)", () => {
   it("gives each released unit its own sequence in Depth & Trade-offs", () => {
      const result = sequenceHints(
         "depth_and_trade_offs",
         [hint("h1", over("deep-a")), hint("h2", over("decision")), hint("h3", over("deep-a"))],
         units("deep-a", "decision", "deep-b")
      );
      expect(ids(result.units.get("deep-a"))).toEqual(["h1", "h3"]);
      expect(ids(result.units.get("decision"))).toEqual(["h2"]);
      expect(result.units.has("deep-b")).toBe(false);
      expect(result.stage).toEqual([]);
   });

   it("gives a released follow-up branch its own sequence", () => {
      const result = sequenceHints("follow_ups", [hint("h1", over("lag-branch")), hint("h2", over("lag"))], units("lag", "lag-branch"));
      expect(ids(result.units.get("lag-branch"))).toEqual(["h1"]);
      expect(ids(result.units.get("lag"))).toEqual(["h2"]);
   });

   it("collects hints over withheld targets into one stage sequence in authored order, naming nothing about the target", () => {
      const result = sequenceHints(
         "follow_ups",
         [hint("h1", WITHHELD), hint("h2", over("lag")), hint("h3", { target: null, withheld: true })],
         units("lag")
      );
      expect(ids(result.stage)).toEqual(["h1", "h3"]);
      expect(ids(result.units.get("lag"))).toEqual(["h2"]);
   });

   it("treats a link with no target as withheld, whatever its flag says", () => {
      expect(ids(sequenceHints("depth_and_trade_offs", [hint("h1", { target: null, withheld: false })], []).stage)).toEqual(["h1"]);
   });

   it("omits a hint it cannot place instead of inventing a position", () => {
      const result = sequenceHints("depth_and_trade_offs", [hint("none"), hint("null", null), hint("elsewhere", over("not-a-released-unit"))], units("deep-a"));
      expect(result.stage).toEqual([]);
      expect(result.units.size).toBe(0);
   });

   it("follows a hint's own link by one lookup in the stage's units only", () => {
      // A unit's own link is never read: `hop` is a released unit, but it is not what this hint targets.
      const hop = { id: "hop", link: over("deep-a") };
      const result = sequenceHints("depth_and_trade_offs", [hint("h1", over("deep-a"))], [hop]);
      expect(result.units.size).toBe(0);
   });
});

describe("sequenceHints: purity", () => {
   it("does not change its inputs or one sequence's list through another", () => {
      const hints = [hint("h1", over("a")), hint("h2", over("b")), hint("h3", WITHHELD)];
      const before = JSON.stringify(hints);
      const result = sequenceHints("depth_and_trade_offs", hints, units("a", "b"));
      expect(JSON.stringify(hints)).toBe(before);
      expect(result.units.get("a")).not.toBe(result.units.get("b"));
      expect(result.units.get("a")).not.toBe(result.stage);
   });

   it("names each sequence by stage and unit", () => {
      expect(sequenceKey("design")).toBe("design");
      expect(sequenceKey("follow_ups", "lag")).toBe("follow_ups:lag");
      expect(sequenceKey("depth_and_trade_offs", "x")).not.toBe(sequenceKey("follow_ups", "x"));
   });

   it("depends on neither React nor I/O", () => {
      const source = readFileSync(join(__dirname, "hintSequences.ts"), "utf8");
      expect(source).not.toMatch(/from "react|from "next|from "node:|fetch\(|server-only|use client/);
      expect([...source.matchAll(/^import .*$/gm)].map(([line]) => line)).toEqual(['import type { CatalogSection } from "./types";']);
   });
});
