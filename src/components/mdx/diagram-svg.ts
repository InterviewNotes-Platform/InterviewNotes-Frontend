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
