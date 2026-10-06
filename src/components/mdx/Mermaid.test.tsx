import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockOverflow } from "@/test/overflow";

const svgOf = (width: number) => `<svg viewBox="0 0 ${width} 120" width="100%" style="max-width: ${width}px;"><g/></svg>`;
const render_ = vi.fn();
vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: (...args: unknown[]) => render_(...args) } }));

import { Mermaid } from "./Mermaid";

beforeEach(() => render_.mockImplementation(async () => ({ svg: svgOf(1400) })));
afterEach(() => {
   vi.unstubAllGlobals();
   vi.restoreAllMocks();
   render_.mockReset();
});

const drawn = async (container: HTMLElement) => {
   await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
   return container.querySelector("svg")!;
};

describe("Mermaid, default", () => {
   it("keeps the shared box that scales a diagram to fit, exactly as before", async () => {
      const { container } = render(<Mermaid chart="graph LR" />);
      const svg = await drawn(container);
      expect(screen.getByRole("img", { name: "Architecture diagram" })).toHaveClass("overflow-x-auto", "border", "[&_svg]:max-w-full");
      expect(svg.style.width).toBe("");
      expect(container.querySelector("figure")).toBeNull();
   });
});

describe("Mermaid, scratch box", () => {
   it("draws in a body-level box the reduced-motion rule exempts, and removes it afterwards", async () => {
      let seen: Element | undefined;
      render_.mockImplementation(async (_id: string, _chart: string, scratch: Element) => {
         seen = scratch;
         expect(scratch).toHaveAttribute("data-diagram-scratch");
         expect(scratch.parentElement).toBe(document.body);
         return { svg: svgOf(300) };
      });
      const { container } = render(<Mermaid chart="graph LR" />);
      await drawn(container);
      expect(seen).toBeDefined();
      expect(seen!.isConnected).toBe(false);
      expect(document.querySelector("[data-diagram-scratch]")).toBeNull();
   });

   it("removes the box when the diagram fails to draw", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      render_.mockRejectedValue(new Error("Parse error"));
      render(<Mermaid chart="bad" />);
      await screen.findByText("Diagram failed to render");
      expect(document.querySelector("[data-diagram-scratch]")).toBeNull();
   });
});

describe("Mermaid, adaptive", () => {
   it("draws at the natural size Mermaid reports, so text is never scaled down to fit", async () => {
      const measure = mockOverflow({ scrollWidth: 1400, clientWidth: 736 });
      const { container } = render(<Mermaid chart="graph LR" adaptive />);
      const svg = await drawn(container);
      measure();
      expect(svg.style.width).toBe("1400px");
      expect(svg.style.maxWidth).toBe("none");
   });

   it("frames a diagram that overflows its column, as a labelled, keyboard-reachable scroll region", async () => {
      const measure = mockOverflow({ scrollWidth: 1400, clientWidth: 736 });
      const { container } = render(<Mermaid chart="graph LR" adaptive />);
      await drawn(container);
      measure();

      const region = screen.getByRole("region", { name: "Scrollable diagram" });
      expect(region).toHaveAttribute("tabindex", "0");
      expect(region).toHaveAttribute("data-scrolls", "true");
      expect(region.className).toContain("data-[scrolls=true]:border");
      expect(region.closest("figure")).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "Diagram" })).toBeInTheDocument();
   });

   it("leaves a diagram that fits plain: no region, no tab stop, and the frame styles stay switched off", async () => {
      render_.mockImplementation(async () => ({ svg: svgOf(420) }));
      const measure = mockOverflow({ scrollWidth: 420, clientWidth: 736 });
      const { container } = render(<Mermaid chart="graph LR" adaptive />);
      const svg = await drawn(container);
      measure();

      expect(svg.style.width).toBe("420px");
      expect(screen.queryByRole("region")).not.toBeInTheDocument();
      expect(container.querySelector("[data-slot='technical-scroll']")).toHaveAttribute("data-scrolls", "false");
      expect(container.querySelector("[tabindex]")).toBeNull();
   });

   it("follows its column as it resizes: framed only while the diagram does not fit", async () => {
      const measure = mockOverflow({ scrollWidth: 900, clientWidth: 1000 });
      const { container } = render(<Mermaid chart="graph LR" adaptive />);
      await drawn(container);
      measure();
      expect(screen.queryByRole("region")).not.toBeInTheDocument();

      measure({ clientWidth: 360 });
      expect(screen.getByRole("region", { name: "Scrollable diagram" })).toBeInTheDocument();
      measure({ clientWidth: 1000 });
      expect(screen.queryByRole("region")).not.toBeInTheDocument();
   });

   it("uses no motion of its own", async () => {
      const { container } = render(<Mermaid chart="graph LR" adaptive />);
      await drawn(container);
      expect(container.innerHTML).not.toMatch(/transition|animate|duration/);
   });

   it("still reports a diagram it cannot draw without blanking the page", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      render_.mockRejectedValue(new Error("Parse error"));
      render(<Mermaid chart="not a diagram" adaptive />);
      expect(await screen.findByText("Diagram failed to render")).toBeInTheDocument();
   });
});
