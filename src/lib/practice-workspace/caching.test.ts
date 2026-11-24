import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

describe("no shared caching of practice pages (P9-R-PRV-06, P9-AC-09.2)", () => {
   it("answers the attempt and history pages private, no-store", async () => {
      const rules = await nextConfig.headers!();
      const by = (source: string) => rules.find((rule) => rule.source === source)?.headers;
      for (const source of ["/practice/attempts/:path*", "/practice/history"]) {
         expect(by(source), source).toContainEqual({ key: "Cache-Control", value: "private, no-store" });
      }
   });

   it("leaves the Problem index and the reader's headers alone", async () => {
      const rules = await nextConfig.headers!();
      expect(rules.map((rule) => rule.source).sort()).toEqual(["/practice/attempts/:path*", "/practice/history"]);
   });

   it("fetches with no-store, sends no cookie, and keeps no browser or Next cache of an answer", () => {
      const client = readFileSync(join(__dirname, "client.ts"), "utf8");
      expect(client).toContain('cache: "no-store"');
      expect(client).toContain('credentials: "omit"');
      for (const file of ["client.ts", "stageSave.ts", "autosave.ts"]) {
         const source = readFileSync(join(__dirname, file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
         expect(source, file).not.toMatch(/next:\s*\{\s*(revalidate|tags)|unstable_cache|"use cache"|caches\.(open|match)/);
      }
   });
});
