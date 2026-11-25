"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { NodeType } from "@/lib/practice-workspace/types";
import type { DNode } from "@/lib/practice-graph/model";
import { NODE_TYPE } from "@/lib/practice-graph/vocabulary";

export type ShapeData = { node: DNode; name: string; unnamed: boolean; unexplained: boolean; markers: boolean; connectable: boolean };
export type ShapeFlowNode = Node<ShapeData, "shape">;
export type BoundaryData = { name: string; kind: string };
export type BoundaryFlowNode = Node<BoundaryData, "boundary">;

const STROKE = { fill: "var(--pg-shape-fill)", stroke: "var(--pg-shape-stroke)", strokeWidth: 1.5 } as const;
const GLYPH = { fill: "none", stroke: "var(--pg-glyph)", strokeWidth: 1.5, strokeLinecap: "round" } as const;

/** One silhouette per type, so types stay distinguishable without colour (`P9-AC-14.2`). Drawn from geometry only. */
export function Silhouette({ type, w, h }: { type: NodeType; w: number; h: number }) {
   switch (type) {
      case "client":
         return (
            <>
               <rect x={1} y={1} width={w - 2} height={h - 2} rx={14} {...STROKE} />
               <rect x={11} y={h / 2 - 9} width={11} height={18} rx={2} {...GLYPH} />
            </>
         );
      case "service":
         return <rect x={1} y={1} width={w - 2} height={h - 2} rx={4} {...STROKE} />;
      case "gateway":
         return (
            <>
               <rect x={1} y={1} width={w - 2} height={h - 2} rx={4} {...STROKE} />
               <path d={`M9 6 V${h - 6}`} stroke="var(--pg-glyph)" strokeWidth={3} strokeLinecap="round" />
            </>
         );
      case "database":
         return (
            <>
               <path d={`M1 10 V${h - 10} A${w / 2 - 1} 9 0 0 0 ${w - 1} ${h - 10} V10`} {...STROKE} />
               <ellipse cx={w / 2} cy={10} rx={w / 2 - 1} ry={9} {...STROKE} />
            </>
         );
      case "cache":
         return (
            <>
               <path d={`M1 10 V${h - 10} A${w / 2 - 1} 9 0 0 0 ${w - 1} ${h - 10} V10`} {...STROKE} />
               <ellipse cx={w / 2} cy={10} rx={w / 2 - 1} ry={9} {...STROKE} />
               <path d={`M15 ${h / 2 - 8} L10 ${h / 2 + 1} H15 L12 ${h / 2 + 9}`} {...GLYPH} strokeLinejoin="round" />
            </>
         );
      case "queue":
         return (
            <>
               <path d={`M14 1 H${w - 14} A13 ${h / 2 - 1} 0 0 1 ${w - 14} ${h - 1} H14 A13 ${h / 2 - 1} 0 0 1 14 1 Z`} {...STROKE} />
               <ellipse cx={w - 14} cy={h / 2} rx={12} ry={h / 2 - 1} fill="none" stroke="var(--pg-shape-stroke)" strokeWidth={1.5} />
            </>
         );
      case "object_store":
         return (
            <>
               <path d={`M2 9 L12 ${h - 2} H${w - 12} L${w - 2} 9`} {...STROKE} />
               <ellipse cx={w / 2} cy={9} rx={w / 2 - 2} ry={7} {...STROKE} />
            </>
         );
      case "model": {
         const q = w / 4;
         return <path d={`M${q} 1 H${w - q} L${w - 1} ${h / 2} L${w - q} ${h - 1} H${q} L1 ${h / 2} Z`} {...STROKE} />;
      }
      case "worker":
         return (
            <>
               <rect x={1} y={1} width={w - 2} height={h - 2} rx={4} {...STROKE} />
               <circle cx={17} cy={h / 2} r={5} {...GLYPH} />
               {[0, 60, 120, 180, 240, 300].map((deg) => {
                  const r = (deg * Math.PI) / 180;
                  return <path key={deg} d={`M${17 + Math.cos(r) * 6} ${h / 2 + Math.sin(r) * 6} L${17 + Math.cos(r) * 9} ${h / 2 + Math.sin(r) * 9}`} {...GLYPH} />;
               })}
            </>
         );
      case "external":
         return <rect x={1} y={1} width={w - 2} height={h - 2} rx={4} {...STROKE} strokeDasharray="6 4" />;
   }
}

const GLYPH_TYPES: ReadonlySet<NodeType> = new Set(["client", "gateway", "cache", "worker"]);

/**
 * A component on the canvas: its silhouette and its name, nothing else (`P9-AC-13.6`). The type is not printed (Design D); it is in the
 * accessible name and the Inspector. Text is a React text node only.
 */
function ShapeNodeView({ data, selected }: NodeProps<ShapeFlowNode>) {
   const { node, name, unnamed, unexplained, markers, connectable } = data;
   const size = NODE_TYPE[node.type];
   return (
      <div className={`pg-shape${selected ? " is-selected" : ""}${GLYPH_TYPES.has(node.type) ? " has-glyph" : ""}${connectable ? "" : " is-static"}`} style={{ width: size.w, height: size.h }}>
         <svg className="pg-shape-svg" width={size.w} height={size.h} aria-hidden="true" focusable="false">
            <Silhouette type={node.type} w={size.w} h={size.h} />
         </svg>
         <span className={`pg-shape-label${unnamed ? " is-unnamed" : ""}`}>{name}</span>
         {markers && unexplained ? <span className="pg-dot pg-shape-dot" aria-hidden="true" /> : null}
         {/* Edges anchor to these, so they always exist; on a phone or a read-only attempt they cannot start a connection. */}
         <Handle type="source" position={Position.Top} id="t" isConnectable={connectable} />
         <Handle type="source" position={Position.Right} id="r" isConnectable={connectable} />
         <Handle type="source" position={Position.Bottom} id="b" isConnectable={connectable} />
         <Handle type="source" position={Position.Left} id="l" isConnectable={connectable} />
      </div>
   );
}

export const ShapeNode = memo(ShapeNodeView);

/** A boundary: a dashed frame around its members with its name in the corner. */
function BoundaryNodeView({ data, selected, width, height }: NodeProps<BoundaryFlowNode>) {
   return (
      <div className={`pg-boundary${selected ? " is-selected" : ""}`} style={{ width, height }}>
         <span className="pg-boundary-label">
            {data.name} <span className="pg-boundary-kind">· {data.kind}</span>
         </span>
      </div>
   );
}

export const BoundaryNode = memo(BoundaryNodeView);
