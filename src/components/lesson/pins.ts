/** A pinned block: only what the reader was shown on a readable page (T26 §3): where it is, and a short preview of it. */
export interface Pin {
   key: string;
   kind: "Table" | "Diagram";
   /** The page the block is on, so "Go to source" can return to it from another reader page. */
   route: string;
   /** The exhibit's own element id on that page: one occurrence, even when two blocks have the same content. */
   anchor: string;
   /** The heading of the section the block sits in, when it has one. */
   section: { id: string; title: string } | null;
   preview: string;
   no: number;
}

/** Module constants, so the store's `initial` is stable (T26 contract). */
export const NO_PINS: readonly Pin[] = [];
export const PINS_KEY = "pins";
export const SCRATCH_KEY = "scratch:lesson";
export const SCRATCH_OPEN_KEY = "scratch:lesson:open";
/** The newest this many show in the margin; the rest behind "Show all n slips". */
export const SHOWN_SLIPS = 4;

/** Dispatched on an exhibit to open its viewer (from a pinned slip); `detail` is where focus returns, if anywhere. */
export const EXHIBIT_OPEN = "lesson:exhibit-open";

/** A diagram's own viewer trigger: present only while the diagram overflows its column (S-DGM-6). */
export const DIAGRAM_VIEWER = 'figure button[aria-haspopup="dialog"]';

/** An exhibit's id from its place in the body: the block path and the source offset, so it is stable across renders. */
export function exhibitAnchor(blockPath: string, offset: number | undefined): string {
   return `exhibit-${blockPath}-${offset ?? 0}`;
}

export function pinKey(route: string, anchor: string): string {
   return `${route}#${anchor}`;
}

/** Adds the pin at the front with the next slip number, or removes it if it is already pinned. */
export function togglePin(pins: readonly Pin[], pin: Omit<Pin, "no">): readonly Pin[] {
   if (pins.some(({ key }) => key === pin.key)) return pins.filter(({ key }) => key !== pin.key);
   const no = pins.reduce((max, { no }) => Math.max(max, no), 0) + 1;
   return [{ ...pin, no }, ...pins];
}

/** The section a block sits in: the last h2 with an id before it in the document. */
export function sectionOf(block: Element): Pin["section"] {
   const headings = block.ownerDocument.querySelectorAll<HTMLElement>("[data-catalog-body] h2[id]");
   let found: HTMLElement | null = null;
   headings.forEach((heading) => {
      if (heading.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING) found = heading;
   });
   const heading = found as HTMLElement | null;
   if (!heading) return null;
   const text = heading.ownerDocument.getElementById(`${heading.id}_text`)?.textContent ?? heading.textContent ?? "";
   return { id: heading.id, title: text.trim() };
}

/** Rows and columns, then the header cells: built only from the pinned table itself. */
export function tablePreview(table: HTMLTableElement): string {
   const head = [...table.querySelectorAll("thead th")].map((cell) => cell.textContent?.trim()).filter(Boolean);
   const rows = table.querySelectorAll("tbody tr").length;
   const columns = table.rows[0]?.cells.length ?? 0;
   return `${rows} rows · ${columns} columns${head.length ? ` — ${head.join(", ")}` : ""}`;
}
