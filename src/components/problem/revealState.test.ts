import { beforeEach, describe, expect, it } from "vitest";
import { INITIAL_REVEAL_STATE, allKeys, arrivalAt, openKeys, revealReducer, type RevealState } from "./revealState";

const opened = (...keys: string[]): RevealState => ({ ...INITIAL_REVEAL_STATE, open: new Set(keys) });

describe("the reveal reducer (S-RVL-6, S-RVL-7)", () => {
   it("starts challenge-first: nothing open, not 'everything', no arrival", () => {
      expect(INITIAL_REVEAL_STATE).toEqual({ open: new Set(), everything: false, arrival: null });
   });

   it("toggles one reveal and never touches another (S-RVL-1)", () => {
      const state = revealReducer(opened("a"), { type: "toggle", key: "b", open: true });
      expect([...state.open]).toEqual(["a", "b"]);
      expect([...revealReducer(state, { type: "toggle", key: "a", open: false }).open]).toEqual(["b"]);
   });

   it("returns the same state for a toggle that changes nothing, so nothing re-renders", () => {
      const state = opened("a");
      expect(revealReducer(state, { type: "toggle", key: "a", open: true })).toBe(state);
      expect(revealReducer(state, { type: "toggle", key: "z", open: false })).toBe(state);
   });

   it("opens a path outermost first without closing anything, and records the arrival", () => {
      const arrival = { id: "unit", focus: true };
      const state = revealReducer(opened("elsewhere"), { type: "open", keys: ["list", "unit"], arrival });
      expect([...state.open]).toEqual(["elsewhere", "list", "unit"]);
      expect(state.arrival).toBe(arrival);
   });

   it("adopts reveals already open, and is a no-op when all are known", () => {
      const state = opened("a", "b");
      expect(revealReducer(state, { type: "open", keys: ["a"] })).toBe(state);
      expect([...revealReducer(state, { type: "open", keys: ["c"] }).open]).toEqual(["a", "b", "c"]);
   });

   it("Show everything opens exactly the keys given, sets the flag and drops any arrival", () => {
      const state = revealReducer({ ...opened("stale"), arrival: { id: "x", focus: false } }, { type: "showAll", keys: ["a", "b", "c"] });
      expect([...state.open]).toEqual(["a", "b", "c"]);
      expect(state.everything).toBe(true);
      expect(state.arrival).toBeNull();
   });

   it("Hide everything returns the challenge-first state, whatever the reader opened", () => {
      const shown = revealReducer(opened("a"), { type: "showAll", keys: ["a", "b"] });
      expect(revealReducer(shown, { type: "hideAll" })).toEqual(INITIAL_REVEAL_STATE);
      expect(revealReducer(opened("a"), { type: "hideAll" })).toEqual(INITIAL_REVEAL_STATE);
   });
});

// One released Problem in miniature: a challenge outside any reveal, a hint group, a list of units, a stage reference,
// the reference solution, and Self-review holding its own closed 'common mistakes'.
const PROBLEM = `
<div id="problem_frame" tabindex="-1"></div>
<section id="prompt"><p id="prompt-text"></p></section>
<details data-reveal="hints"><summary></summary><div><section id="hint-one"></section><section id="hint-two"></section></div></details>
<details data-reveal="list"><summary></summary><div>
  <div><h3 id="unit-one"></h3><details data-reveal="unit-one"><summary></summary><div><p id="inside-unit"></p></div></details></div>
  <div><h3 id="unit-two"></h3><details data-reveal="unit-two"><summary></summary><div></div></details></div>
</div></details>
<details data-reveal="stage"><summary></summary><div><section id="entities"></section></div></details>
<details data-reveal="solution"><summary></summary><div><section id="reference-design"></section></div></details>
<details data-reveal="review"><summary></summary><div>
  <section id="level-expectations"></section>
  <details data-reveal="mistakes"><summary></summary><div><section id="common-mistakes"></section></div></details>
</div></details>`;

describe("what a fragment opens (S-RVL-8 … S-RVL-10)", () => {
   beforeEach(() => {
      document.body.innerHTML = PROBLEM;
   });

   it.each([
      ["a released unit: its list, then the unit, which takes focus (S-RVL-8)", "unit-one", ["list", "unit-one"], true],
      ["a hint: the sequence that holds it", "hint-two", ["hints"], false],
      ["a stage-reference section: its stage reference", "entities", ["stage"], false],
      ["reference_design: the Reference Solution reveal", "reference-design", ["solution"], false],
      ["level_expectations: Self-review", "level-expectations", ["review"], false],
      ["common_mistakes: Self-review, then 'Show common mistakes'", "common-mistakes", ["review", "mistakes"], false],
      ["something inside an opened unit: the path to it, without focus", "inside-unit", ["list", "unit-one"], false],
   ])("%s", (_, fragment, keys, focus) => {
      expect(arrivalAt(`#${fragment}`, document)).toEqual({ keys, arrival: { id: fragment, focus } });
   });

   it.each([
      ["the challenge, which is always open, only scrolls", "#prompt"],
      ["text inside the challenge", "#prompt-text"],
      ["a position (page id) only scrolls", "#problem_frame"],
      ["a withheld or absent id does nothing", "#premium-hint"],
      ["an empty fragment", "#"],
      ["no fragment", ""],
      ["a malformed escape does not throw", "#%E0%A4%A"],
   ])("opens nothing for %s", (_, fragment) => {
      expect(arrivalAt(fragment, document)).toBeNull();
   });

   it("reads an escaped id", () => {
      document.body.innerHTML = '<details data-reveal="a b"><summary></summary><h3 id="a b"></h3></details>';
      expect(arrivalAt("#a%20b", document)?.keys).toEqual(["a b"]);
   });

   it("lists every reveal, and the ones the reader already opened", () => {
      expect(allKeys(document)).toEqual(["hints", "list", "unit-one", "unit-two", "stage", "solution", "review", "mistakes"]);
      expect(openKeys(document)).toEqual([]);
      (document.querySelector('[data-reveal="stage"]') as HTMLDetailsElement).open = true;
      expect(openKeys(document)).toEqual(["stage"]);
   });
});
