// Test-only: the Lesson catalog the Prepare journey reads (P8-PREP-UX-02). It is the catalog double of tests/e2e/catalog with the six
// behavioral Lessons added from the repository's own fixtures, so the picker has the real questions to show. The double itself is
// copied, not changed: it reads `./fixture.json` beside itself, so it is started from a temporary folder holding the extended one.
//   node tests/e2e/prepare/serve-catalog.mjs <api-port> [auth-port]
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const catalog = join(root, "tests/e2e/catalog");
const fixtures = join(root, "src/lib/prep/fixtures");
const read = (path) => readFileSync(path, "utf8");

const fixture = JSON.parse(read(join(catalog, "fixture.json")));
const headings = { ...JSON.parse(read(join(fixtures, "headings.json"))), ...JSON.parse(read(join(fixtures, "collections-headings.json"))) };
for (const [slug, list] of Object.entries(headings)) {
   const body = read(join(fixtures, `${slug}.md`)).replace(/^---\n[\s\S]*?\n---\n/, "");
   fixture.items.push({
      id: `lesson.${slug}`,
      type: "lesson",
      slug,
      title: slug.replace(/-/g, " "),
      summary: "A synthetic Lesson for the Prepare journey.",
      tags: ["behavioral"],
      difficulty: "medium",
      level: "intermediate",
      access: "free",
      body,
      headings: list,
      relations: {},
   });
}

const dir = mkdtempSync(join(tmpdir(), "prepare-catalog-"));
const clean = () => rmSync(dir, { recursive: true, force: true });
process.on("exit", clean);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(0));
copyFileSync(join(catalog, "fake-api.mjs"), join(dir, "fake-api.mjs"));
writeFileSync(join(dir, "fixture.json"), JSON.stringify(fixture));
await import(pathToFileURL(join(dir, "fake-api.mjs")).href);
