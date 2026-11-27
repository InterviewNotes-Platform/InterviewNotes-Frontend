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

/** Zoom 1 fits the whole drawing to its column (never wider than drawn); other zooms scale that fit. */
export function zoomDrawing(container: HTMLElement | null, zoom: number) {
   const svg = container?.querySelector("svg");
   const width = Number(svg?.getAttribute("viewBox")?.trim().split(/[\s,]+/)[2]);
   if (!svg || !(width > 0)) return;
   svg.style.width = `${zoom * 100}%`;
   svg.style.maxWidth = `${width * zoom}px`;
}
