// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fixture from "../e2e/catalog/fixture.json";
import { P4_CANARIES, PROTECTED_CANARIES, P4_TARGET_ID_CANARY, P4_TARGET_TITLE_CANARY } from "./canaries";

// The fake API's withholding is a security test surface (S-API-9): it must not be looser than the backend (S-API-4, S-API-5).
interface Section {
   id: string;
   type: string;
   title: string | null;
   spine_position: string | null;
   link: { target: string | null; withheld: boolean } | null;
   dimension: string | null;
   body: { text: string };
}
interface Spine {
   position: string;
   kind: string;
   withheld: boolean | null;
}
interface ItemOut {
   sections: Section[];
   sections_withheld: boolean;
   spine?: Spine[] | null;
}
interface FixtureSection {
   id: string;
   title: string | null;
   access: string;
}
interface FixtureItem {
   id: string;
   sections?: FixtureSection[];
}

const items = fixture.items as unknown as FixtureItem[];
const p4 = items.filter((item) => item.id.startsWith("problem.p4-"));
type Caller = "signed-out" | "unentitled" | "entitled";
const CALLERS: Caller[] = ["signed-out", "unentitled", "entitled"];

let server: ChildProcess;
let origin = "";

async function freePort(): Promise<number> {
   return new Promise((resolve) => {
      const probe = createServer().listen(0, "127.0.0.1", () => {
         const { port } = probe.address() as { port: number };
         probe.close(() => resolve(port));
      });
   });
}

beforeAll(async () => {
   const port = await freePort();
   origin = `http://127.0.0.1:${port}`;
   server = spawn("node", [join(__dirname, "..", "e2e", "catalog", "fake-api.mjs"), String(port)], { stdio: "ignore" });
   for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
         if ((await fetch(`${origin}/health`)).ok) return;
      } catch {
         await new Promise((wait) => setTimeout(wait, 50));
      }
   }
   throw new Error("the fake API did not start");
});

afterAll(() => server?.kill());

async function read(id: string, caller: Caller): Promise<{ text: string; body: ItemOut }> {
   const [type, slug] = id.split(".");
   const token = caller === "signed-out" ? null : fixture.identities[caller].token;
   const response = await fetch(`${origin}/catalog/items/${type}/${slug}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
   expect(response.status, `${id} as ${caller}`).toBe(200);
   const text = await response.text();
   return { text, body: JSON.parse(text) };
}

const section = (out: ItemOut, id: string) => out.sections.find((candidate) => candidate.id === id);
const flags = (out: ItemOut) => out.spine?.map(({ position, withheld }) => `${position}:${withheld}`);
const premiumOf = (id: string) => (items.find((item) => item.id === id)?.sections ?? []).filter((candidate) => candidate.access === "premium");

describe("an unentitled caller never receives withheld identity or content", () => {
   it.each(p4.flatMap((item) => (["signed-out", "unentitled"] as const).map((caller) => [item.id, caller] as const)))("%s, %s", async (id, caller) => {
      const { text, body } = await read(id, caller);
      for (const canary of PROTECTED_CANARIES) expect(text, canary).not.toContain(canary);
      const withheld = premiumOf(id);
      for (const { id: sectionId, title } of withheld) {
         expect(body.sections.map((released) => released.id), sectionId).not.toContain(sectionId);
         expect(body.sections.flatMap((released) => (released.link?.target ? [released.link.target] : [])), sectionId).not.toContain(sectionId);
         if (title) expect(body.sections.map((released) => released.title), title).not.toContain(title);
      }
      expect(body.sections_withheld).toBe(withheld.length > 0);
      for (const link of body.sections.flatMap((released) => (released.link ? [released.link] : []))) {
         expect(link.target === null, "target is null exactly when withheld").toBe(link.withheld);
      }
   });

   it("holds back the identity canaries of the withheld target and still names the released branch's link as withheld", async () => {
      const { text, body } = await read("problem.p4-premium-followups", "unentitled");
      expect(text).not.toContain(P4_TARGET_ID_CANARY);
      expect(text).not.toContain(P4_TARGET_TITLE_CANARY);
      expect(section(body, "branch-of-withheld")?.link).toEqual({ target: null, withheld: true });
   });
});

describe("an entitled caller receives everything, with nothing flagged", () => {
   it.each(p4.map((item) => [item.id] as const))("%s", async (id) => {
      const { text, body } = await read(id, "entitled");
      const premium = premiumOf(id);
      expect(body.sections_withheld).toBe(false);
      for (const { id: sectionId } of premium) expect(section(body, sectionId), sectionId).toBeDefined();
      for (const entry of body.spine ?? []) expect(entry.withheld, entry.position).toBe(entry.kind === "review_surface" ? null : false);
      const present = P4_CANARIES.filter((canary) => text.includes(canary));
      expect(present.length > 0).toBe(premium.length > 0);
      for (const released of body.sections.filter((candidate) => candidate.link)) expect(released.link?.withheld).toBe(false);
   });

   it("delivers every P4 canary somewhere across the entitled renders", async () => {
      const texts = await Promise.all(p4.map(async (item) => (await read(item.id, "entitled")).text));
      for (const canary of P4_CANARIES) expect(texts.some((text) => text.includes(canary)), canary).toBe(true);
   });
});

describe("X-1: a released hint keeps its target's position, and names nothing about a withheld target", () => {
   it("places hints over withheld targets in their stage with a generic withheld link", async () => {
      const { body } = await read("problem.p4-premium-stages", "unentitled");
      for (const [id, position] of [["hint-design-1", "design"], ["hint-design-2", "design"], ["hint-follow-up", "follow_ups"]]) {
         const hint = section(body, id);
         expect(hint?.spine_position, id).toBe(position);
         expect(hint?.link, id).toEqual({ target: null, withheld: true });
      }
   });

   it("places a hint over a withheld decision and a withheld follow-up", async () => {
      const units = await read("problem.p4-premium-units", "unentitled");
      expect(section(units.body, "hint-decision")).toMatchObject({ spine_position: "depth_and_trade_offs", link: { target: null, withheld: true } });
      const followUps = await read("problem.p4-premium-followups", "unentitled");
      expect(section(followUps.body, "hint-withheld")).toMatchObject({ spine_position: "follow_ups", link: { target: null, withheld: true } });
   });

   it("names the target of a hint whose target is released, for every caller", async () => {
      for (const caller of CALLERS) {
         const { body } = await read("problem.p4-sd-complete", caller);
         expect(section(body, "hint-design-1")).toMatchObject({ spine_position: "design", link: { target: "high-level-design", withheld: false } });
      }
   });

   it("leaves a released follow-up over a withheld decision top-level with a withheld link", async () => {
      const { body } = await read("problem.p4-premium-units", "unentitled");
      expect(section(body, "follow-up-released")?.link).toEqual({ target: null, withheld: true });
   });
});

describe("X-2: interview stages stay listed and flagged; review surfaces appear only with a released section", () => {
   it("flags a stage withheld in full and a stage withheld in part, and omits a fully withheld review surface", async () => {
      const unentitled = await read("problem.p4-premium-stages", "unentitled");
      expect(flags(unentitled.body)).toEqual([
         "frame:false",
         "requirements:true",
         "design:true",
         "evaluate_and_scale:true",
         "follow_ups:true",
         "self_review:null",
      ]);
      expect(unentitled.body.spine?.some((entry) => entry.position === "reference_solution")).toBe(false);
      const entitled = await read("problem.p4-premium-stages", "entitled");
      expect(flags(entitled.body)).toEqual([
         "frame:false",
         "requirements:false",
         "design:false",
         "evaluate_and_scale:false",
         "follow_ups:false",
         "reference_solution:null",
         "self_review:null",
      ]);
   });

   it("flags a stage whose only withheld section is a hint", async () => {
      expect(flags((await read("problem.p4-premium-hints", "unentitled")).body)).toEqual(["frame:false", "requirements:true", "design:true"]);
   });

   it("keeps a review surface with a released section, flagged null, and drops one whose sections are all withheld", async () => {
      expect(flags((await read("problem.p4-premium-rubric", "unentitled")).body)).toEqual(["frame:false", "design:false", "self_review:null"]);
      expect(flags((await read("problem.p4-premium-alternatives", "unentitled")).body)).toEqual(["frame:false", "depth_and_trade_offs:false", "reference_solution:null"]);
   });

   it("lists a stage whose only section is withheld, for the Frame prompt and for an unknown stage", async () => {
      expect(flags((await read("problem.p4-premium-prompt", "unentitled")).body)).toEqual(["frame:true", "requirements:false"]);
      const unknown = await read("problem.p4-unknown-values", "unentitled");
      expect(flags(unknown.body)).toEqual(["frame:false", "design:false", "follow_ups:false", "p4_future_zone:false", "p4_future_stage:true"]);
      expect(unknown.body.sections.some((released) => released.spine_position === "p4_future_stage")).toBe(false);
   });

   it("flags nothing for a Problem with no premium section, for any caller", async () => {
      for (const caller of CALLERS) {
         const { body } = await read("problem.p4-sd-complete", caller);
         expect(body.spine?.every((entry) => entry.withheld === (entry.kind === "review_surface" ? null : false))).toBe(true);
         expect(body.sections_withheld).toBe(false);
      }
   });
});

describe("fixture values are served as authored", () => {
   it("serves unknown types, positions and dimensions untouched", async () => {
      const { body } = await read("problem.p4-unknown-values", "entitled");
      expect(section(body, "future-unit")).toMatchObject({ type: "p4_future_unit", spine_position: "design" });
      expect(section(body, "future-zone")?.spine_position).toBe("p4_future_zone");
      expect(section(body, "no-position")?.spine_position).toBeNull();
      expect(section(body, "future-dimension")?.dimension).toBe("p4_future_dimension");
   });

   it("serves a section without a link or dimension as null", async () => {
      const { body } = await read("problem.p4-sd-complete", "entitled");
      expect(section(body, "functional")).toMatchObject({ link: null, dimension: null });
      expect(section(body, "follow-up-lag")).toMatchObject({ dimension: "reliability_and_operations", link: { target: "deep-dive-delivery", withheld: false } });
   });

   it("serves a Problem without P4 fixture values as a backend that predates P4 would", async () => {
      const { body } = await read("problem.catalog-t8-gated-walkthrough", "entitled");
      expect(body).not.toHaveProperty("spine");
      for (const released of body.sections) expect(Object.keys(released).sort()).toEqual(["body", "id", "title", "type"]);
   });
});
