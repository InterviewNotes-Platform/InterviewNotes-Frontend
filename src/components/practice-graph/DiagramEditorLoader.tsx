"use client";

import dynamic from "next/dynamic";
import type { DiagramEditorProps } from "./DiagramEditor";

/**
 * The only way into the diagram editor: a dynamic import, so `@xyflow/react` and the editor's styles are a separate chunk that only the
 * attempt route ever requests, and only once a stage that shows the diagram is open (never on home, catalog, readers or Prepare).
 */
const DiagramEditor = dynamic(() => import("./DiagramEditor"), {
   ssr: false,
   loading: () => (
      <p role="status" className="py-12 text-center text-body text-muted-foreground">
         Loading the design canvas…
      </p>
   ),
});

export function DiagramEditorLoader(props: DiagramEditorProps) {
   return <DiagramEditor {...props} />;
}
