import { afterEach, describe, expect, it, vi } from "vitest";
import { codeName, diagramName, languageLabel, parseFence } from "./fence";

afterEach(() => vi.restoreAllMocks());

describe("parseFence", () => {
   it("keeps the language token as written, with no metadata", () => {
      expect(parseFence("Python", null)).toEqual({ language: "Python" });
      expect(parseFence(undefined, undefined)).toEqual({ language: "" });
   });

   it.each([
      ["a code title", "python", 'title="ranker.py"', { title: "ranker.py" }],
      ["a title with spaces and punctuation", "ts", 'title="src/a b.ts (v2)"', { title: "src/a b.ts (v2)" }],
      ["a diagram caption and alt", "mermaid", 'caption="Shared KV blocks" alt="Three requests."', { caption: "Shared KV blocks", alt: "Three requests." }],
      ["attributes separated by tabs", "mermaid", 'caption="C"\talt="A"', { caption: "C", alt: "A" }],
   ])("reads %s", (_, language, meta, expected) => {
      expect(parseFence(language, meta)).toEqual({ language, ...expected });
   });

   it.each([
      ["an unknown key", "python", 'color="red" title="a.py"', { title: "a.py" }],
      ["only unknown keys", "python", 'highlight="1-3"', {}],
      ["title on a diagram", "mermaid", 'title="x" caption="C"', { caption: "C" }],
      ["caption and alt on code", "python", 'caption="C" alt="A"', {}],
   ])("ignores %s", (_, language, meta, expected) => {
      expect(parseFence(language, meta)).toEqual({ language, ...expected });
   });

   it("uses the first occurrence of a duplicated key", () => {
      expect(parseFence("python", 'title="first" title="second"').title).toBe("first");
      expect(parseFence("mermaid", 'alt="one" caption="c" alt="two"').alt).toBe("one");
   });

   it("takes an empty value as absent, and an empty first duplicate still wins", () => {
      expect(parseFence("python", 'title=""')).toEqual({ language: "python" });
      expect(parseFence("python", 'title="   "')).toEqual({ language: "python" });
      expect(parseFence("python", 'title="" title="second"')).toEqual({ language: "python" });
   });

   it.each([
      ["an unterminated value", 'title="unterminated caption=\'broken'],
      ["an unquoted value", "title=ranker.py"],
      ["single quotes", "title='ranker.py'"],
      ["a bare word", "title"],
      ["an uppercase key", 'Title="a.py"'],
      ["no space between attributes", 'title="a"caption="b"'],
      ["a stray token after a valid attribute", 'title="a.py" oops'],
      ["a quote inside a value", 'title="a"b"'],
   ])("drops all metadata but keeps the language for %s", (_, meta) => {
      expect(parseFence("python", meta)).toEqual({ language: "python" });
      expect(parseFence("mermaid", `caption="kept?" ${meta}`)).toEqual({ language: "mermaid" });
   });

   it("keeps a value as plain text: nothing is interpreted", () => {
      expect(parseFence("python", 'title="**a** <b>b</b> [c](https://x.test)"').title).toBe("**a** <b>b</b> [c](https://x.test)");
   });

   it("never throws and never logs, whatever it is given", () => {
      const spies = (["log", "warn", "error", "info", "debug"] as const).map((level) => vi.spyOn(console, level));
      for (const meta of ["", "=", '="', '"""', "title=\"\n\"", "\u0000", "a".repeat(5000), '="x"'.repeat(500), '\\"']) {
         expect(() => parseFence("python", meta)).not.toThrow();
         expect(() => parseFence("mermaid", meta)).not.toThrow();
      }
      spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
   });
});

describe("languageLabel", () => {
   it.each([
      ["python", "Python"],
      ["py", "Python"],
      ["ts", "TypeScript"],
      ["javascript", "JavaScript"],
      ["JSON", "JSON"],
      ["yml", "YAML"],
      ["bash", "Bash"],
      ["sh", "Shell"],
      ["sql", "SQL"],
   ])("names the registered %s as %s", (token, label) => {
      expect(languageLabel(token)).toBe(label);
   });

   it("shows an unregistered token exactly as written", () => {
      expect(languageLabel("cobol")).toBe("cobol");
      expect(languageLabel("Rust")).toBe("Rust");
   });

   it.each(["", "text", "plaintext", "txt", "TXT"])("has no label for %j", (token) => {
      expect(languageLabel(token)).toBeNull();
   });
});

describe("names", () => {
   it("composes the code group name from language and title", () => {
      expect(codeName("Python", "ranker.py")).toBe("Python code: ranker.py");
      expect(codeName("Python")).toBe("Python code");
      expect(codeName(null, "notes.txt")).toBe("Code: notes.txt");
      expect(codeName(null)).toBe("Code");
   });

   it("names a diagram by alt, then caption, then Diagram", () => {
      expect(diagramName({ alt: "A", caption: "C" })).toBe("A");
      expect(diagramName({ caption: "C" })).toBe("C");
      expect(diagramName({})).toBe("Diagram");
   });
});
