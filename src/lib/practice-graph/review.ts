/**
 * Review, the third conflict choice (graph-editor-contract §7 and §8): the two versions compared element by element, by ID, and a
 * graph built from the learner's choice for each difference. Nothing is chosen for the learner. A connection kept while one of its
 * ends is not is reported as dangling, and the result cannot be saved until the learner restores that end or drops the connection.
 */

import type { DiagramOut } from "@/lib/practice-workspace/types";
import { draftOfDiagram, type DBoundary, type DEdge, type DNode, type DiagramDraft } from "./model";
import { storedText } from "./text";

export type ElementKind = "node" | "edge" | "boundary";
type Element = DNode | DEdge | DBoundary;

export interface Difference {
   id: string;
   kind: ElementKind;
   /** Here: the learner's version; null when it was deleted here (or never existed here). */
   mine: Element | null;
   /** The other version (the server's current copy); null when it is not there. */
   theirs: Element | null;
}

export type Choice = "mine" | "theirs";

const kindOf = (id: string): ElementKind => (id.startsWith("n_") ? "node" : id.startsWith("e_") ? "edge" : "boundary");

const comparable = (element: Element): string =>
   JSON.stringify(Object.fromEntries(Object.entries(element).map(([key, value]) => [key, typeof value === "string" && ["label", "tag", "explanation"].includes(key) ? storedText(value) : value])));

function index(draft: DiagramDraft): Map<string, Element> {
   return new Map<string, Element>([...draft.graph.nodes, ...draft.graph.edges, ...draft.graph.boundaries].map((e) => [e.id, e]));
}

/** Every element that differs between the two versions, in ID order. Layout differences are not listed: positions follow each choice. */
export function differences(mine: DiagramDraft, theirs: DiagramOut): Difference[] {
   const a = index(mine);
   const b = index(draftOfDiagram(theirs));
   const ids = [...new Set([...a.keys(), ...b.keys()])].sort();
   const out: Difference[] = [];
   for (const id of ids) {
      const m = a.get(id) ?? null;
      const t = b.get(id) ?? null;
      if (m && t && comparable(m) === comparable(t)) continue;
      out.push({ id, kind: kindOf(id), mine: m, theirs: t });
   }
   return out;
}

export interface Reviewed {
   draft: DiagramDraft;
   /** Connections kept whose end is not kept: they block saving. */
   dangling: string[];
}

/** The graph that results from `choices` (a difference without a choice keeps the other version). */
export function buildReviewed(mine: DiagramDraft, theirs: DiagramOut, choices: Readonly<Record<string, Choice>>): Reviewed {
   const base = draftOfDiagram(theirs);
   const chosen = new Map<string, Element | null>();
   for (const difference of differences(mine, theirs)) {
      if (choices[difference.id] === "mine") chosen.set(difference.id, difference.mine);
   }
   const pick = <T extends Element>(list: T[], fromMine: T[]): T[] => {
      const result = new Map(list.map((e) => [e.id, e] as const));
      for (const [id, element] of chosen) {
         if (element === null) result.delete(id);
         else if (fromMine.some((e) => e.id === id)) result.set(id, element as T);
      }
      return [...result.values()];
   };
   const boundaries = pick(base.graph.boundaries, mine.graph.boundaries);
   const boundaryIds = new Set(boundaries.map((b) => b.id));
   const nodes = pick(base.graph.nodes, mine.graph.nodes).map((n) => (n.boundary && !boundaryIds.has(n.boundary) ? { ...n, boundary: null } : n));
   const nodeIds = new Set(nodes.map((n) => n.id));
   const edges = pick(base.graph.edges, mine.graph.edges);
   const dangling = edges.filter((e) => !nodeIds.has(e.from) || !nodeIds.has(e.to)).map((e) => e.id);
   const takeMine = (id: string) => choices[id] === "mine";
   const frames = { ...base.layout.nodes };
   for (const [id, frame] of Object.entries(mine.layout.nodes)) if (takeMine(id) || !(id in frames)) frames[id] = frame;
   const routes = { ...base.layout.edges };
   for (const [id, points] of Object.entries(mine.layout.edges)) if (takeMine(id) || !(id in routes)) routes[id] = points;
   return { draft: { graph: { schema: "in.arch-graph/1", nodes, edges, boundaries }, layout: { nodes: frames, edges: routes } }, dangling };
}
