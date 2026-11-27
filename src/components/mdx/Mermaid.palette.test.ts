import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("mermaid", () => ({ default: {} }));

import { PALETTE } from "./Mermaid";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const block = (selector: string) => css.slice(css.indexOf(`${selector} {`), css.indexOf("}", css.indexOf(`${selector} {`)));
const token = (selector: string, name: string) => block(selector).match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))![1].toLowerCase();

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
   const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
   return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
   const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
   return (hi + 0.05) / (lo + 0.05);
};

describe.each([
   ["light", ":root"],
   ["dark", ".dark"],
] as const)("the %s diagram palette", (theme, selector) => {
   const p = PALETTE[theme];

   it("takes its ground, text, node edge and group fill from the page's tokens", () => {
      expect(p.background).toBe(token(selector, "background"));
      expect(p.edgeLabelBackground).toBe(token(selector, "background"));
      expect(p.textColor).toBe(token(selector, "foreground"));
      expect(p.primaryTextColor).toBe(token(selector, "foreground"));
      expect(p.nodeBorder).toBe(token(selector, "primary"));
      expect(p.clusterBkg).toBe(token(selector, "surface"));
      expect(p.lineColor).toBe(token(selector, "muted-foreground"));
   });

   it("keeps label text readable on every fill (WCAG AA 4.5:1)", () => {
      for (const fill of ["primaryColor", "secondaryColor", "tertiaryColor", "background", "clusterBkg"]) {
         expect(contrast(p.textColor, p[fill]), fill).toBeGreaterThanOrEqual(4.5);
      }
   });

   it("keeps edges and node outlines visible against the ground (3:1)", () => {
      for (const stroke of ["lineColor", "nodeBorder", "secondaryBorderColor", "tertiaryBorderColor"]) {
         expect(contrast(p[stroke], p.background), stroke).toBeGreaterThanOrEqual(3);
      }
   });
});
