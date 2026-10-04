import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

/** The body of a top-level `selector { … }` rule, so nested at-rules and braces are handled. */
function block(selector: string): string {
   const start = css.indexOf(`\n${selector} {`);
   expect(start, `${selector} block`).toBeGreaterThan(-1);
   const open = css.indexOf("{", start);
   let depth = 0;
   for (let i = open; i < css.length; i++) {
      depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0;
      if (depth === 0) return css.slice(open + 1, i);
   }
   throw new Error(`${selector} block is not closed`);
}

const declarations = (body: string) =>
   Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name.slice(2), value.trim()]));

const light = declarations(block(":root"));
const dark = declarations(block(".dark"));
const themeInline = declarations(block("@theme inline"));
const theme = declarations(block("@theme"));

/** Every colour utility is `--color-x: var(--x)`; these are the tokens the app can actually reach. */
const mapped = Object.entries(themeInline)
   .filter(([name]) => name.startsWith("color-"))
   .map(([name, value]) => [name.slice("color-".length), /^var\(--([\w-]+)\)$/.exec(value)?.[1]] as const);

const SEMANTIC = [
   "background", "foreground", "muted-foreground", "surface", "border", "input", "primary",
   "primary-foreground", "ring", "code-surface", "premium", "gold", "gold-foreground", "destructive",
];

describe("semantic token parity", () => {
   it("defines every token a colour utility reads in both :root and .dark", () => {
      for (const [utility, token] of mapped) {
         expect(token, `--color-${utility} must be var(--token)`).toBeDefined();
         expect(light, `:root --${token}`).toHaveProperty(token!);
         expect(dark, `.dark --${token}`).toHaveProperty(token!);
      }
   });

   it("exposes the P2 semantic set as utilities and defines each in both themes", () => {
      const utilities = new Map(mapped);
      for (const name of SEMANTIC) {
         expect(utilities.get(name), `--color-${name}`).toBe(name);
         expect(light, `:root --${name}`).toHaveProperty(name);
         expect(dark, `.dark --${name}`).toHaveProperty(name);
      }
   });

   it("keeps the two themes' colour tokens identical in name, with no orphans", () => {
      const colours = (theme: Record<string, string>) => Object.keys(theme).filter((n) => theme[n].startsWith("#")).sort();
      expect(colours(dark)).toEqual(colours(light));
   });
});

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const luminance = (hex: string) => {
   const [r, g, b] = rgb(hex).map(lin);
   return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
   const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
   return (hi + 0.05) / (lo + 0.05);
};
/** `fg` at `alpha` over `bg`, as the browser composites `bg-premium/10`. */
const over = (fg: string, bg: string, alpha: number) =>
   "#" + rgb(fg).map((c, i) => Math.round((c * alpha + rgb(bg)[i] * (1 - alpha)) * 255).toString(16).padStart(2, "0")).join("");

describe.each([
   ["light", light],
   ["dark", dark],
])("%s theme contrast (WCAG 2.2 AA)", (_name, t) => {
   const text = (fg: string, bg: string) => expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
   const graphic = (fg: string, bg: string) => expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);

   it("primary and supporting text read on every surface they sit on", () => {
      for (const surface of ["background", "surface", "code-surface", "muted", "card", "popover"]) text("foreground", surface);
      for (const surface of ["background", "surface", "code-surface", "muted"]) text("muted-foreground", surface);
   });

   it("links (the interactive accent) read on page, surface and code backgrounds", () => {
      for (const surface of ["background", "surface", "code-surface"]) text("primary", surface);
      text("primary-foreground", "primary");
   });

   it("the focus ring is visible against every surface a focused element sits on", () => {
      for (const surface of ["background", "surface", "code-surface"]) graphic("ring", surface);
   });

   it("the form-control boundary meets 3:1 while the separator stays a quiet hairline", () => {
      graphic("input", "background");
      graphic("input", "surface");
      const hairline = contrast(t.border, t.background);
      expect(hairline).toBeGreaterThan(1.1);
      expect(hairline).toBeLessThan(3);
   });

   it("premium and destructive accents are legible as text and as filled controls", () => {
      for (const surface of ["background", "surface"]) text("premium", surface);
      expect(contrast(t.premium, over(t.premium, t.background, 0.1))).toBeGreaterThanOrEqual(4.5);
      text("destructive", "background");
      text("destructive-foreground", "destructive");
      text("gold-foreground", "gold");
      text("accent-foreground", "accent");
   });

   it("the sidebar pairs stay legible", () => {
      text("sidebar-foreground", "sidebar");
      text("sidebar-accent-foreground", "sidebar-accent");
      text("sidebar-primary-foreground", "sidebar-primary");
   });
});

const px = (value: string) => parseFloat(value) * (value.endsWith("rem") ? 16 : 1);

describe("type scale and layout", () => {
   const SCALE: [string, number, number][] = [
      ["display", 48, 56], ["title", 40, 48], ["section", 28, 36], ["subsection", 22, 30],
      ["body", 17, 28], ["supporting", 14, 20], ["code", 14, 22],
   ];

   it.each(SCALE)("text-%s is %ipx / %ipx at its largest", (name, size, lineHeight) => {
      const largest = /^clamp\(.*,\s*([\d.]+rem)\)$/.exec(theme[`text-${name}`])?.[1] ?? theme[`text-${name}`];
      const [, top, bottom] = /^calc\((\d+) \/ (\d+)\)$/.exec(theme[`text-${name}--line-height`]) ?? [];
      expect(px(largest)).toBe(size);
      expect(px(largest) * (Number(top) / Number(bottom))).toBeCloseTo(lineHeight);
   });

   it("keeps the page container near 1200–1280px and the reading column near 720–760px", () => {
      expect(px(theme["container-page"])).toBeGreaterThanOrEqual(1200);
      expect(px(theme["container-page"])).toBeLessThanOrEqual(1280);
      expect(px(theme["container-reading"])).toBeGreaterThanOrEqual(720);
      expect(px(theme["container-reading"])).toBeLessThanOrEqual(760);
   });
});

describe("focus and reduced-motion foundation", () => {
   it("draws one global focus indicator from the ring token", () => {
      expect(css).toMatch(/:focus-visible\s*{\s*outline:\s*2px solid var\(--ring\);/);
   });

   it("smooth-scrolls only when motion is not reduced", () => {
      const smooth = [...css.matchAll(/scroll-behavior:\s*smooth/g)];
      expect(smooth).toHaveLength(1);
      expect(css.slice(0, smooth[0].index)).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*{\s*html\s*{\s*$/);
   });

   it("collapses animation and transition time under reduced motion", () => {
      const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
      expect(reduced).toMatch(/animation-duration:\s*0\.01ms !important/);
      expect(reduced).toMatch(/transition-duration:\s*0\.01ms !important/);
      expect(reduced).toMatch(/scroll-behavior:\s*auto !important/);
   });
});
