import type { Metadata } from "next";
import { isPreview } from "@/lib/catalog/preview";

/** A preview page is never indexed or followed, whatever else its metadata says or fails to say. */
export function withPreviewRobots(metadata: Metadata): Metadata {
   return isPreview() ? { ...metadata, robots: { index: false, follow: false } } : metadata;
}

/** Rendered on the server so it is in the HTML itself; nothing about the environment is named. */
export function PreviewMarker() {
   if (!isPreview()) return null;
   return (
      <aside
         aria-label="Preview"
         className="sticky top-16 z-40 border-b border-border bg-foreground px-6 py-2 text-center text-sm text-background"
      >
         <strong className="font-semibold uppercase tracking-wide">Preview</strong>
         <span> · Reviewer view. This is not the live site.</span>
      </aside>
   );
}
