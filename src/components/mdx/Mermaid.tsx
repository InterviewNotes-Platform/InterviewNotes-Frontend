"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { DiagramExpand } from "./DiagramExpand";
import { diagramName } from "./fence";
import { showDiagram } from "./diagram-svg";
import { TechnicalScroll } from "@/components/ui/technical-scroll";

interface MermaidProps {
   /** The raw diagram source from a ```mermaid fence. */
   chart: string;
   /**
    * Lesson reading: draw the diagram at its natural size, plain while it fits its column and, only when it does
    * not, in a framed box that scrolls sideways. Default: the shared box that scales a wide diagram down.
    */
   adaptive?: boolean;
   /**
    * Catalog bodies: the diagram is a named figure with its authored caption and text alternative (plain text).
    * Absent, the legacy `/learn` markup is unchanged. Adaptive (reading) diagrams are always catalog diagrams.
    */
   figure?: { caption?: string; alt?: string };
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

let draws = 0;

/**
 * Draws `chart` in a scratch box that the reduced-motion rule leaves alone (see globals.css). Mermaid draws nothing
 * into an id the document already holds, so a redraw (theme change) must not reuse the previous drawing's id.
 */
async function drawDiagram(id: string, chart: string, theme: Theme): Promise<string> {
   const mermaid = (await import("mermaid")).default;

   mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
      themeVariables: PALETTE[theme],
   });

   const scratch = document.body.appendChild(document.createElement("div"));
   scratch.setAttribute("data-diagram-scratch", "");
   const { svg } = await mermaid.render(`${id}-${++draws}`, chart, scratch).finally(() => scratch.remove());
   return svg;
}

function currentTheme(): Theme {
   return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Tracks the dark-mode class on <html>. */
function subscribeToTheme(onChange: () => void) {
   const observer = new MutationObserver(onChange);
   observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
   return () => observer.disconnect();
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
export function Mermaid({ chart, adaptive = false, figure }: MermaidProps) {
   const catalog = adaptive || figure !== undefined;
   const name = diagramName(figure ?? {});
   const containerRef = useRef<HTMLDivElement>(null);
   const [error, setError] = useState<string | null>(null);
   const [overflows, setOverflows] = useState(false);

   // Null on the server and until hydrated, so the first client render matches the server HTML.
   const theme = useSyncExternalStore<Theme | null>(subscribeToTheme, currentTheme, () => null);

   // `useId` returns a value containing colons, which are invalid in the CSS
   // selectors Mermaid builds from the id.
   const rawId = useId();
   const diagramId = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
   const captionId = `${diagramId}-caption`;
   const drawExpanded = useCallback((id: string) => drawDiagram(id, chart, theme ?? "light"), [chart, theme]);

   useEffect(() => {
      if (theme === null) return;

      let cancelled = false;

      (async () => {
         try {
            const svg = await drawDiagram(diagramId, chart, theme);
            if (cancelled || !containerRef.current) return;

            // The container's name speaks for the diagram; the drawing is not announced a second time.
            showDiagram(containerRef.current, svg, { natural: adaptive, hidden: catalog });
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
   }, [chart, theme, diagramId, adaptive, catalog]);

   const caption = figure?.caption ? (
      <figcaption id={adaptive ? captionId : undefined} className="mt-3 text-supporting text-pretty text-muted-foreground">
         {figure.caption}
      </figcaption>
   ) : null;

   if (error) {
      const failed = (
         <div
            {...(catalog ? { role: "img", "aria-label": name } : {})}
            className={`${catalog ? "" : "my-6 "}rounded-lg border border-destructive/40 bg-destructive/5 p-4`}
         >
            <p className="mb-2 text-sm font-semibold text-destructive">
               Diagram failed to render
            </p>
            <pre className="overflow-x-auto text-xs font-mono text-muted-foreground">
               {chart}
            </pre>
         </div>
      );
      return catalog ? (
         <figure className="my-6">
            {failed}
            {caption}
         </figure>
      ) : (
         failed
      );
   }

   if (adaptive) {
      return (
         <figure className="my-6">
            <TechnicalScroll
               label={name}
               onScrollsChange={setOverflows}
               className="rounded-lg data-[scrolls=true]:border data-[scrolls=true]:border-border data-[scrolls=true]:p-4"
            >
               <div ref={containerRef} role="img" aria-label={name} className="[&_svg]:mx-auto [&_svg]:block [&_svg]:h-auto" />
            </TechnicalScroll>
            <DiagramExpand
               overflows={overflows}
               name={name}
               caption={figure?.caption}
               captionId={figure?.caption ? captionId : undefined}
               draw={drawExpanded}
               renderId={diagramId}
            />
            {caption}
         </figure>
      );
   }

   if (catalog) {
      return (
         <figure className="my-6">
            <div
               ref={containerRef}
               role="img"
               aria-label={name}
               className="flex justify-center overflow-x-auto rounded-lg border border-border bg-card/40 p-4 [&_svg]:max-w-full [&_svg]:h-auto"
            />
            {caption}
         </figure>
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
