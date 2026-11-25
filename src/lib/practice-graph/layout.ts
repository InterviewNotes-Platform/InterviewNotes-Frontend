/**
 * Where things are drawn. A component placed on the canvas has a stored frame; one added through the Outline (or restored) has none
 * and gets a deterministic automatic slot (`P9-C-GRF-05`): a grid scanned row by row, skipping slots that overlap a placed component,
 * filled in ID order (ULIDs sort by creation time, so a new component never moves an earlier one). Boundary frames are drawn around
 * their members and are not stored.
 */

import type { Frame } from "@/lib/practice-workspace/types";
import type { DiagramDraft } from "./model";
import { NODE_TYPE } from "./vocabulary";

const COLUMNS = 5;
const SLOT_W = 210;
const SLOT_H = 130;
const BOUNDARY_PAD = 28;

const overlaps = (a: Frame, b: Frame, gap = 16) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** A frame for every live component: the stored one, or its automatic slot. */
export function framesOf(draft: DiagramDraft): Map<string, Frame> {
   const frames = new Map<string, Frame>();
   const placed: Frame[] = [];
   for (const node of draft.graph.nodes) {
      const stored = draft.layout.nodes[node.id];
      if (stored) {
         frames.set(node.id, stored);
         placed.push(stored);
      }
   }
   const pending = draft.graph.nodes.filter((n) => !frames.has(n.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
   let slot = 0;
   for (const node of pending) {
      const size = NODE_TYPE[node.type];
      for (;;) {
         const frame = { x: (slot % COLUMNS) * SLOT_W, y: Math.floor(slot / COLUMNS) * SLOT_H, w: size.w, h: size.h };
         slot += 1;
         if (placed.every((p) => !overlaps(frame, p))) {
            frames.set(node.id, frame);
            placed.push(frame);
            break;
         }
      }
   }
   return frames;
}

/** The frame drawn for each boundary that has members: their union, padded. */
export function boundaryFrames(draft: DiagramDraft, frames: ReadonlyMap<string, Frame>): Map<string, Frame> {
   const out = new Map<string, Frame>();
   for (const boundary of draft.graph.boundaries) {
      const members = draft.graph.nodes.filter((n) => n.boundary === boundary.id).map((n) => frames.get(n.id)).filter((f): f is Frame => f !== undefined);
      if (members.length === 0) continue;
      const x = Math.min(...members.map((f) => f.x)) - BOUNDARY_PAD;
      const y = Math.min(...members.map((f) => f.y)) - BOUNDARY_PAD - 14;
      const right = Math.max(...members.map((f) => f.x + f.w)) + BOUNDARY_PAD;
      const bottom = Math.max(...members.map((f) => f.y + f.h)) + BOUNDARY_PAD;
      out.set(boundary.id, { x, y, w: right - x, h: bottom - y });
   }
   return out;
}

/** A free spot near `center` for a new component of this size: the first ring position that overlaps nothing. */
export function freeSpot(frames: Iterable<Frame>, center: { x: number; y: number }, size: { w: number; h: number }): { x: number; y: number } {
   const taken = [...frames];
   for (let i = 0; i < 120; i++) {
      const angle = i * 0.9;
      const r = i === 0 ? 0 : 40 + i * 12;
      const x = Math.round(center.x - size.w / 2 + Math.cos(angle) * r);
      const y = Math.round(center.y - size.h / 2 + Math.sin(angle) * r);
      if (taken.every((f) => !overlaps({ x, y, ...size }, f, 24))) return { x, y };
   }
   return { x: Math.round(center.x - size.w / 2), y: Math.round(center.y - size.h / 2) };
}
