import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");
const SRC = join(ROOT, "src");
const CREDENTIAL = "CATALOG_PREVIEW_TOKEN";

function files(dir: string, test: (name: string) => boolean): string[] {
   return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path, test);
      return test(name) ? [path] : [];
   });
}

const sources = files(SRC, (name) => /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name));
const read = (path: string) => readFileSync(path, "utf8");
const isClient = (path: string) => /^\s*["']use client["']/.test(read(path));
const rel = (paths: string[]) => paths.map((path) => relative(ROOT, path)).sort();

describe("preview credential boundary", () => {
   it("is read by exactly one module, which is server-only", () => {
      const readers = sources.filter((path) => read(path).includes(CREDENTIAL));
      expect(rel(readers)).toEqual(["src/lib/catalog/preview.ts"]);
      expect(read(readers[0])).toMatch(/^import "server-only";/);
   });

   it("is reached only by the catalog client, the marker and the item page", () => {
      const importers = sources.filter((path) => /from "(@\/lib\/catalog\/|\.\/)preview"/.test(read(path)));
      expect(rel(importers)).toEqual([
         "src/app/_catalog/CatalogItemPage.tsx",
         "src/app/_catalog/PreviewMarker.tsx",
         "src/lib/catalog/client.ts",
      ]);
   });

   it("is never imported, directly or by name, from a client component", () => {
      const clients = sources.filter(isClient);
      expect(clients.length, "no client components found").toBeGreaterThan(0);
      for (const path of clients) {
         expect(read(path), path).not.toMatch(/catalog\/preview|PreviewMarker|CATALOG_PREVIEW|X-Preview-Token/i);
      }
   });

   it("is never exposed through a public env var, a config `env` block or a public asset", () => {
      const configs = [join(ROOT, "next.config.ts"), join(ROOT, "netlify.toml")];
      const assets = files(join(ROOT, "public"), () => true);
      for (const path of [...sources, ...configs, ...assets]) {
         expect(read(path), path).not.toMatch(/NEXT_PUBLIC_\w*(PREVIEW|CATALOG)/i);
      }
      for (const path of [...configs, ...assets]) expect(read(path), path).not.toContain(CREDENTIAL);
   });

   it("is not a prop of the marker or of any catalog component", () => {
      const marker = read(join(SRC, "app", "_catalog", "PreviewMarker.tsx"));
      expect(marker).toMatch(/export function PreviewMarker\(\)/);
      expect(marker).not.toMatch(/token|previewDelivery|headers/i);
   });

   it("is sent only from the catalog client, and never as a query parameter", () => {
      const preview = read(join(SRC, "lib", "catalog", "preview.ts"));
      expect(preview).not.toMatch(/searchParams|[?&]\w+=|console\./);
      const client = read(join(SRC, "lib", "catalog", "client.ts"));
      expect(client).toContain("previewDelivery(base)");
      expect(client).toMatch(/fetch\(`\$\{base\}\$\{path\}`/);
   });

   it("keeps /learn and the rest of the site free of preview behavior", () => {
      for (const path of sources.filter((p) => /src\/(app\/learn|lib\/(content|courses)|components\/layout|middleware)/.test(p))) {
         expect(read(path), path).not.toMatch(/preview|PreviewMarker/i);
      }
   });
});
