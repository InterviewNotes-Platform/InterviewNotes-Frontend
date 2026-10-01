// @vitest-environment node
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import fixture from "../e2e/catalog/fixture.json";
import { BODY_CANARY, DEEP_DIVE_CANARY, PROTECTED_CANARIES, SOLUTION_CANARY } from "./canaries";
import { FIXTURE_ALLOWLIST, findRouteConfigViolations, format, scanFrontendTree, scanPublic, trackedFiles } from "./scanner";

const ROOT = join(__dirname, "..", "..");

interface Section {
   id: string;
   type: string;
   access: string;
   text: string;
}
interface Item {
   id: string;
   access: string;
   body?: string;
   sections?: Section[];
}
const items: Item[] = fixture.items;
const sorted = (values: string[]) => [...values].sort();

describe("frontend repository", () => {
   const tree = scanFrontendTree(ROOT);

   it("holds no premium canary outside the allowlisted fixtures", () => {
      expect(format(tree.findings)).toEqual([]);
   });

   it("read the source, public assets, scripts and tests it is meant to guard", () => {
      for (const kind of ["src", "public", "scripts", "tests", "root"]) {
         expect(tree.scanned[kind] ?? 0, `no ${kind} files scanned`).toBeGreaterThan(0);
      }
   });

   it("saw every canary in the allowlisted fixtures, so a clean result is not a blind scan", () => {
      for (const file of Object.keys(FIXTURE_ALLOWLIST)) {
         expect(sorted(tree.expected[file] ?? []), file).toEqual(sorted(PROTECTED_CANARIES));
      }
   });

   it("allowlists exactly two committed test files, never a directory, source or public path", () => {
      expect(Object.keys(FIXTURE_ALLOWLIST)).toEqual(["tests/e2e/catalog/fixture.json", "tests/leak/canaries.ts"]);
      for (const file of Object.keys(FIXTURE_ALLOWLIST)) {
         expect(file, "an allowlist entry must be a file under tests/").toMatch(/^tests\/[^*]+\.\w+$/);
         expect(trackedFiles(ROOT), "an allowlist entry must be a file git knows").toContain(file);
      }
   });
});

describe("catalog route sources", () => {
   it("force dynamic rendering on every item route and opt no catalog route into static generation or caching", () => {
      expect(findRouteConfigViolations(ROOT)).toEqual([]);
   });
});

describe("public assets", () => {
   const publicFiles = execFileSync("find", ["public", "-type", "f"], { cwd: ROOT }).toString().split("\n").filter(Boolean);

   it("hold no premium canary, and every file in public/ was read", () => {
      const { findings, scanned } = scanPublic(ROOT);
      expect(format(findings)).toEqual([]);
      expect(scanned.public ?? 0).toBe(publicFiles.length);
   });
});

describe("synthetic canary fixture", () => {
   const premiumContent = (item: Item) => [
      ...(item.body !== undefined ? [{ where: `${item.id} body`, access: item.access, text: item.body }] : []),
      ...(item.sections ?? []).map((s) => ({ where: `${item.id} section ${s.id}`, access: s.access, text: s.text })),
   ];
   const holders = (canary: string) => items.flatMap(premiumContent).filter(({ text }) => text.includes(canary));

   it.each(PROTECTED_CANARIES)("%s is in at least one item, and only in premium content", (canary) => {
      const found = holders(canary);
      expect(found.length, `${canary} is not in the fixture, so scanning for it proves nothing`).toBeGreaterThan(0);
      expect(found.filter(({ access }) => access !== "premium").map(({ where }) => where)).toEqual([]);
   });

   it("places the T24 canaries where a body, a solution and a deep dive belong", () => {
      const sectionOf = (canary: string) => items.flatMap((i) => i.sections ?? []).find((s) => s.text.includes(canary));
      expect(items.find((i) => i.body?.includes(BODY_CANARY))?.id).toBe("lesson.t24-premium-body");
      expect(sectionOf(SOLUTION_CANARY)?.type).toBe("solution");
      expect(sectionOf(DEEP_DIVE_CANARY)?.type).toBe("deep_dive");
   });

   it("keeps canaries out of every identity, Track and legacy record", () => {
      const others = JSON.stringify({ identities: fixture.identities, tracks: fixture.tracks, legacy: fixture.legacy });
      for (const canary of PROTECTED_CANARIES) expect(others).not.toContain(canary);
   });

   it("registers distinct canaries, none of which contains another", () => {
      expect(new Set(PROTECTED_CANARIES).size).toBe(PROTECTED_CANARIES.length);
      for (const canary of PROTECTED_CANARIES) {
         expect(canary).toMatch(/^[A-Z0-9_]{12,}$/);
         expect(PROTECTED_CANARIES.filter((other) => other.includes(canary))).toEqual([canary]);
      }
   });
});
