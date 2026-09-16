"use client";

import { useEffect, useId, useRef, useState } from "react";

interface MermaidProps {
   /** The raw diagram source from a ```mermaid fence. */
   chart: string;
}

type Theme = "light" | "dark";

/**
 * Palette pulled from `src/app/globals.css` so diagrams read as part of the
 * page rather than as a pasted-in image. Mermaid needs literal colour values —
 * it renders into an SVG and cannot resolve CSS custom properties — so these
 * mirror the `:root` and `.dark` token values.
 */
const PALETTE: Record<Theme, Record<string, string>> = {
   light: {
      primaryColor: "#dbeafe",
      primaryTextColor: "#0f172a",
      primaryBorderColor: "#30a2ff",
      secondaryColor: "#fef9e7",
      secondaryBorderColor: "#fdb517",
      tertiaryColor: "#e2e8f0",
      tertiaryBorderColor: "#475569",
      lineColor: "#475569",
      textColor: "#0f172a",
      background: "#f8fbff",
      mainBkg: "#dbeafe",
      nodeBorder: "#30a2ff",
      clusterBkg: "#f1f5f9",
      clusterBorder: "#cbd5e1",
      titleColor: "#0f172a",
      edgeLabelBackground: "#f8fbff",
   },
   dark: {
      primaryColor: "#1e3a5f",
      primaryTextColor: "#f8fafc",
      primaryBorderColor: "#5cb8ff",
      secondaryColor: "#422006",
      secondaryBorderColor: "#fbbf24",
      tertiaryColor: "#1e293b",
      tertiaryBorderColor: "#94a3b8",
      lineColor: "#94a3b8",
      textColor: "#f8fafc",
      background: "#111827",
      mainBkg: "#1e3a5f",
      nodeBorder: "#5cb8ff",
      clusterBkg: "#0f172a",
      clusterBorder: "#1e293b",
      titleColor: "#f8fafc",
      edgeLabelBackground: "#111827",
   },
};

function currentTheme(): Theme {
   return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Renders a Mermaid diagram client-side.
 *
 * `mermaid` is imported dynamically so its ~200 KB only loads on chapters that
 * actually contain a diagram, and never during SSR — it reaches for `document`
 * at module scope, which would crash the server render.
 *
 * Re-renders when the dark-mode class flips, because the palette is baked into
 * the generated SVG rather than read from CSS at paint time.
 */
export function Mermaid({ chart }: MermaidProps) {
   const containerRef = useRef<HTMLDivElement>(null);
   const [error, setError] = useState<string | null>(null);
   const [theme, setTheme] = useState<Theme | null>(null);

   // Track the dark-mode class on <html>.
   useEffect(() => {
      setTheme(currentTheme());

      const observer = new MutationObserver(() => setTheme(currentTheme()));
      observer.observe(document.documentElement, {
         attributes: true,
         attributeFilter: ["class"],
      });
      return () => observer.disconnect();
   }, []);

   // `useId` returns a value containing colons, which are invalid in the CSS
   // selectors Mermaid builds from the id.
   const rawId = useId();
   const diagramId = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

   useEffect(() => {
      if (theme === null) return;

      let cancelled = false;

      (async () => {
         try {
            const mermaid = (await import("mermaid")).default;

            mermaid.initialize({
               startOnLoad: false,
               securityLevel: "strict",
               theme: "base",
               fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
               themeVariables: PALETTE[theme],
            });

            const { svg } = await mermaid.render(diagramId, chart);
            if (cancelled || !containerRef.current) return;

            containerRef.current.innerHTML = svg;
            setError(null);
         } catch (err) {
            if (cancelled) return;
            // A malformed diagram should not blank the chapter around it.
            console.error("Mermaid render failed:", err);
            setError(err instanceof Error ? err.message : "Diagram failed to render");
         }
      })();

      return () => {
         cancelled = true;
      };
   }, [chart, theme, diagramId]);

   if (error) {
      return (
         <div className="my-6 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="mb-2 text-sm font-semibold text-destructive">
               Diagram failed to render
            </p>
            <pre className="overflow-x-auto text-xs font-mono text-muted-foreground">
               {chart}
            </pre>
         </div>
      );
   }

   return (
      <div
         ref={containerRef}
         role="img"
         aria-label="Architecture diagram"
         className="my-6 flex justify-center overflow-x-auto rounded-lg border border-border bg-card/40 p-4 [&_svg]:max-w-full [&_svg]:h-auto"
      />
   );
}

export default Mermaid;
