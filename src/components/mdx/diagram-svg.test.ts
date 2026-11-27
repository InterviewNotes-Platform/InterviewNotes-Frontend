import { describe, expect, it } from "vitest";
import { zoomDrawing } from "./diagram-svg";

const drawing = (viewBox: string) => {
   const container = document.createElement("div");
   container.innerHTML = `<svg viewBox="${viewBox}"><g/></svg>`;
   return { container, svg: container.querySelector("svg")! };
};

describe("zoomDrawing", () => {
   it("caps a tall drawing's width so its whole height fits the usable viewport, keeping the aspect ratio", () => {
      const { container, svg } = drawing("0 0 400 1600");
      zoomDrawing(container, 1);
      expect(svg.style.width).toBe("100%");
      expect(svg.style.maxWidth).toBe("min(400px, 0.25 * (100svh - 10rem))");
   });

   it("scales the height cap with zoom so a deliberate zoom-in grows past one screen", () => {
      const { container, svg } = drawing("0 0 400 1600");
      zoomDrawing(container, 2);
      expect(svg.style.width).toBe("200%");
      expect(svg.style.maxWidth).toBe("min(800px, 0.5 * (100svh - 10rem))");
   });

   it("falls back to the width fit when the drawing has no height", () => {
      const { container, svg } = drawing("0 0 400 0");
      zoomDrawing(container, 1);
      expect(svg.style.maxWidth).toBe("400px");
   });
});
