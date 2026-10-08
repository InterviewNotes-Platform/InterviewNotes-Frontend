import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockOverflow } from "@/test/overflow";

vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: "<svg/>" })) } }));

import { CatalogBody } from "./CatalogBody";

const body = (text: string) => ({ format: "markdown@1" as const, text });
const show = (text: string, reading = false) =>
   render(<CatalogBody body={body(text)} reading={reading ? { headings: [] } : undefined} />);
const fence = (info: string, content: string) => "```" + info + "\n" + content + "\n```";

const writeText = vi.fn();
beforeEach(() => {
   writeText.mockReset().mockResolvedValue(undefined);
   Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(() => {
   vi.unstubAllGlobals();
   vi.restoreAllMocks();
});

describe("code block header", () => {
   it("shows the language, then the title, then Copy, in a group named for both", () => {
      show(fence('python title="ranker.py"', "print(1)"));
      const group = screen.getByRole("group", { name: "Python code: ranker.py" });
      const header = within(group).getByText("Python").parentElement!;
      expect([...header.children].map((child) => child.textContent)).toEqual(["Python", "ranker.py", "Copy", ""]);
      expect(within(group).getByRole("button", { name: "Copy Python code" })).toBeInTheDocument();
   });

   it.each([
      ["python", "Python code"],
      ["cobol", "cobol code"],
      ["", "Code"],
      ["text", "Code"],
      ["plaintext", "Code"],
      ["txt", "Code"],
   ])("names a ```%s block %j", (info, name) => {
      show(fence(info, "x"));
      expect(screen.getByRole("group", { name })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: info && name !== "Code" ? `Copy ${name.replace(/ code$/, "")} code` : "Copy code" })).toBeInTheDocument();
   });

   it("shows no language label for a missing, text, plaintext or txt language", () => {
      for (const info of ["", "text", "plaintext", "txt"]) {
         const { container, unmount } = show(fence(info, "x"));
         expect(container.querySelector("[role=group] > div > span:not([role=status])")).toBeNull();
         unmount();
      }
   });

   it("shows a title without a language as the name 'Code: title'", () => {
      show(fence('text title="notes.txt"', "x"));
      expect(screen.getByRole("group", { name: "Code: notes.txt" })).toBeInTheDocument();
   });

   it("lets a long title truncate while the language and Copy keep their size", () => {
      show(fence('python title="a/very/long/path/to/some/module/file_name.py"', "x"));
      const title = screen.getByText("a/very/long/path/to/some/module/file_name.py");
      expect(title).toHaveClass("min-w-0", "truncate");
      expect(screen.getByText("Python")).toHaveClass("shrink-0");
      expect(screen.getByRole("button")).toHaveClass("shrink-0");
   });

   it("renders a title as text, never as markup", () => {
      const { container } = show(fence('python title="<b>x</b> **y**"', "x"));
      expect(screen.getByText("<b>x</b> **y**")).toBeInTheDocument();
      expect(container.querySelector("b, strong")).toBeNull();
   });

   it("gives the scroll region the same name as the group when the code overflows", () => {
      const measure = mockOverflow({ scrollWidth: 900, clientWidth: 300 });
      show(fence('python title="ranker.py"', "x" + " y".repeat(100)));
      measure();
      expect(screen.getByRole("region", { name: "Python code: ranker.py" })).toHaveAttribute("tabindex", "0");
   });

   it("adds exactly one tab stop for a block that fits", () => {
      const measure = mockOverflow({ scrollWidth: 300, clientWidth: 300 });
      const { container } = show(fence('python title="ranker.py"', "x"));
      measure();
      expect(container.querySelectorAll("button, [tabindex]")).toHaveLength(1);
   });

   it("renders malformed metadata with its language only, and logs nothing", () => {
      const error = vi.spyOn(console, "error");
      const warn = vi.spyOn(console, "warn");
      show(fence("python title=\"unterminated caption='broken", "marker"));
      expect(screen.getByRole("group", { name: "Python code" })).toHaveTextContent("marker");
      expect(error).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
   });
});

describe("Copy in a catalog body", () => {
   const press = () => act(async () => fireEvent.click(screen.getByRole("button", { name: /^Copy/ })));

   it.each([
      ["a plain fence", "a\nb", "a\nb"],
      ["blank and indented lines", "a\n\n  b\n", "a\n\n  b\n"],
      ["a single line", "only", "only"],
      ["an empty fence", "", ""],
   ])("copies the fence content of %s with no added trailing newline", async (_, content, expected) => {
      show("```python\n" + content + (content === "" ? "" : "\n") + "```");
      await press();
      expect(writeText).toHaveBeenCalledExactlyOnceWith(expected);
   });

   it("copies the source from the Markdown, not text read back from the rendered code", async () => {
      show(fence("python", "x = '<b>' & \"q\""));
      screen.getByRole("group").querySelector("code")!.textContent = "tampered";
      await press();
      expect(writeText).toHaveBeenCalledWith("x = '<b>' & \"q\"");
   });

   it("makes no request of any kind", async () => {
      const request = vi.fn();
      vi.stubGlobal("fetch", request);
      show(fence("python", "x"));
      await press();
      expect(request).not.toHaveBeenCalled();
   });
});

describe("diagram figures from a catalog body", () => {
   const html = (text: string, reading = false) => {
      const host = document.createElement("div");
      host.innerHTML = renderToString(<CatalogBody body={body(text)} reading={reading ? { headings: [] } : undefined} />);
      return host;
   };
   const MERMAID = "graph LR\n  A --> B";

   it.each([false, true])("puts the figure, caption and named container in the server HTML (reading: %s)", (reading) => {
      const host = html(fence('mermaid caption="Shared pool" alt="Three requests share one pool."', MERMAID), reading);
      const figure = host.querySelector("figure")!;
      expect(figure.querySelector("figcaption")).toHaveTextContent("Shared pool");
      expect(figure.querySelector("[role=img]")).toHaveAttribute("aria-label", "Three requests share one pool.");
   });

   it("names by caption without an alt, and Diagram with neither", () => {
      expect(html(fence('mermaid caption="Shared pool"', MERMAID)).querySelector("[role=img]")).toHaveAttribute("aria-label", "Shared pool");
      const plain = html(fence("mermaid", MERMAID));
      expect(plain.querySelector("[role=img]")).toHaveAttribute("aria-label", "Diagram");
      expect(plain.querySelector("figcaption")).toBeNull();
   });

   it("ignores a title on a diagram and a caption on code", () => {
      const host = html([fence('mermaid title="t"', MERMAID), fence('python caption="c" alt="a"', "x")].join("\n\n"));
      expect(host.querySelector("figcaption")).toBeNull();
      expect(host.querySelector("[role=img]")).toHaveAttribute("aria-label", "Diagram");
      expect(host.querySelector("[role=group]")).toHaveAttribute("aria-label", "Python code");
   });

   it("keeps the language when a diagram's metadata is malformed", () => {
      const host = html(fence('mermaid caption="unterminated', MERMAID));
      expect(host.querySelector("[role=img]")).toHaveAttribute("aria-label", "Diagram");
      expect(host.querySelector("figcaption")).toBeNull();
   });

   it("uses neither legacy diagram name", () => {
      const host = html(fence('mermaid caption="C"', MERMAID), true);
      expect(host.innerHTML).not.toMatch(/Architecture diagram|Scrollable diagram/);
   });
});
