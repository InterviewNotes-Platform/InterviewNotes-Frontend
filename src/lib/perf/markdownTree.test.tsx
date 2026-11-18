import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// React's request-scoped `cache`, stood in for by a memo that counts how often the wrapped function really runs.
const runs = vi.hoisted(() => ({ count: 0, memos: [] as Map<unknown, unknown>[] }));
vi.mock("react", async (importOriginal) => ({
   ...(await importOriginal<typeof import("react")>()),
   cache: <A, R>(fn: (arg: A) => R) => {
      const memo = new Map<A, R>();
      runs.memos.push(memo);
      return (arg: A) => {
         if (!memo.has(arg)) {
            runs.count += 1;
            memo.set(arg, fn(arg));
         }
         return memo.get(arg)!;
      };
   },
}));
vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => <div data-testid="mermaid" /> }));
vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { useLinkStatus: () => ({ pending: false }), default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { CatalogBody } from "@/components/catalog/CatalogBody";
import { parseBlocks } from "@/components/catalog/blocks";
import { knowledgeCoverage } from "@/components/catalog/knowledgeRefs";
import { parseMarkdown, parseReleasedBodies } from "./markdownTree";

const TEXT = [
   "## Why [batching](ref:knowledge.batching) works",
   "",
   "Prose with a [link](https://example.com) and `code`.",
   "",
   "| a | b |\n|---|---|\n| 1 | 2 |",
   "",
   "```python",
   "def f(x):\n    return [x]",
   "```",
   "",
   "Again [batching](ref:knowledge.batching).",
].join("\n");
const body = { format: "markdown@1" as const, text: TEXT };
const reading = { headings: [{ id: "why", level: 2, text: "Why [batching](ref:knowledge.batching) works" }], knowledge: new Map([["knowledge.batching", { title: "Batching", summary: "s", access: "free" as const, href: "/knowledge/batching" }]]) };
const html = () => render(<CatalogBody body={body} reading={reading as never} />).container.innerHTML;

beforeEach(() => {
   runs.count = 0;
   runs.memos.forEach((memo) => memo.clear());
   delete process.env.BODY_PARSE_ONCE;
});
afterEach(() => {
   delete process.env.BODY_PARSE_ONCE;
});

describe("one parse of each markdown block per render", () => {
   it("renders the same page whether or not the parsed tree is shared", () => {
      const shared = html();
      process.env.BODY_PARSE_ONCE = "off";
      expect(html()).toBe(shared);
   });

   it("parses a block once for the coverage scan, the early parse and the renderer", () => {
      const blocks = parseBlocks(TEXT);
      knowledgeCoverage(blocks, reading.knowledge);
      knowledgeCoverage(blocks, reading.knowledge);
      html();
      expect(runs.count).toBe(1);
   });

   it("leaves the shared tree exactly as parsed", () => {
      const before = JSON.stringify(parseMarkdown(TEXT));
      html();
      expect(JSON.stringify(parseMarkdown(TEXT))).toBe(before);
   });

   it("parses fresh every time when switched off", () => {
      process.env.BODY_PARSE_ONCE = "off";
      html();
      expect(runs.count).toBe(0);
      expect(parseMarkdown(TEXT)).not.toBe(parseMarkdown(TEXT));
   });
});

describe("parseReleasedBodies", () => {
   const section = (text: string) => ({ id: "s", type: "prompt", title: null, body: { format: "markdown@1" as const, text } });

   it("parses the body and every section block, so the render finds them ready", async () => {
      await parseReleasedBodies({ body, sections: [section("One."), section("Two.\n\n::: callout kind=tip\nThree.\n:::")] });
      expect(runs.count).toBe(4);
      html();
      expect(runs.count).toBe(4);
   });

   it("does nothing without a markdown body, and nothing when switched off", async () => {
      await parseReleasedBodies({ body: null, sections: [] });
      process.env.BODY_PARSE_ONCE = "off";
      await parseReleasedBodies({ body, sections: [] });
      expect(runs.count).toBe(0);
   });
});
