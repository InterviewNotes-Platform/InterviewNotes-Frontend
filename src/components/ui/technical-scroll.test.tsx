import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockOverflow } from "@/test/overflow";
import { TechnicalScroll } from "./technical-scroll";

afterEach(() => {
   vi.unstubAllGlobals();
   vi.restoreAllMocks();
});

const show = () =>
   render(
      <TechnicalScroll label="Code" className="my-6">
         <pre>wide code</pre>
      </TechnicalScroll>
   );

describe("TechnicalScroll", () => {
   it("scrolls horizontally in its own box and adds no tab stop while content fits", () => {
      const measure = mockOverflow({ scrollWidth: 300, clientWidth: 300 });
      const { container } = show();
      measure();

      const box = container.querySelector('[data-slot="technical-scroll"]');
      expect(box).toHaveClass("overflow-x-auto", "my-6");
      expect(box).not.toHaveAttribute("tabindex");
      expect(screen.queryByRole("region")).not.toBeInTheDocument();
   });

   it("becomes a named, keyboard-focusable region once content overflows", () => {
      const measure = mockOverflow({ scrollWidth: 900, clientWidth: 300 });
      show();
      measure();

      const region = screen.getByRole("region", { name: "Code" });
      expect(region).toHaveAttribute("tabindex", "0");
      expect(region).toContainElement(screen.getByText("wide code"));
      region.focus();
      expect(region).toHaveFocus();
   });

   it("follows the box as it is resized: a region only while it overflows", () => {
      const measure = mockOverflow({ scrollWidth: 900, clientWidth: 300 });
      show();
      measure();
      expect(screen.getByRole("region", { name: "Code" })).toBeInTheDocument();

      measure({ clientWidth: 900 });
      expect(screen.queryByRole("region")).not.toBeInTheDocument();

      measure({ clientWidth: 360 });
      expect(screen.getByRole("region", { name: "Code" })).toHaveAttribute("tabindex", "0");
   });

   it("lets the caller's props through and disconnects its observer on unmount", () => {
      const disconnect = vi.fn();
      vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect = disconnect });
      const { unmount } = render(<TechnicalScroll label="Table" data-testid="box">x</TechnicalScroll>);
      expect(screen.getByTestId("box")).toBeInTheDocument();
      unmount();
      expect(disconnect).toHaveBeenCalled();
   });
});

describe("TechnicalScroll state attribute", () => {
   it("says whether the content scrolls, so a caller can style the overflowing state alone", () => {
      const measure = mockOverflow({ scrollWidth: 300, clientWidth: 300 });
      const { container } = show();
      measure();
      const box = container.querySelector('[data-slot="technical-scroll"]');
      expect(box).toHaveAttribute("data-scrolls", "false");

      measure({ scrollWidth: 900 });
      expect(box).toHaveAttribute("data-scrolls", "true");
   });
});

describe("TechnicalScroll onScrollsChange", () => {
   it("tells the caller when the content starts and stops overflowing", () => {
      const measure = mockOverflow({ scrollWidth: 300, clientWidth: 300 });
      const seen = vi.fn();
      render(<TechnicalScroll label="Code" onScrollsChange={seen}>wide</TechnicalScroll>);
      measure();
      expect(seen).toHaveBeenLastCalledWith(false);

      measure({ scrollWidth: 900 });
      expect(seen).toHaveBeenLastCalledWith(true);
      measure({ scrollWidth: 300 });
      expect(seen).toHaveBeenLastCalledWith(false);
   });
});
