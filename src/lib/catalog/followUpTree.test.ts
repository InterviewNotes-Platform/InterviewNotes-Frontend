import { describe, expect, it } from "vitest";
import { followUpTree } from "./followUpTree";
import { composeProblem, firstHintSequence } from "./problemSpine";
import type { CatalogSection, CatalogSpineEntry } from "./types";

const followUp = (id: string, target?: string | "withheld", position = "follow_ups"): CatalogSection => ({
   id,
   type: "follow_ups",
   title: id,
   body: { format: "markdown@1", text: id },
   spine_position: position,
   ...(target === undefined ? {} : { link: target === "withheld" ? { target: null, withheld: true } : { target, withheld: false } }),
});
const decision: CatalogSection = { id: "decision", type: "trade_offs", title: "Queue or direct send", body: { format: "markdown@1", text: "d" }, spine_position: "depth_and_trade_offs" };
const hint = (id: string, target: string): CatalogSection => ({
   id,
   type: "hint",
   title: null,
   body: { format: "markdown@1", text: id },
   spine_position: "follow_ups",
   link: { target, withheld: false },
});
const ids = (sections: readonly CatalogSection[] | undefined) => sections?.map(({ id }) => id);
const tree = (...followUps: CatalogSection[]) => {
   const result = followUpTree(followUps, [decision, ...followUps]);
   return { top: ids(result.top), branches: Object.fromEntries([...result.branches].map(([parent, branches]) => [parent, ids(branches)])) };
};

describe("followUpTree: two levels, parent to children only (S-FUP-4, S-FUP-5, S-LNK-9)", () => {
   it.each([
      ["no links", [followUp("a"), followUp("b")], { top: ["a", "b"], branches: {} }],
      ["links to units, not follow-ups", [followUp("a", "decision"), followUp("b", "decision")], { top: ["a", "b"], branches: {} }],
      ["a branch under its parent, authored after it", [followUp("a"), followUp("b", "a")], { top: ["a"], branches: { a: ["b"] } }],
      ["a branch authored before its parent", [followUp("b", "a"), followUp("a")], { top: ["a"], branches: { a: ["b"] } }],
      [
         "several branches, each parent keeping authored order",
         [followUp("a"), followUp("c"), followUp("b2", "a"), followUp("d", "c"), followUp("b1", "a")],
         { top: ["a", "c"], branches: { a: ["b2", "b1"], c: ["d"] } },
      ],
      ["a follow-up with a withheld target is top-level and keeps its released branch", [followUp("a", "withheld"), followUp("b", "a")], { top: ["a"], branches: { a: ["b"] } }],
      ["a follow-up whose target is not released is top-level", [followUp("a", "gone")], { top: ["a"], branches: {} }],
      ["a branch of a branch is no third level: it stays top-level", [followUp("a"), followUp("b", "a"), followUp("c", "b")], { top: ["a", "c"], branches: { a: ["b"] } }],
      ["a cycle has no top-level member, so each stays top-level", [followUp("a", "b"), followUp("b", "a")], { top: ["a", "b"], branches: {} }],
      ["a follow-up targeting itself stays top-level", [followUp("a", "a")], { top: ["a"], branches: {} }],
   ])("%s", (_name, followUps, expected) => {
      expect(tree(...followUps)).toEqual(expected);
   });

   it("keeps a branch whose parent is withheld top-level: the parent was never released, so none is guessed", () => {
      // The API names nothing of a withheld parent (S-API-4): the branch carries `withheld`, not the parent's id.
      expect(tree(followUp("free-parent"), followUp("branch-of-secret", "withheld"))).toEqual({ top: ["free-parent", "branch-of-secret"], branches: {} });
   });
});

const SPINE: CatalogSpineEntry[] = ["depth_and_trade_offs", "follow_ups"].map((position) => ({ position, kind: "interview_stage", withheld: false }));

describe("composeProblem: the Follow-ups stage (S-FUP-5, S-HNT-8)", () => {
   const compose = (...sections: CatalogSection[]) => composeProblem({ spine: SPINE, sections });
   const stage = (...sections: CatalogSection[]) => compose(...sections).interview.find(({ position }) => position === "follow_ups")!;

   it("lists only the top-level follow-ups in its group, and carries the branches beside it", () => {
      const result = stage(followUp("b", "a"), followUp("a"), followUp("plain"));
      expect(result.groups.map(({ role, sections }) => [role, ids(sections)])).toEqual([["followUps", ["a", "plain"]]]);
      expect(ids(result.branches.get("a"))).toEqual(["b"]);
   });

   it("keeps a hint over a branch in the branch's own sequence", () => {
      const result = stage(followUp("a"), followUp("b", "a"), hint("h", "b"));
      expect([...result.unitHints.keys()]).toEqual(["b"]);
   });

   it("puts the explanatory line on the first sequence in presentation order, a parent's branches before the next top-level follow-up", () => {
      // Authored: a, c, b (a branch of a). Presented: a, b, c. So b's sequence comes first although c is listed before it.
      const result = compose(followUp("a"), followUp("c"), followUp("b", "a"), hint("h-c", "c"), hint("h-b", "b"));
      expect(firstHintSequence(result.interview)).toBe("follow_ups:b");
   });

   it("puts it on the parent when the parent has hints, before its own branches", () => {
      const result = compose(followUp("a"), followUp("b", "a"), hint("h-b", "b"), hint("h-a", "a"));
      expect(firstHintSequence(result.interview)).toBe("follow_ups:a");
   });
});
