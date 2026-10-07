import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockOverflow } from "@/test/overflow";

/** A drawing whose generated ids derive from the render id, as Mermaid's do (svg id, markers, scoped style). */
const svgFor = (id: string) =>
   `<svg id="${id}" viewBox="0 0 1400 120"><style>#${id}{fill:red}</style><marker id="${id}_arrow"/><g/></svg>`;
const render_ = vi.fn();
const initialize = vi.fn();
vi.mock("mermaid", () => ({ default: { initialize: (...args: unknown[]) => initialize(...args), render: (...args: unknown[]) => render_(...args) } }));

import { DiagramExpand } from "./DiagramExpand";
import { Mermaid } from "./Mermaid";

const WIDE = { scrollWidth: 1400, clientWidth: 736 };
const FITS = { scrollWidth: 700, clientWidth: 736 };
const figure = { caption: "Requests share KV blocks", alt: "Three requests point into a shared pool." };

// Like Mermaid, draw nothing (an svg without a viewBox) into an id the document already holds.
beforeEach(() => render_.mockImplementation(async (id: string) => ({ svg: document.getElementById(id) ? `<svg id="${id}"></svg>` : svgFor(id) })));
afterEach(async () => {
   cleanup();
   await new Promise((resolve) => setTimeout(resolve, 50)); // let a draw still in flight finish before the mocks reset
   document.documentElement.classList.remove("dark");
   vi.unstubAllGlobals();
   vi.restoreAllMocks();
   render_.mockReset();
   initialize.mockReset();
});

/** The render ids drawn so far, in order. */
const drawn = () => render_.mock.calls.map(([id]) => id as string).filter((id) => typeof id === "string");

/** A Lesson (reading mode) diagram whose frame has been measured. */
async function shown(widths = WIDE, given: { caption?: string; alt?: string } = figure) {
   const measure = mockOverflow(widths);
   const { container } = render(<Mermaid chart="graph LR" adaptive figure={given} />);
   await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
   measure();
   return { container, measure };
}

const expand = () => screen.getByRole("button", { name: "Expand diagram" });
const open = async () => {
   fireEvent.click(expand());
   return screen.findByRole("dialog");
};

describe("Expand control (S-DGM-6)", () => {
   it("is offered, as a button in the figure, when the diagram does not fit its column", async () => {
      const { container } = await shown(WIDE);
      expect(expand().closest("figure")).toBe(container.querySelector("figure"));
   });

   it("is absent, and adds no tab stop, when the diagram fits", async () => {
      const { container } = await shown(FITS);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(container.querySelectorAll("button, [tabindex]")).toHaveLength(0);
   });

   it("follows the fit when the column is resized", async () => {
      const { measure } = await shown(WIDE);
      expect(expand()).toBeInTheDocument();
      measure(FITS);
      expect(screen.queryByRole("button", { name: "Expand diagram" })).not.toBeInTheDocument();
      measure(WIDE);
      expect(expand()).toBeInTheDocument();
   });

   it("is described by the caption when there is one", async () => {
      await shown();
      expect(expand()).toHaveAccessibleDescription(figure.caption);
   });

   it("has no description without a caption", async () => {
      await shown(WIDE, {});
      expect(expand()).toHaveAccessibleDescription("");
   });

   it("is not offered outside reading mode", async () => {
      const measure = mockOverflow(WIDE);
      const { container } = render(<Mermaid chart="graph LR" figure={figure} />);
      await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
      measure();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
   });
});

describe("Expanded view (S-DGM-7)", () => {
   it("is a modal dialog labelled by the caption", async () => {
      await shown();
      const dialog = await open();
      expect(dialog).toHaveAccessibleName(figure.caption);
      expect(screen.getByRole("heading", { name: figure.caption })).toBeInTheDocument();
   });

   it("is labelled Diagram without a caption", async () => {
      await shown(WIDE, {});
      expect(await open()).toHaveAccessibleName("Diagram");
   });

   it("shows the diagram at natural size in a focusable, named scroll region", async () => {
      await shown();
      const dialog = await open();
      const region = within(dialog).getByRole("region", { name: figure.alt });
      expect(region).toHaveAttribute("tabindex", "0");
      await waitFor(() => expect(region.querySelector("svg")).not.toBeNull());
      const svg = region.querySelector("svg")!;
      expect(svg.style.width).toBe("1400px");
      expect(svg.style.maxWidth).toBe("none");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(region).toHaveClass("overflow-auto");
   });

   it("sets no touch-action restriction on the dialog or its diagram", async () => {
      await shown();
      const dialog = await open();
      await waitFor(() => expect(dialog.querySelector("svg")).not.toBeNull());
      for (const element of [dialog, ...dialog.querySelectorAll<HTMLElement>("*")]) {
         expect(element.style.touchAction).toBe("");
         expect(element.getAttribute("class") ?? "").not.toMatch(/touch-(none|pan|manipulation|pinch)/);
      }
   });

   it("draws nothing extra, and makes no request, until it is opened", async () => {
      const fetched = vi.fn();
      vi.stubGlobal("fetch", fetched);
      await shown();
      expect(drawn()).toHaveLength(1);
      await open();
      await waitFor(() => expect(drawn()).toHaveLength(2));
      expect(fetched).not.toHaveBeenCalled();
   });
});

describe("Focus", () => {
   it("moves into the dialog, onto the scroll region", async () => {
      await shown();
      const dialog = await open();
      await waitFor(() => expect(within(dialog).getByRole("region", { name: figure.alt })).toHaveFocus());
   });

   it("reaches Close with Tab and stays inside the dialog", async () => {
      await shown();
      const dialog = await open();
      const region = within(dialog).getByRole("region", { name: figure.alt });
      const close = within(dialog).getByRole("button", { name: "Close" });
      await waitFor(() => expect(region).toHaveFocus());

      // Close is the first stop and the region the last: Tab from the region reaches Close, and both ends wrap.
      fireEvent.keyDown(region, { key: "Tab" });
      expect(close).toHaveFocus();
      fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
      expect(region).toHaveFocus();
   });

   it("hides the page behind from assistive technology while open", async () => {
      await shown();
      await open();
      expect(screen.queryByRole("button", { name: "Expand diagram" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
   });

   it("closes with Escape and returns focus to Expand", async () => {
      await shown();
      await open();
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(expand()).toHaveFocus());
   });

   it("closes with Close and returns focus to Expand", async () => {
      await shown();
      await open();
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(expand()).toHaveFocus());
   });

   it("closes on backdrop activation and returns focus to Expand", async () => {
      await shown();
      await open();
      const backdrop = document.querySelector("[data-state=open].fixed.inset-0")!;
      expect(backdrop).not.toBeNull();
      fireEvent.pointerDown(backdrop);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(expand()).toHaveFocus());
   });
});

describe("Integrity", () => {
   it("gives the expanded drawing its own render id, so no id repeats while it is open", async () => {
      await shown();
      await open();
      await waitFor(() => expect(drawn()).toHaveLength(2));
      const [inline, expanded] = drawn();
      expect(expanded).not.toBe(inline);
      expect(expanded).toContain("-expanded-");
      await waitFor(() => expect(document.querySelectorAll("svg").length).toBe(2));

      const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
      expect(ids.length).toBeGreaterThan(2);
      expect(new Set(ids).size).toBe(ids.length);
   });

   it("leaves the inline diagram's own drawing untouched by opening the dialog", async () => {
      const { container } = await shown();
      const [inline] = drawn();
      await open();
      await waitFor(() => expect(drawn()).toHaveLength(2));
      expect(container.querySelector("svg")).toHaveAttribute("id", inline);
      expect(container.querySelector("svg")).toHaveAttribute("viewBox");
   });
});

describe("Theme", () => {
   it("redraws the inline diagram in the new theme under an id the document does not hold", async () => {
      const { container } = await shown();
      expect(initialize.mock.calls.at(-1)![0].themeVariables.background).toBe("#f8fbff");

      act(() => document.documentElement.classList.add("dark"));
      await waitFor(() => expect(drawn()).toHaveLength(2));
      expect(initialize.mock.calls.at(-1)![0].themeVariables.background).toBe("#111827");
      const [light, dark] = drawn();
      expect(dark).not.toBe(light);
      await waitFor(() => expect(container.querySelector("svg")).toHaveAttribute("id", dark));
      expect(container.querySelector("svg")).toHaveAttribute("viewBox");
   });

   // A theme change gives <DiagramExpand> a new `draw`; the open dialog must follow it, not close and reopen.
   it("redraws the open dialog from a new draw, in place", async () => {
      const draw = (theme: string) => vi.fn(async (id: string) => `<svg id="${id}" viewBox="0 0 1400 120" data-theme="${theme}"></svg>`);
      const light = draw("light");
      const props = { overflows: true, name: "Diagram", renderId: "mermaid-r0" };
      const { rerender } = render(<DiagramExpand {...props} draw={light} />);
      const dialog = await open();
      await waitFor(() => expect(dialog.querySelector("svg")).toHaveAttribute("data-theme", "light"));
      const first = dialog.querySelector("svg")!.id;

      const dark = draw("dark");
      rerender(<DiagramExpand {...props} draw={dark} />);
      await waitFor(() => expect(dialog.querySelector("svg")).toHaveAttribute("data-theme", "dark"));
      expect(screen.getByRole("dialog")).toBe(dialog);
      expect(dark).toHaveBeenCalledWith(first);
   });
});
