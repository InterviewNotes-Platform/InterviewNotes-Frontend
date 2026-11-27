/** Mermaid sets `width: 100%; max-width: <natural>`; pinning the natural width keeps text at its drawn size. */
export function pinNaturalSize(container: HTMLElement) {
   const svg = container.querySelector("svg");
   const width = Number(svg?.getAttribute("viewBox")?.trim().split(/[\s,]+/)[2]);
   if (!svg || !(width > 0)) return;
   svg.style.width = `${width}px`;
   svg.style.maxWidth = "none";
}

/** Puts a drawn diagram into its container; `natural` pins its drawn size, `hidden` leaves it to the container's name. */
export function showDiagram(container: HTMLElement, svg: string, { natural, hidden }: { natural: boolean; hidden: boolean }) {
   container.innerHTML = svg;
   if (natural) pinNaturalSize(container);
   if (hidden) container.querySelector("svg")?.setAttribute("aria-hidden", "true");
}

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;
export const zoomStep = (zoom: number, factor: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * factor * 100) / 100));

/** Viewport height kept free at zoom 1 for the site header, the docked Lesson outline, the frame's padding and the zoom controls. */
export const FIT_HEIGHT_RESERVE = "16rem";
/** Smallest fitted height, so a very short viewport still draws the diagram rather than collapsing it. */
export const FIT_HEIGHT_FLOOR = "10rem";

/**
 * Zoom 1 fits the whole drawing inside its column and the usable viewport height (never larger than drawn, aspect
 * ratio kept); other zooms scale that fit.
 */
export function zoomDrawing(container: HTMLElement | null, zoom: number) {
   const svg = container?.querySelector("svg");
   const [, , width, height] = (svg?.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
   if (!svg || !(width > 0)) return;
   svg.style.width = `${zoom * 100}%`;
   svg.style.maxWidth =
      height > 0
         ? `min(${width * zoom}px, calc(max(${FIT_HEIGHT_FLOOR}, 100svh - ${FIT_HEIGHT_RESERVE}) * ${+((width / height) * zoom).toFixed(4)}))`
         : `${width * zoom}px`;
}
