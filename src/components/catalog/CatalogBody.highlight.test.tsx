import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockOverflow } from "@/test/overflow";

vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: "<svg/>" })) } }));

import { CatalogBody } from "./CatalogBody";

const body = (text: string) => ({ format: "markdown@1" as const, text });
const fence = (info: string, content: string) => "```" + info + "\n" + content + "\n```";
const show = (text: string) => render(<CatalogBody body={body(text)} />);
const serverHtml = (text: string) => {
   const host = document.createElement("div");
   host.innerHTML = renderToString(<CatalogBody body={body(text)} />);
   return host;
};
const tokens = (root: ParentNode) => root.querySelectorAll("code span[class^='hljs-']");

const SAMPLES: Record<string, string> = {
   python: "def rank(items):\n    return sorted(items)  # stable",
   typescript: "const total: number = 1;",
   javascript: 'const label = "a";',
   json: '{"key": 1}',
   yaml: "key: 1\nlist:\n  - a",
   bash: 'echo "hi" # note',
   sql: "SELECT id FROM users WHERE id = 1;",
};
const ALIASES = [
   ["py", "python"],
   ["ts", "typescript"],
   ["js", "javascript"],
   ["sh", "bash"],
   ["shell", "bash"],
   ["yml", "yaml"],
] as const;

const writeText = vi.fn();
beforeEach(() => {
   writeText.mockReset().mockResolvedValue(undefined);
   Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(() => vi.restoreAllMocks());

describe("server-side syntax highlighting", () => {
   it.each(Object.entries(SAMPLES))("highlights a registered %s block in the server HTML and keeps its text", (language, source) => {
      const host = serverHtml(fence(language, source));
      expect(tokens(host).length).toBeGreaterThan(0);
      expect(host.querySelector("code")!.textContent).toBe(source + "\n");
   });

   it.each(ALIASES)("highlights the %s alias exactly as %s", (alias, language) => {
      const code = (info: string) => serverHtml(fence(info, SAMPLES[language])).querySelector("code")!.innerHTML;
      expect(tokens(serverHtml(fence(alias, SAMPLES[language]))).length).toBeGreaterThan(0);
      expect(code(alias)).toBe(code(language));
   });

   it("matches the language case-insensitively, as the header label does", () => {
      expect(tokens(serverHtml(fence("Python", SAMPLES.python))).length).toBeGreaterThan(0);
   });

   it.each(["cobol", "", "text", "plaintext", "txt", "java", "rust"])("leaves a ```%s block plain, with no error or console output", (info) => {
      const spies = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log")];
      const host = serverHtml(fence(info, "SELECT 1 FROM t; def f(): return 1"));
      expect(host.querySelector("code span")).toBeNull();
      expect(host.querySelector("code")!.textContent).toBe("SELECT 1 FROM t; def f(): return 1\n");
      show(fence(info, "x"));
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
   });

   it("never infers a language for a fence without one", () => {
      const host = serverHtml(fence("", "def rank(items):\n    return sorted(items)"));
      expect(host.querySelector("code")).not.toHaveClass("hljs");
      expect(tokens(host)).toHaveLength(0);
   });

   it("does not change a diagram or inline code", () => {
      const host = serverHtml(fence("mermaid", "graph LR\n  A --> B") + "\n\nUse `def f(): return 1` here.");
      expect(host.querySelector("figure")).not.toBeNull();
      expect(host.querySelector("p code")!.innerHTML).toBe("def f(): return 1");
   });
});

describe("a highlighted block keeps its chrome and names", () => {
   it("keeps the group name, the header and the scroll region name", () => {
      const measure = mockOverflow({ scrollWidth: 900, clientWidth: 300 });
      show(fence('python title="ranker.py"', SAMPLES.python));
      measure();
      const group = screen.getByRole("group", { name: "Python code: ranker.py" });
      expect(within(group).getByRole("button", { name: "Copy Python code" })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Python code: ranker.py" })).toHaveAttribute("tabindex", "0");
   });

   it("adds no focusable element, role or ARIA to the tokens", () => {
      const { container } = show(fence("python", SAMPLES.python));
      expect(tokens(container).length).toBeGreaterThan(0);
      for (const token of tokens(container)) {
         expect(token.tagName).toBe("SPAN");
         expect(token.attributes).toHaveLength(1);
      }
      expect(container.querySelectorAll("button, [tabindex]")).toHaveLength(1);
   });
});

describe("Copy of a highlighted block", () => {
   const press = () => act(async () => fireEvent.click(screen.getByRole("button", { name: /^Copy/ })));

   it.each(Object.entries(SAMPLES))("copies the exact %s fence text, not the highlighted text", async (language, source) => {
      show(fence(language, source));
      await press();
      expect(writeText).toHaveBeenCalledExactlyOnceWith(source);
   });

   it("copies markup-like source, blank lines and indentation verbatim", async () => {
      const source = "x = '<b>&amp;</b>'\n\n    y = \"q\"  # <i>";
      show(fence("python", source));
      await press();
      expect(writeText).toHaveBeenCalledExactlyOnceWith(source);
   });
});

describe("theme tokens", () => {
   const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
   const block = (selector: string) => css.slice(css.indexOf(`\n${selector} {`)).split("\n}")[0];
   const defined = (selector: string) => [...block(selector).matchAll(/(--syntax-[a-z]+):/g)].map(([, name]) => name);
   const rules = css.split("\n").filter((line) => line.startsWith(".hljs "));

   it("colours every token class from a --syntax variable, never a literal colour", () => {
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) expect(rule).toMatch(/\{ color: var\(--syntax-[a-z]+\); \}$/);
   });

   it("defines each variable the rules use for light, and every one that differs for dark", () => {
      const used = new Set(rules.flatMap((rule) => [...rule.matchAll(/var\((--syntax-[a-z]+)\)/g)].map(([, name]) => name)));
      expect([...used].sort()).toEqual(defined(":root").sort());
      // Comments reuse --muted-foreground, which the dark theme already redefines.
      expect(defined(".dark").sort()).toEqual(defined(":root").filter((name) => name !== "--syntax-comment").sort());
   });
});

describe("no client highlighter", () => {
   const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
         const path = join(dir, entry.name);
         return entry.isDirectory() ? walk(path) : /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
      });
   const files = walk(join(process.cwd(), "src")).map((path) => ({ path, text: readFileSync(path, "utf8") }));
   const HIGHLIGHTER = /rehype-highlight|from "lowlight"|highlight\.js|mdx\/highlight|\.\/highlight"/;

   it("is imported only by server code", () => {
      const importers = files.filter(({ text }) => HIGHLIGHTER.test(text));
      expect(importers.map(({ path }) => path.slice(process.cwd().length + 1)).sort()).toEqual([
         "src/components/catalog/CatalogBody.tsx",
         "src/components/mdx/highlight.ts",
      ]);
      for (const { text } of importers) expect(text).not.toMatch(/^["']use client["']/m);
   });

   it("is never reached from a client component through CatalogBody", () => {
      const clients = files.filter(({ text }) => /^["']use client["']/m.test(text));
      expect(clients.filter(({ text }) => /from "[^"]*CatalogBody"/.test(text)).map(({ path }) => path)).toEqual([]);
   });
});
