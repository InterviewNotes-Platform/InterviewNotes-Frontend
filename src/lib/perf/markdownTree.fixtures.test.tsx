import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../../tests/e2e/catalog/fixture.json";

// A request-scoped memo stood in for `cache`: one tree per text, shared by every consumer, as in a render.
vi.mock("react", async (importOriginal) => ({
   ...(await importOriginal<typeof import("react")>()),
   cache: <A, R>(fn: (arg: A) => R) => {
      const memo = new Map<A, R>();
      return (arg: A) => (memo.has(arg) ? memo.get(arg)! : (memo.set(arg, fn(arg)), memo.get(arg)!));
   },
}));
vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => <div data-testid="mermaid" /> }));
vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { useLinkStatus: () => ({ pending: false }), default: ({ prefetch, ...props }: Record<string, unknown>) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});

import { ReaderToolStoreProvider } from "@/components/reader/readerState";
import { CatalogBody } from "@/components/catalog/CatalogBody";
import { markdownBlocks, parseBlocks } from "@/components/catalog/blocks";
import { knowledgeCoverage } from "@/components/catalog/knowledgeRefs";
import { parseMarkdown } from "./markdownTree";

type FixtureItem = { id: string; body?: string; sections?: { id: string; text: string }[]; headings?: { id: string; level: number; text: string }[] };
const bodies = (fixture.items as FixtureItem[]).flatMap((item) => [
   ...(item.body ? [{ name: `${item.id} body`, text: item.body, headings: item.headings ?? [] }] : []),
   ...(item.sections ?? []).map((section) => ({ name: `${item.id} ${section.id}`, text: section.text, headings: [] })),
]);
const support = new Map(["batching", "attention", "kv-cache", "p3-ref-related", "p3-prac-shared"].map((slug) => [`knowledge.${slug}`, { title: slug, summary: "s", access: "free" as const, href: `/knowledge/${slug}` }]));
const show = (text: string, headings: { id: string; level: number; text: string }[]) =>
   render(
      <ReaderToolStoreProvider>
         <CatalogBody body={{ format: "markdown@1", text }} reading={{ headings, knowledge: support as never, exhibits: true }} />
      </ReaderToolStoreProvider>
   ).container.innerHTML.replace(/radix-_r_\w+_/g, "radix-id"); // React and Radix number their ids per render

afterEach(() => {
   delete process.env.BODY_PARSE_ONCE;
});

describe("shared markdown trees across every fixture body and section", () => {
   it("covers GFM, parts, callouts, code, Knowledge references and Premium sections", () => {
      const all = bodies.map(({ text }) => text).join("\n");
      expect(bodies.length).toBeGreaterThan(100);
      for (const marker of ["|---", "```", "::: part", "::: callout", "ref:knowledge."]) expect(all, marker).toContain(marker);
      expect(all).toContain("PREMIUM");
   });

   it.each(bodies.map((entry) => [entry.name, entry] as const))("%s: rendering leaves the shared tree unchanged and the page identical to a fresh parse", (_, { text, headings }) => {
      const blocks = markdownBlocks(parseBlocks(text));
      const before = blocks.map((block) => JSON.stringify(parseMarkdown(block.text)));
      knowledgeCoverage(parseBlocks(text), support);
      const shared = show(text, headings);
      expect(blocks.map((block) => JSON.stringify(parseMarkdown(block.text)))).toEqual(before);

      process.env.BODY_PARSE_ONCE = "off";
      expect(show(text, headings)).toBe(shared);
   });
});
