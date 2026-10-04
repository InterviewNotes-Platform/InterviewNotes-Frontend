import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Disclosure } from "./disclosure";

const panel = (button: HTMLElement) => document.getElementById(button.getAttribute("aria-controls")!)!;

function renderTwo() {
   render(
      <>
         <Disclosure title="First" detail="2 items" defaultOpen>
            <a href="/one">One</a>
         </Disclosure>
         <Disclosure title="Second" detail="1 item">
            <a href="/two">Two</a>
         </Disclosure>
      </>
   );
   return { first: screen.getByRole("button", { name: /First/ }), second: screen.getByRole("button", { name: /Second/ }) };
}

describe("Disclosure", () => {
   it("is a native button inside a heading, so Enter and Space activate it", () => {
      const { first } = renderTwo();
      expect(first.tagName).toBe("BUTTON");
      expect(first).toHaveAttribute("type", "button");
      expect(first.closest("h2")).toBeInTheDocument();
      expect(first).not.toHaveAttribute("tabindex");
   });

   it("opens only where asked, and says so with aria-expanded", () => {
      const { first, second } = renderTwo();
      expect(first).toHaveAttribute("aria-expanded", "true");
      expect(second).toHaveAttribute("aria-expanded", "false");
   });

   it("names its panel with aria-controls, and the panel exists while collapsed too", () => {
      const { first, second } = renderTwo();
      expect(panel(first)).toBeInTheDocument();
      expect(panel(second)).toBeInTheDocument();
      expect(panel(first)).not.toBe(panel(second));
      expect(panel(second)).toContainElement(screen.getByText("Two"));
   });

   it("keeps a collapsed panel inert, so nothing in it can take focus", () => {
      const { first, second } = renderTwo();
      expect(panel(first)).not.toHaveAttribute("inert");
      expect(panel(second)).toHaveAttribute("inert");
   });

   it("toggles open and closed together with aria-expanded and inert", () => {
      const { second } = renderTwo();
      fireEvent.click(second);
      expect(second).toHaveAttribute("aria-expanded", "true");
      expect(panel(second)).not.toHaveAttribute("inert");
      fireEvent.click(second);
      expect(second).toHaveAttribute("aria-expanded", "false");
      expect(panel(second)).toHaveAttribute("inert");
   });

   it("works independently of its siblings", () => {
      const { first, second } = renderTwo();
      fireEvent.click(second);
      expect(first).toHaveAttribute("aria-expanded", "true");
      expect(second).toHaveAttribute("aria-expanded", "true");
   });

   it("includes the detail in the control's accessible name", () => {
      renderTwo();
      expect(screen.getByRole("button", { name: "First 2 items" })).toBeInTheDocument();
   });

   it("hides its chevron from assistive technology", () => {
      const { first } = renderTwo();
      expect(first.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
   });

   it("fits the page outline when given another heading level", () => {
      render(
         <Disclosure title="Nested" level="h3">
            body
         </Disclosure>
      );
      expect(screen.getByRole("heading", { level: 3, name: "Nested" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
   });

   it("keeps a 44px touch target and a visible, inset focus indicator", () => {
      const { first } = renderTwo();
      expect(first.className).toContain("min-h-11");
      expect(first.className).toContain("-outline-offset-2");
   });
});
