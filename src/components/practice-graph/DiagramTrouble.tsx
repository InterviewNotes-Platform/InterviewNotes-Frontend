"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Refusal } from "@/lib/practice-graph/diagramSave";
import { recreateAsNew, type DBoundary, type DEdge, type DNode } from "@/lib/practice-graph/model";
import { buildReviewed, differences, type Choice, type Difference } from "@/lib/practice-graph/review";
import { BOUNDARY_TYPE_LABEL, EDGE_KIND_LABEL, NODE_TYPE, boundaryName, nodeName } from "@/lib/practice-graph/vocabulary";
import type { GraphEditor } from "./useGraphEditor";

const excerpt = (text: string) => {
   const t = text.trim();
   return t === "" ? "" : `: “${[...t].slice(0, 80).join("")}${[...t].length > 80 ? "…" : ""}”`;
};

function summary(difference: Difference, side: "mine" | "theirs", names: (id: string) => string): string {
   const element = difference[side];
   if (!element) return side === "mine" ? "Deleted here" : "Deleted on the other version";
   if (difference.kind === "node") {
      const node = element as DNode;
      return `${nodeName(node.label, node.type)} (${NODE_TYPE[node.type].label.toLowerCase()})${excerpt(node.explanation)}`;
   }
   if (difference.kind === "edge") {
      const edge = element as DEdge;
      return `${EDGE_KIND_LABEL[edge.kind]} from ${names(edge.from)} to ${names(edge.to)}${edge.tag.trim() ? ` [${edge.tag.trim()}]` : ""}${excerpt(edge.explanation)}`;
   }
   const boundary = element as DBoundary;
   return `${boundaryName(boundary.label, boundary.type)} (${BOUNDARY_TYPE_LABEL[boundary.type].toLowerCase()})`;
}

/** Review: every element that differs, the learner's pick for each, and a save that stays blocked while a kept connection would dangle. */
function Review({ editor, onDone }: { editor: GraphEditor; onDone: () => void }) {
   const ids = useId();
   const theirs = editor.snapshot.theirs!;
   const mine = editor.draft;
   const diffs = differences(mine, theirs);
   const [choices, setChoices] = useState<Record<string, Choice>>(() => Object.fromEntries(diffs.map((d) => [d.id, "mine" as Choice])));
   const reviewed = buildReviewed(mine, theirs, choices);
   const names = (id: string) => {
      const node = mine.graph.nodes.find((n) => n.id === id) ?? theirs.graph.nodes.find((n) => n.id === id);
      return node ? nodeName(node.label, node.type as DNode["type"]) : "a component";
   };
   return (
      <div className="grid gap-3" role="group" aria-labelledby={`${ids}-h`}>
         <h3 id={`${ids}-h`} className="m-0 text-base font-semibold">
            Review the differences ({diffs.length})
         </h3>
         <ul className="m-0 grid list-none gap-3 p-0">
            {diffs.map((d) => (
               <li key={d.id}>
                  <fieldset className="pg-review-item">
                     <legend className="text-sm font-semibold">{d.kind === "node" ? "Component" : d.kind === "edge" ? "Connection" : "Boundary"}</legend>
                     {(["mine", "theirs"] as const).map((side) => (
                        <label key={side} className="pg-check">
                           <input type="radio" name={`${ids}-${d.id}`} checked={choices[d.id] === side} onChange={() => setChoices((c) => ({ ...c, [d.id]: side }))} />
                           <span>
                              <span className="font-semibold">{side === "mine" ? "Yours: " : "Other version: "}</span>
                              {summary(d, side, names)}
                           </span>
                        </label>
                     ))}
                  </fieldset>
               </li>
            ))}
         </ul>
         {reviewed.dangling.length > 0 ? (
            <p className="m-0 text-sm font-semibold text-destructive" role="note">
               {reviewed.dangling.length === 1 ? "One connection you kept has" : `${reviewed.dangling.length} connections you kept have`} an end that is not kept. Keep that component, or keep the other version of the connection.
            </p>
         ) : null}
         <div className="flex flex-wrap gap-2">
            <Button
               type="button"
               className="min-h-11"
               disabled={reviewed.dangling.length > 0 || editor.snapshot.resolving}
               onClick={() => {
                  editor.forgetHistory();
                  void editor.engine.resolveWith(() => reviewed.draft);
                  onDone();
               }}
            >
               Save this version
            </Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={onDone}>
               Back
            </Button>
         </div>
      </div>
   );
}

/** What the learner must do about unsaved diagram work comes first and cannot be missed (`P9-AC-15.1`, contract §7 and §8). */
export function DiagramTrouble({ editor, refusal }: { editor: GraphEditor; refusal: Refusal | null }) {
   const ids = useId();
   const [reviewing, setReviewing] = useState(false);
   const { snapshot, engine } = editor;
   const { phase, note, theirs, resolving } = snapshot;
   if (phase === "conflict") {
      return (
         <div className="pg-trouble" role="group" aria-labelledby={`${ids}-h`} data-diagram-trouble="conflict">
            <h2 id={`${ids}-h`} className="m-0 text-base font-semibold">
               Your diagram was changed somewhere else
            </h2>
            <p className="m-0">{note}</p>
            {theirs === null ? (
               <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => void engine.reloadConflict()}>
                  Load the other version again
               </Button>
            ) : reviewing ? (
               <Review editor={editor} onDone={() => setReviewing(false)} />
            ) : (
               <div className="flex flex-wrap gap-2">
                  <Button type="button" className="min-h-11" disabled={resolving} onClick={() => void engine.keepMine()}>
                     Keep mine
                  </Button>
                  <Button
                     type="button"
                     variant="outline"
                     className="min-h-11"
                     disabled={resolving}
                     onClick={() => {
                        editor.forgetHistory();
                        void engine.takeTheirs();
                     }}
                  >
                     Take theirs
                  </Button>
                  <Button type="button" variant="outline" className="min-h-11" disabled={resolving} onClick={() => setReviewing(true)}>
                     Review
                  </Button>
               </div>
            )}
         </div>
      );
   }
   if (phase === "invalid" || phase === "offline" || phase === "terminal" || phase === "signin" || phase === "gone") {
      const retired = (refusal?.reasons ?? []).filter((r) => r.rule === "retired_id" && r.elementId).map((r) => r.elementId!);
      return (
         <div className="pg-trouble" role="group" aria-labelledby={`${ids}-h`} data-diagram-trouble={phase}>
            <h2 id={`${ids}-h`} className="m-0 text-base font-semibold">
               {phase === "terminal" ? "This attempt has ended" : "Your diagram is not saved"}
            </h2>
            {retired.length > 0 && phase === "invalid" ? (
               <>
                  <p className="m-0">This deletion can no longer be undone: the server no longer keeps those elements. You can add them again as new elements, with the same names and explanations.</p>
                  <Button type="button" className="min-h-11 justify-self-start" onClick={() => editor.apply((d) => recreateAsNew(d, retired), { announce: "Added again as new elements. It saves shortly." })}>
                     Add them again as new
                  </Button>
               </>
            ) : (
               <p className="m-0">{note ?? (phase === "terminal" ? "Changes can no longer be saved." : "")}</p>
            )}
            {phase === "offline" || (phase === "invalid" && retired.length === 0 && refusal) ? (
               <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => void engine.retry()}>
                  Try again now
               </Button>
            ) : null}
         </div>
      );
   }
   return null;
}
