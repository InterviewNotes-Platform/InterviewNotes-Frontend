/**
 * The diagram as one autosave resource per attempt, on T13's engine (`autosave.ts`): the draft is the editor's graph and layout,
 * the canonical copy is the `DiagramOut` the server last returned, and a write is a whole-document `PUT` with the held `version`
 * (compare-and-set). A conflict is never merged silently: Keep mine sends this whole graph (tombstoned IDs in it are restorations),
 * Take theirs adopts the server's, and Review builds a graph element by element (`review.ts`).
 */

import { AutosaveEngine, type LoadOutcome, type Resource, type SaveOutcome } from "@/lib/practice-workspace/autosave";
import type { PracticeClient, PracticeResult } from "@/lib/practice-workspace/client";
import type { ArchGraph, ArchLayout, DiagramOut } from "@/lib/practice-workspace/types";
import { canonicalJson, wireGraph, wireLayout, wireOfSaved } from "./canonical";
import { draftOfDiagram, type DiagramDraft } from "./model";
import { issueMessage, validateDraft } from "./validate";

export interface DiagramPatch {
   graph: ArchGraph;
   layout: ArchLayout;
}

export type DiagramEngine = AutosaveEngine<DiagramDraft, DiagramOut, DiagramPatch>;

/** The last refusal the server gave, as machine reasons only, for the editor to explain (for example a `retired_id` restoration). */
export interface Refusal {
   reasons: { rule: string; elementId?: string }[];
}

// Both sides are immutable values, so their canonical forms are computed once each (the engine compares on every change).
const draftWire = new WeakMap<DiagramDraft, DiagramPatch & { graphJson: string; layoutJson: string }>();
const savedWire = new WeakMap<DiagramOut, { graph: string; layout: string }>();

export function diffDiagram(draft: DiagramDraft, saved: DiagramOut): DiagramPatch | null {
   let mine = draftWire.get(draft);
   if (!mine) {
      const graph = wireGraph(draft.graph);
      const layout = wireLayout(draft);
      mine = { graph, layout, graphJson: canonicalJson(graph), layoutJson: JSON.stringify(layout) };
      draftWire.set(draft, mine);
   }
   let held = savedWire.get(saved);
   if (!held) {
      held = wireOfSaved(saved);
      savedWire.set(saved, held);
   }
   if (mine.graphJson === held.graph && mine.layoutJson === held.layout) return null;
   return { graph: mine.graph, layout: mine.layout };
}

function outcomeOf(result: PracticeResult<DiagramOut>, refused: (refusal: Refusal | null) => void): SaveOutcome<DiagramOut> {
   refused(null);
   switch (result.status) {
      case "ok":
         return { kind: "ok", saved: result.data };
      case "unauthenticated":
         return { kind: "signin" };
      case "notFound":
      case "disabled":
         return { kind: "gone" };
      case "unavailable":
         return result.cause === "aborted" ? { kind: "aborted" } : { kind: "offline" };
      default:
         if (result.code === "version_conflict") return { kind: "conflict" };
         if (result.code === "attempt_not_active") return { kind: "not_active" };
         if (result.code === "graph_invalid" || result.code === "graph_too_large" || result.code === "validation_error") {
            refused({ reasons: result.reasons ?? [] });
            return { kind: "invalid" };
         }
         return { kind: "offline" };
   }
}

/** The first rule the draft breaks, in words; nothing is sent while there is one. */
export function checkDraft(draft: DiagramDraft): string | null {
   const issue = validateDraft(draft)[0];
   if (!issue) return null;
   const node = issue.elementId ? draft.graph.nodes.find((n) => n.id === issue.elementId) : undefined;
   const name = node ? "a component" : issue.elementId?.startsWith("e_") ? "a connection" : issue.elementId?.startsWith("b_") ? "a boundary" : "the diagram";
   return `Not saved: ${issueMessage(issue, name)} Your diagram is still here.`;
}

export function diagramResource(client: PracticeClient, attemptId: string, refused: (refusal: Refusal | null) => void): Resource<DiagramDraft, DiagramOut, DiagramPatch> {
   return {
      draftOf: draftOfDiagram,
      diff: diffDiagram,
      check: checkDraft,
      keepMine: (mine) => mine,
      // Not offered for graphs: arbitrary graphs are never merged. Review (`resolveWith`) is the element-by-element choice.
      combine: (mine) => ({ draft: mine }),
      async send(saved, patch, signal) {
         return outcomeOf(await client.putDiagram(attemptId, { version: saved.version, graph: patch.graph, layout: patch.layout }, { signal }), refused);
      },
      async load(signal): Promise<LoadOutcome<DiagramOut>> {
         const [diagram, attempt] = await Promise.all([client.getDiagram(attemptId, { signal }), client.getAttempt(attemptId, { signal })]);
         for (const result of [diagram, attempt]) {
            if (result.status === "unauthenticated") return { kind: "signin" };
            if (result.status === "notFound" || result.status === "disabled") return { kind: "gone" };
            if (result.status === "unavailable" && result.cause === "aborted") return { kind: "aborted" };
         }
         if (diagram.status !== "ok" || attempt.status !== "ok") return { kind: "offline" };
         return { kind: "ok", saved: diagram.data, active: attempt.data.status === "active" };
      },
   };
}

export function createDiagramEngine(client: PracticeClient, attemptId: string, initial: DiagramOut, refused: (refusal: Refusal | null) => void, onTerminal?: () => void): DiagramEngine {
   return new AutosaveEngine({ resource: diagramResource(client, attemptId, refused), initial, onTerminal });
}
