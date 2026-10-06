import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockOverflow } from "@/test/overflow";

vi.mock("@/components/mdx/Mermaid", () => ({
   Mermaid: ({ chart }: { chart: string }) => <div data-testid="mermaid">{chart}</div>,
}));

import { CatalogBody } from "./CatalogBody";
import { parseBlocks } from "./blocks";

function renderText(text: string) {
   return render(<CatalogBody body={{ format: "markdown@1", text }} />);
}

describe("CatalogBody markdown", () => {
   it("renders CommonMark and GFM", () => {
      renderText("## Title\n\nSome **bold** and ~~struck~~ text.\n\n- [x] done\n- [ ] todo");
      expect(screen.getByRole("heading", { level: 2, name: "Title" })).toBeInTheDocument();
      expect(screen.getByText("bold").tagName).toBe("STRONG");
      expect(screen.getByText("struck").tagName).toBe("DEL");
      expect(screen.getAllByRole("checkbox")).toHaveLength(2);
   });

   it("renders a GFM table", () => {
      renderText("| a | b |\n|---|---|\n| 1 | 2 |");
      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["a", "b"]);
      expect(screen.getAllByRole("cell").map((c) => c.textContent)).toEqual(["1", "2"]);
   });

   it("keeps the language of a fenced code block and leaves it as code", () => {
      const { container } = renderText("```python\nprint('x')\n```");
      const code = container.querySelector("pre > code");
      expect(code).toHaveClass("language-python");
      expect(code).toHaveTextContent("print('x')");
      expect(screen.queryByTestId("mermaid")).not.toBeInTheDocument();
   });

   it("renders inline code", () => {
      renderText("Use `kv_cache` here.");
      expect(screen.getByText("kv_cache").tagName).toBe("CODE");
   });

   it("renders nothing for a body format it does not know", () => {
      const { container } = render(
         <CatalogBody body={{ format: "blocks@1" as "markdown@1", text: "# raw" }} />
      );
      expect(container).toBeEmptyDOMElement();
   });
});

describe("CatalogBody callouts", () => {
   it.each([
      ["note", "Note"],
      ["tip", "Tip"],
      ["warning", "Warning"],
   ])("renders a %s callout with markdown inside", (kind, title) => {
      renderText(`::: callout kind=${kind}\nSynthetic **callout**.\n:::`);
      const callout = screen.getByRole("note");
      expect(callout).toHaveAttribute("data-callout", kind);
      expect(callout).toHaveTextContent(title);
      expect(callout).toHaveTextContent("Synthetic callout.");
      expect(screen.getByText("callout").tagName).toBe("STRONG");
      expect(callout).not.toHaveTextContent(":::");
   });

   it("renders prose around a callout in order", () => {
      renderText("Before.\n\n::: callout kind=tip\nInside.\n:::\n\nAfter.");
      expect(screen.getByRole("note")).toHaveTextContent("Inside.");
      expect(screen.getByText("Before.")).toBeInTheDocument();
      expect(screen.getByText("After.")).toBeInTheDocument();
   });

   it("keeps a callout example inside a code fence as code", () => {
      renderText("```text\n::: callout kind=tip\nx\n:::\n```");
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
      expect(screen.getByText(/::: callout kind=tip/)).toBeInTheDocument();
   });

   it("does not treat an unknown kind or directive as a callout", () => {
      renderText("::: callout kind=danger\nx\n:::");
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
   });
});

describe("parseBlocks", () => {
   it("nests callouts and closes an unterminated one", () => {
      expect(parseBlocks("::: callout kind=note\nouter\n::: callout kind=tip\ninner\n:::\n:::")).toEqual([
         {
            type: "callout",
            kind: "note",
            children: [
               { type: "markdown", text: "outer" },
               { type: "callout", kind: "tip", children: [{ type: "markdown", text: "inner" }] },
            ],
         },
      ]);
      expect(parseBlocks('::: callout kind="warning"\nopen')).toEqual([
         { type: "callout", kind: "warning", children: [{ type: "markdown", text: "open" }] },
      ]);
   });
});

describe("CatalogBody mermaid", () => {
   it("hands a mermaid fence to the diagram component", () => {
      renderText("```mermaid\ngraph TD; A-->B;\n```");
      expect(screen.getByTestId("mermaid")).toHaveTextContent("graph TD; A-->B;");
      expect(document.querySelector("pre")).toBeNull();
   });

   it("renders a diagram inside a callout", () => {
      renderText("::: callout kind=note\n```mermaid\ngraph LR; X-->Y;\n```\n:::");
      expect(screen.getByRole("note")).toContainElement(screen.getByTestId("mermaid"));
   });
});

describe("CatalogBody links", () => {
   it("resolves a ref link to the type-based route without a new tab", () => {
      renderText("[a knowledge item](ref:knowledge.rag) and [a lesson](ref:lesson.dynamic-batching)");
      const knowledge = screen.getByRole("link", { name: "a knowledge item" });
      expect(knowledge).toHaveAttribute("href", "/knowledge/rag");
      expect(knowledge).not.toHaveAttribute("target");
      expect(screen.getByRole("link", { name: "a lesson" })).toHaveAttribute("href", "/lessons/dynamic-batching");
   });

   it("does not link a malformed ref", () => {
      renderText("[bad](ref:knowledge.Bad/../x) and [worse](ref:evil)");
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("bad")).toBeInTheDocument();
   });

   it("keeps anchors and opens https links safely", () => {
      renderText("[here](#heading) and [out](https://example.com/x)");
      expect(screen.getByRole("link", { name: "here" })).toHaveAttribute("href", "#heading");
      const external = screen.getByRole("link", { name: "out" });
      expect(external).toHaveAttribute("href", "https://example.com/x");
      expect(external).toHaveAttribute("rel", "noopener noreferrer");
   });

   it.each([
      "javascript:alert(1)",
      "data:text/html,<b>x</b>",
      "http://example.com",
      "//example.com",
      "/learn/elsewhere",
      "mailto:a@b.co",
   ])("drops the link target %s", (target) => {
      renderText(`[x](${target})`);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("x")).toBeInTheDocument();
   });
});

describe("CatalogBody raw HTML and images", () => {
   it("never emits raw HTML", () => {
      const { container } = renderText('<script>window.x=1</script>\n\n<img src=x onerror="alert(1)">\n\ntext');
      expect(container.querySelector("script, img, [onerror]")).toBeNull();
      expect(container).toHaveTextContent("text");
   });

   it("renders no image for image syntax", () => {
      const { container } = renderText("![alt](https://example.com/a.png)");
      expect(container.querySelector("img")).toBeNull();
   });
});

describe("CatalogBody technical content", () => {
   afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
   });

   it("holds a code block in a scroll container instead of letting it widen the page", () => {
      const { container } = renderText("```python\nprint('x')\n```");
      expect(container.querySelector('[data-slot="technical-scroll"] > pre > code')).toHaveTextContent("print('x')");
   });

   it("holds a table in a scroll container", () => {
      const { container } = renderText("| a | b |\n|---|---|\n| 1 | 2 |");
      expect(container.querySelector('[data-slot="technical-scroll"] > table')).toBeInTheDocument();
   });

   it("makes an overflowing code block and table keyboard-reachable named regions", () => {
      const measure = mockOverflow({ scrollWidth: 900, clientWidth: 300 });
      renderText("```text\nvery long line\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |");
      measure();

      expect(screen.getByRole("region", { name: "Code" })).toHaveAttribute("tabindex", "0");
      expect(screen.getByRole("region", { name: "Table" })).toHaveAttribute("tabindex", "0");
   });

   it("adds no tab stop for code and tables that fit", () => {
      const measure = mockOverflow({ scrollWidth: 300, clientWidth: 300 });
      renderText("```text\nshort\n```\n\n| a |\n|---|\n| 1 |");
      measure();

      expect(screen.queryByRole("region")).not.toBeInTheDocument();
   });

   it("styles inline code as a chip but leaves an unlabelled fenced block unchipped", () => {
      renderText("Use `kv_cache` here.\n\n```\nplain fence\n```");
      expect(screen.getByText("kv_cache")).toHaveClass("bg-code-surface");
      const fenced = screen.getByText("plain fence");
      expect(fenced.closest("pre")).toHaveClass("[&_code]:bg-transparent", "[&_code]:p-0");
   });
});
