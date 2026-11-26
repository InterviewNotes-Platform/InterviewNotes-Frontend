"use client";

import { createContext, memo, useContext, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type Edge, type EdgeProps } from "@xyflow/react";
import type { DEdge } from "@/lib/practice-graph/model";
import type { Route } from "@/lib/practice-graph/routing";

export type CurvedData = { edge: DEdge; markers: boolean; bendable: boolean };
export type CurvedFlowEdge = Edge<CurvedData, "curved">;

export interface EdgeRouting {
   routes: ReadonlyMap<string, Route>;
   /** Moves the bend point while dragging (`final` false) and stores it when released (`final` true). */
   onBend: (id: string, point: { x: number; y: number }, final: boolean) => void;
}

export const RoutingContext = createContext<EdgeRouting>({ routes: new Map(), onBend: () => undefined });

/**
 * A directed connection: the bounded router's curve (or the learner's bend), a visible arrowhead, and on the canvas at most the short tag
 * plus an "unexplained" dot. When selected, a handle on the curve moves its one bend point (a layout waypoint; never part of the graph).
 */
function CurvedEdgeView({ id, data, selected, markerEnd, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }: EdgeProps<CurvedFlowEdge>) {
   const { routes, onBend } = useContext(RoutingContext);
   const { screenToFlowPosition } = useReactFlow();
   const dragging = useRef(false);
   const route = routes.get(id);
   let path: string;
   let mx: number;
   let my: number;
   if (route) {
      path = route.d;
      mx = route.mid.x;
      my = route.mid.y;
   } else {
      [path, mx, my] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
   }
   const tag = data?.edge.tag.trim() ?? "";
   const unexplained = data?.markers && data.edge.explanation.trim() === "";

   const move = (event: ReactPointerEvent, final: boolean) => onBend(id, screenToFlowPosition({ x: event.clientX, y: event.clientY }), final);
   return (
      <>
         <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={18} className={`pg-edge${selected ? " is-selected" : ""}`} data-route={route ? (route.clear ? "clear" : "fallback") : "pending"} />
         {tag || unexplained || (selected && data?.bendable) ? (
            <EdgeLabelRenderer>
               <div className={`pg-edge-label nodrag nopan${selected ? " is-selected" : ""}`} style={{ transform: `translate(-50%, -50%) translate(${mx}px, ${my}px)` }} aria-hidden="true">
                  {tag ? <span className="pg-edge-tag">{tag}</span> : null}
                  {unexplained ? <span className="pg-dot" /> : null}
                  {selected && data?.bendable ? (
                     <span
                        className="pg-bend"
                        title="Drag to bend this connection"
                        onPointerDown={(event) => {
                           event.stopPropagation();
                           (event.target as HTMLElement).setPointerCapture(event.pointerId);
                           dragging.current = true;
                        }}
                        onPointerMove={(event) => dragging.current && move(event, false)}
                        onPointerUp={(event) => {
                           if (!dragging.current) return;
                           dragging.current = false;
                           move(event, true);
                        }}
                     />
                  ) : null}
               </div>
            </EdgeLabelRenderer>
         ) : null}
      </>
   );
}

export const CurvedEdge = memo(CurvedEdgeView);
