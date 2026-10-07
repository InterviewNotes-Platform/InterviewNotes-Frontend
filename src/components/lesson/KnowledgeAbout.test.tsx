import type { ComponentProps } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Expose Link's `prefetch`: a panel's link must never make the server read its target.
vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return {
      default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) =>
         createElement("a", { "data-prefetch": String(prefetch), ...props }),
   };
});

import { KnowledgeAbout } from "./KnowledgeAbout";

const RAG = { title: "Retrieval-augmented generation", summary: "Ground a model's answer in retrieved documents.", href: "/knowledge/rag" };
const CACHE = { title: "KV cache", summary: "Stores keys and values so a token never recomputes its history.", href: "/knowledge/kv-cache" };
const toggle = (name: string) => screen.getByRole("button", { name: `About ${name}` });

afterEach(() => vi.restoreAllMocks());

describe("the toggle (S-KNW-3)", () => {
   it("is a real button named for the Knowledge, collapsed, with a visible glyph and no hover dependency", () => {
      render(<KnowledgeAbout {...RAG} />);
      const button = toggle(RAG.title);
      expect(button.tagName).toBe("BUTTON");
      expect(button).toHaveAttribute("type", "button");
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(button).not.toHaveAttribute("aria-controls");
      expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(button.className).not.toMatch(/opacity-0|invisible|hidden|group-hover/);
   });

   it("reaches a 44px hit area from a small glyph without taking space of its own", () => {
      render(<KnowledgeAbout {...RAG} />);
      const button = toggle(RAG.title);
      expect(button).toHaveClass("size-[1.1em]", "after:size-11");
      expect(button.className).toMatch(/after:absolute/);
   });

   it("keeps the summary out of the page until opened", () => {
      render(<KnowledgeAbout {...RAG} />);
      expect(document.body).not.toHaveTextContent(RAG.summary);
      expect(screen.queryByRole("group")).not.toBeInTheDocument();
   });

   it("opens on activation, reflects it in aria-expanded, and closes when activated again", () => {
      render(<KnowledgeAbout {...RAG} />);
      fireEvent.click(toggle(RAG.title));
      expect(toggle(RAG.title)).toHaveAttribute("aria-expanded", "true");
      expect(toggle(RAG.title)).toHaveAttribute("aria-controls", screen.getByRole("group").id);
      fireEvent.click(toggle(RAG.title));
      expect(toggle(RAG.title)).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("group")).not.toBeInTheDocument();
   });

   it("is operated by the keyboard like any button (Enter and Space dispatch a click)", () => {
      render(<KnowledgeAbout {...RAG} />);
      const button = toggle(RAG.title);
      button.focus();
      expect(button).toHaveFocus();
      fireEvent.click(button); // a native button turns Enter and Space into this click
      expect(button).toHaveAttribute("aria-expanded", "true");
   });
});

describe("the panel (S-KNW-4)", () => {
   it("holds the title, the plain-text summary and an Open link, and nothing else", () => {
      render(<KnowledgeAbout {...RAG} />);
      fireEvent.click(toggle(RAG.title));
      const panel = screen.getByRole("group", { name: `About ${RAG.title}` });
      expect(panel).toHaveTextContent(RAG.title);
      expect(panel).toHaveTextContent(RAG.summary);
      const link = screen.getByRole("link", { name: `Open ${RAG.title}` });
      expect(link).toHaveAttribute("href", "/knowledge/rag");
      expect(link).toHaveAttribute("data-prefetch", "false");
      expect(panel.querySelectorAll("a")).toHaveLength(1);
   });

   it("renders summary markup as text", () => {
      render(<KnowledgeAbout {...RAG} summary="<b>bold</b> [x](ref:lesson.y)" />);
      fireEvent.click(toggle(RAG.title));
      expect(screen.getByRole("group")).toHaveTextContent("<b>bold</b> [x](ref:lesson.y)");
      expect(screen.getByRole("group").querySelector("b")).toBeNull();
   });

   it("is not a dialog: no modal semantics, and opening moves no focus", () => {
      render(<KnowledgeAbout {...RAG} />);
      fireEvent.click(toggle(RAG.title));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(document.querySelector("[aria-modal], dialog")).toBeNull();
      expect(screen.getByRole("group")).not.toHaveAttribute("tabindex");
      expect(screen.getByRole("group").contains(document.activeElement)).toBe(false);
   });

   it("leaves a toggle that was focused focused, and a focus elsewhere where it was", () => {
      render(
         <>
            <button>elsewhere</button>
            <KnowledgeAbout {...RAG} />
         </>
      );
      screen.getByRole("button", { name: "elsewhere" }).focus();
      fireEvent.click(toggle(RAG.title));
      expect(screen.getByRole("button", { name: "elsewhere" })).toHaveFocus();
   });

   it("is only phrasing content, so it can sit inside a paragraph", () => {
      const { container } = render(
         <p>
            Text <KnowledgeAbout {...RAG} />
         </p>
      );
      fireEvent.click(toggle(RAG.title));
      expect(container.querySelector("p div, p p, p ul")).toBeNull();
   });

   it("fits the reading column: its width is capped by the column and its left edge stays inside it", () => {
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
         const rect = (left: number, width: number) => ({ left, right: left + width, width, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON: () => ({}) });
         if (this.hasAttribute("data-catalog-body")) return rect(16, 358);
         if (this.tagName === "SPAN" && this.className.includes("relative")) return rect(300, 20); // the toggle sits near the right edge
         return rect(0, 0);
      });
      Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 390 });
      render(
         <div data-catalog-body="">
            <KnowledgeAbout {...RAG} />
         </div>
      );
      fireEvent.click(toggle(RAG.title));
      const panel = screen.getByRole("group");
      // column 16..374, panel 352 wide: it must start at 22 (374-352), i.e. 278px left of the toggle at 300
      expect(panel.style.width).toBe("352px");
      expect(panel.style.left).toBe("-278px");
   });
});

describe("closing", () => {
   it("closes on Escape from the toggle, with focus staying on it", () => {
      render(<KnowledgeAbout {...RAG} />);
      toggle(RAG.title).focus();
      fireEvent.click(toggle(RAG.title));
      fireEvent.keyDown(toggle(RAG.title), { key: "Escape" });
      expect(screen.queryByRole("group")).not.toBeInTheDocument();
      expect(toggle(RAG.title)).toHaveFocus();
      expect(toggle(RAG.title)).toHaveAttribute("aria-expanded", "false");
   });

   it("closes on Escape from inside the panel and returns focus to its own toggle", () => {
      render(<KnowledgeAbout {...RAG} />);
      fireEvent.click(toggle(RAG.title));
      const link = screen.getByRole("link", { name: `Open ${RAG.title}` });
      link.focus();
      expect(link).toHaveFocus();
      fireEvent.keyDown(link, { key: "Escape" });
      expect(screen.queryByRole("group")).not.toBeInTheDocument();
      expect(toggle(RAG.title)).toHaveFocus();
   });

   it("closes on Escape even when no focus is inside, without stealing focus from elsewhere", () => {
      render(
         <>
            <button>elsewhere</button>
            <KnowledgeAbout {...RAG} />
         </>
      );
      fireEvent.click(toggle(RAG.title));
      screen.getByRole("button", { name: "elsewhere" }).focus();
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(screen.queryByRole("group")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "elsewhere" })).toHaveFocus();
   });

   it("ignores other keys", () => {
      render(<KnowledgeAbout {...RAG} />);
      fireEvent.click(toggle(RAG.title));
      fireEvent.keyDown(toggle(RAG.title), { key: "Enter" });
      fireEvent.keyDown(toggle(RAG.title), { key: "Tab" });
      expect(screen.getByRole("group")).toBeInTheDocument();
   });

   it("closes on activation outside, not on pointer movement, and stays open for activation inside", () => {
      render(
         <>
            <p data-testid="outside">Elsewhere</p>
            <KnowledgeAbout {...RAG} />
         </>
      );
      fireEvent.click(toggle(RAG.title));
      fireEvent.pointerMove(screen.getByTestId("outside"));
      fireEvent.mouseOver(screen.getByTestId("outside"));
      fireEvent.pointerDown(screen.getByTestId("outside"));
      expect(screen.getByRole("group")).toBeInTheDocument();
      fireEvent.click(screen.getByText(RAG.summary));
      expect(screen.getByRole("group")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("outside"));
      expect(screen.queryByRole("group")).not.toBeInTheDocument();
   });
});

describe("one panel per page", () => {
   it("closes the open panel when another opens, so panels never overlap", () => {
      render(
         <>
            <KnowledgeAbout {...RAG} />
            <KnowledgeAbout {...CACHE} />
         </>
      );
      fireEvent.click(toggle(RAG.title));
      expect(screen.getAllByRole("group")).toHaveLength(1);
      fireEvent.click(toggle(CACHE.title));
      expect(screen.getAllByRole("group")).toHaveLength(1);
      expect(screen.getByRole("group")).toHaveTextContent(CACHE.summary);
      expect(toggle(RAG.title)).toHaveAttribute("aria-expanded", "false");
      expect(toggle(CACHE.title)).toHaveAttribute("aria-expanded", "true");
   });
});

describe("no requests, no stored state (S-REQ-2, S-INV-8)", () => {
   it("opens and closes without a fetch or a write to storage", () => {
      const fetcher = vi.spyOn(globalThis, "fetch");
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      render(<KnowledgeAbout {...RAG} />);
      act(() => toggle(RAG.title).click());
      act(() => toggle(RAG.title).click());
      expect(fetcher).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
      expect(document.cookie).toBe("");
   });
});
