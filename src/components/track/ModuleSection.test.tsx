import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModuleSection } from "./ModuleSection";

const scrollIntoView = vi.fn();

const view = (id: string | null = "depth", defaultOpen = false) =>
   render(
      <ModuleSection id={id} title="Part depth" defaultOpen={defaultOpen}>
         <button type="button">Inside</button>
      </ModuleSection>
   );
const button = () => screen.getByRole("button", { name: /Part depth/ });

beforeEach(() => {
   Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
   scrollIntoView.mockReset();
   window.location.hash = "";
});

describe("ModuleSection", () => {
   it("carries its fragment id on the section wrapper, below the sticky header", () => {
      const { container } = view();
      expect(container.firstElementChild).toHaveAttribute("id", "depth");
      expect(container.firstElementChild).toHaveClass("scroll-mt-28");
   });

   it("has no id when the Module has no fragment", () => {
      const { container } = view(null);
      expect(container.firstElementChild).not.toHaveAttribute("id");
   });

   it("stays collapsed, inert and unscrolled with no fragment or a fragment for another Module", () => {
      window.location.hash = "#elsewhere";
      view();
      expect(button()).toHaveAttribute("aria-expanded", "false");
      expect(document.getElementById(button().getAttribute("aria-controls")!)).toHaveAttribute("inert");
      expect(scrollIntoView).not.toHaveBeenCalled();
   });

   it("opens at once and scrolls into view when the page loads on its fragment, without moving focus", () => {
      window.location.hash = "#depth";
      view();
      expect(button()).toHaveAttribute("aria-expanded", "true");
      expect(document.getElementById(button().getAttribute("aria-controls")!)).not.toHaveAttribute("inert");
      expect(document.getElementById(button().getAttribute("aria-controls")!)).toHaveClass("transition-none");
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
      expect(document.body).toHaveFocus();
   });

   it("opens on hashchange, and a later non-matching fragment does nothing", () => {
      view();
      act(() => {
         window.location.hash = "#depth";
         fireEvent(window, new HashChangeEvent("hashchange"));
      });
      expect(button()).toHaveAttribute("aria-expanded", "true");
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      act(() => {
         window.location.hash = "#nothing";
         fireEvent(window, new HashChangeEvent("hashchange"));
      });
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
   });

   it("survives a malformed fragment", () => {
      window.location.hash = "#%E0%A4%A";
      expect(() => view()).not.toThrow();
      expect(button()).toHaveAttribute("aria-expanded", "false");
   });

   it("lets the reader toggle it afterwards, with its transition back", () => {
      window.location.hash = "#depth";
      view();
      fireEvent.click(button());
      expect(button()).toHaveAttribute("aria-expanded", "false");
      expect(document.getElementById(button().getAttribute("aria-controls")!)).not.toHaveClass("transition-none");
   });

   it("ignores a fragment for a Module that has none", () => {
      window.location.hash = "#depth";
      view(null);
      expect(button()).toHaveAttribute("aria-expanded", "false");
   });
});
