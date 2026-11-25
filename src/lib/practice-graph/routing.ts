/**
 * The bounded curved-edge router validated in P9-T03 (not a routing engine). Each connection is one cubic Bezier chosen from a fixed
 * candidate list (direct, two elbows, four arc families with bounded bulge, then S-curves through bounded waypoints); a candidate is
 * tested by exact segment-rectangle clipping against the other shapes. The shortest clear one wins; if none is clear within the
 * bounds, the one with fewest hits is used and flagged `clear: false`. Universal obstacle avoidance is not claimed: the learner's own
 * bend point (a layout waypoint, `routeVia`) is the fallback. Incremental, with a per-update time budget (T03: 8 ms).
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type Pt = { x: number; y: number };
export type RouteEdge = { id: string; source: string; target: string };
export type Route = {
   d: string;
   mid: Pt;
   clear: boolean;
   hits: number;
   family: string;
   candidates: number;
   stale?: boolean; // kept from an earlier update because the frame budget ran out; never "clear"
};
type Side = "L" | "R" | "T" | "B";
type Cubic = [Pt, Pt, Pt, Pt];

export const MARGIN = 10;
const SEGMENTS = 24;
const ARC_STEPS = 10;
const ARC_START = 36;
const ARC_STEP = 36;
const TWIN_BEND = 14;
const TWIN_ANCHOR = 8;
const TWIN_ARC_EXTRA = 30;

const OUT: Record<Side, Pt> = { L: { x: -1, y: 0 }, R: { x: 1, y: 0 }, T: { x: 0, y: -1 }, B: { x: 0, y: 1 } };

function sidePoint(r: Rect, s: Side): Pt {
   switch (s) {
      case "L":
         return { x: r.x, y: r.y + r.h / 2 };
      case "R":
         return { x: r.x + r.w, y: r.y + r.h / 2 };
      case "T":
         return { x: r.x + r.w / 2, y: r.y };
      case "B":
         return { x: r.x + r.w / 2, y: r.y + r.h };
   }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function cubic(a: Rect, sa: Side, b: Rect, sb: Side, extraA: number, extraB: number, bend: Pt, shift: Pt): Cubic {
   const s0 = sidePoint(a, sa);
   const s3 = sidePoint(b, sb);
   // A reverse pair shifts its anchors along the side so the two arrows never share an end.
   const along = (s: Side, p: Pt): Pt => (s === "L" || s === "R" ? { x: p.x, y: p.y + shift.y } : { x: p.x + shift.x, y: p.y });
   const p0 = along(sa, s0);
   const p3 = along(sb, s3);
   const len = Math.hypot(p3.x - p0.x, p3.y - p0.y);
   const d = clamp(len * 0.42, 28, 150);
   const oa = OUT[sa];
   const ob = OUT[sb];
   return [
      p0,
      { x: p0.x + oa.x * (d + extraA) + bend.x, y: p0.y + oa.y * (d + extraA) + bend.y },
      { x: p3.x + ob.x * (d + extraB) + bend.x, y: p3.y + ob.y * (d + extraB) + bend.y },
      p3,
   ];
}

function at(c: Cubic, t: number): Pt {
   const u = 1 - t;
   const a = u * u * u;
   const b = 3 * u * u * t;
   const d = 3 * u * t * t;
   const e = t * t * t;
   return { x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x, y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y };
}

function flatten(c: Cubic): Pt[] {
   const pts: Pt[] = [];
   for (let i = 0; i <= SEGMENTS; i++) pts.push(at(c, i / SEGMENTS));
   return pts;
}

function bbox(c: Cubic, pad: number): Rect {
   const xs = c.map((p) => p.x);
   const ys = c.map((p) => p.y);
   const x = Math.min(...xs) - pad;
   const y = Math.min(...ys) - pad;
   return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}

export function intersects(a: Rect, b: Rect): boolean {
   return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function inflate(r: Rect, m: number): Rect {
   return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
}

// Liang-Barsky: does segment p-q intersect rectangle r?
function segHitsRect(p: Pt, q: Pt, r: Rect): boolean {
   let t0 = 0;
   let t1 = 1;
   const dx = q.x - p.x;
   const dy = q.y - p.y;
   const checks: Array<[number, number]> = [
      [-dx, p.x - r.x],
      [dx, r.x + r.w - p.x],
      [-dy, p.y - r.y],
      [dy, r.y + r.h - p.y],
   ];
   for (const [pp, qq] of checks) {
      if (pp === 0) {
         if (qq < 0) return false;
      } else {
         const t = qq / pp;
         if (pp < 0) {
            if (t > t1) return false;
            if (t > t0) t0 = t;
         } else {
            if (t < t0) return false;
            if (t < t1) t1 = t;
         }
      }
   }
   return t0 <= t1;
}

function pathLength(pts: Pt[]): number {
   let l = 0;
   for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
   return l;
}

type Eval = { c: Cubic[]; hits: number; len: number; family: string; box: Rect; pts: Pt[] };

function evaluate(cs: Cubic[], family: string, obstacles: Rect[], ends: Rect[]): Eval {
   const box = cs.map((c) => bbox(c, MARGIN)).reduce((u, b) => union(u, b));
   const pts = cs.flatMap((c, i) => (i ? flatten(c).slice(1) : flatten(c)));
   let hits = 0;
   for (const o of obstacles) {
      if (!intersects(o, box)) continue;
      const r = inflate(o, MARGIN);
      for (let i = 1; i < pts.length; i++) {
         if (segHitsRect(pts[i - 1], pts[i], r)) {
            hits++;
            break;
         }
      }
   }
   // Penalise a curve that loops back through its own endpoint shapes.
   for (const e of ends) {
      const r = inflate(e, -3);
      for (let i = 2; i < pts.length - 1; i++) {
         const m = { x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2 };
         if (m.x > r.x && m.x < r.x + r.w && m.y > r.y && m.y < r.y + r.h) {
            hits++;
            break;
         }
      }
   }
   return { c: cs, hits, len: pathLength(pts), family, box, pts };
}

function facing(r: Rect, w: Pt): Side {
   const cx = r.x + r.w / 2;
   const cy = r.y + r.h / 2;
   return Math.abs(w.x - cx) / (r.w / 2) >= Math.abs(w.y - cy) / (r.h / 2) ? (w.x >= cx ? "R" : "L") : w.y >= cy ? "B" : "T";
}

// Two cubics joined smoothly at a waypoint: an S-curve that can pass between shapes.
function via(a: Rect, b: Rect, w: Pt, dir: Pt): Cubic[] {
   const sa = facing(a, w);
   const sb = facing(b, w);
   const p0 = sidePoint(a, sa);
   const p3 = sidePoint(b, sb);
   const l1 = Math.hypot(w.x - p0.x, w.y - p0.y);
   const l2 = Math.hypot(p3.x - w.x, p3.y - w.y);
   const d1 = clamp(l1 * 0.42, 24, 120);
   const d2 = clamp(l2 * 0.42, 24, 120);
   const t = 0.4 * Math.min(l1, l2);
   const oa = OUT[sa];
   const ob = OUT[sb];
   return [
      [p0, { x: p0.x + oa.x * d1, y: p0.y + oa.y * d1 }, { x: w.x - dir.x * t, y: w.y - dir.y * t }, w],
      [w, { x: w.x + dir.x * t, y: w.y + dir.y * t }, { x: p3.x + ob.x * d2, y: p3.y + ob.y * d2 }, p3],
   ];
}

const VIA_OFFSETS = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6];
const VIA_STEP = 45;

function union(a: Rect | null, b: Rect): Rect {
   if (!a) return b;
   const x = Math.min(a.x, b.x);
   const y = Math.min(a.y, b.y);
   return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

const f = (n: number) => Math.round(n * 10) / 10;

export function routeOne(
   a: Rect,
   b: Rect,
   all: Rect[],
   twin: -1 | 0 | 1, // -1: no reverse edge; 0 and 1: the two members of a reverse pair
   // Obstacles are passed in already excluding a and b.
): { route: Route; relevance: Rect } {
   const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
   const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
   const dx = cb.x - ca.x;
   const dy = cb.y - ca.y;
   const gapX = Math.abs(dx) - (a.w + b.w) / 2;
   const gapY = Math.abs(dy) - (a.h + b.h) / 2;
   const hA: Side = dx >= 0 ? "R" : "L";
   const hB: Side = dx >= 0 ? "L" : "R";
   const vA: Side = dy >= 0 ? "B" : "T";
   const vB: Side = dy >= 0 ? "T" : "B";
   const len = Math.hypot(dx, dy) || 1;
   const perp = { x: -dy / len, y: dx / len };
   const bend = twin >= 0 ? { x: perp.x * TWIN_BEND, y: perp.y * TWIN_BEND } : { x: 0, y: 0 };
   const shift = twin >= 0 ? { x: Math.sign(perp.x) * TWIN_ANCHOR, y: Math.sign(perp.y) * TWIN_ANCHOR } : { x: 0, y: 0 };
   const ends = [a, b];
   let relevance: Rect | null = null;
   let evaluated = 0;
   const consider = (c: Cubic | Cubic[], family: string) => {
      const e = evaluate(Array.isArray(c[0]) ? (c as Cubic[]) : [c as Cubic], family, all, ends);
      relevance = union(relevance, e.box);
      evaluated++;
      return e;
   };

   const direct = gapX >= gapY ? consider(cubic(a, hA, b, hB, 0, 0, bend, shift), "direct") : consider(cubic(a, vA, b, vB, 0, 0, bend, shift), "direct");
   let best: Eval = direct;
   if (direct.hits > 0) {
      const pool: Eval[] = [direct];
      pool.push(consider(cubic(a, hA, b, vB, 0, 0, bend, shift), "elbow-hv"));
      pool.push(consider(cubic(a, vA, b, hB, 0, 0, bend, shift), "elbow-vh"));
      // Twins prefer the opposite family first and start with a larger bulge.
      const families: Array<[string, Side]> = twin === 1
         ? [["under", "B"], ["over", "T"], ["right", "R"], ["left", "L"]]
         : [["over", "T"], ["under", "B"], ["left", "L"], ["right", "R"]];
      for (const [name, side] of families) {
         for (let k = 0; k < ARC_STEPS; k++) {
            const bulge = ARC_START + k * ARC_STEP + (twin === 1 ? TWIN_ARC_EXTRA : 0);
            // Push the far control point further so both ends clear the obstacle band.
            const e = consider(cubic(a, side, b, side, bulge, bulge, bend, shift), name);
            if (e.hits === 0) {
               pool.push(e);
               break;
            }
            if (k === ARC_STEPS - 1) pool.push(e);
         }
      }
      // Last resort before the fallback: S-curves through waypoints either side of the midpoint.
      if (!pool.some((e) => e.hits === 0)) {
         const mx = (ca.x + cb.x) / 2;
         const my = (ca.y + cb.y) / 2;
         const dir = { x: dx / len, y: dy / len };
         for (const k of VIA_OFFSETS) {
            const w = { x: mx + perp.x * k * VIA_STEP, y: my + perp.y * k * VIA_STEP };
            const e = consider(via(a, b, w, dir), "via");
            pool.push(e);
            if (e.hits === 0) break;
         }
      }
      const clear = pool.filter((e) => e.hits === 0);
      best = (clear.length ? clear : pool).sort((p, q) => p.hits - q.hits || p.len - q.len)[0];
   }
   const cs = best.c;
   const mid = cs.length === 1 ? at(cs[0], 0.5) : cs[0][3];
   return {
      route: {
         d:
            `M${f(cs[0][0].x)},${f(cs[0][0].y)}` +
            cs.map((c) => ` C${f(c[1].x)},${f(c[1].y)} ${f(c[2].x)},${f(c[2].y)} ${f(c[3].x)},${f(c[3].y)}`).join(""),
         mid: { x: f(mid.x), y: f(mid.y) },
         clear: best.hits === 0,
         hits: best.hits,
         family: best.family,
         candidates: evaluated,
      },
      relevance: relevance as unknown as Rect,
   };
}

/** A connection bent through the learner's own waypoint (a layout point): two cubics joined smoothly at it. Not checked for hits. */
export function routeVia(a: Rect, b: Rect, w: Pt): Route {
   const dx = b.x + b.w / 2 - (a.x + a.w / 2);
   const dy = b.y + b.h / 2 - (a.y + a.h / 2);
   const len = Math.hypot(dx, dy) || 1;
   const cs = via(a, b, w, { x: dx / len, y: dy / len });
   return {
      d: `M${f(cs[0][0].x)},${f(cs[0][0].y)}` + cs.map((c) => ` C${f(c[1].x)},${f(c[1].y)} ${f(c[2].x)},${f(c[2].y)} ${f(c[3].x)},${f(c[3].y)}`).join(""),
      mid: { x: f(w.x), y: f(w.y) },
      clear: true,
      hits: 0,
      family: "bend",
      candidates: 1,
   };
}

type CacheEntry = { key: string; route: Route; relevance: Rect; staleRoute?: Route };

const rk = (r: Rect) => `${r.x},${r.y},${r.w},${r.h}`;

export class Router {
   private cache = new Map<string, CacheEntry>();
   private prevRects = new Map<string, Rect>();
   private lastKey = "";
   private lastMap = new Map<string, Route>();
   private pending = new Set<string>();
   // Per-update budget. Edges whose endpoints moved are always recomputed (they must stay
   // attached). Other invalidated edges are recomputed while the budget lasts; the rest keep
   // their previous curve, are marked stale (never "clear"), and finish in later idle updates.
   budgetMs = 8;

   get pendingCount() {
      return this.pending.size;
   }

   update(geomKey: string, rects: Map<string, Rect>, edges: RouteEdge[]): Map<string, Route> {
      // Identical input (for example a StrictMode re-run) with nothing deferred: reuse everything.
      if (geomKey === this.lastKey && this.pending.size === 0) return this.lastMap;
      const t0 = performance.now();
      const changed: Rect[] = [];
      for (const [id, r] of rects) {
         const p = this.prevRects.get(id);
         if (!p || rk(p) !== rk(r)) {
            changed.push(r);
            if (p) changed.push(p);
         }
      }
      for (const [id, p] of this.prevRects) if (!rects.has(id)) changed.push(p);

      const pairs = new Set(edges.map((e) => `${e.source}>${e.target}`));
      const next = new Map<string, Route>();
      const all = [...rects.entries()];
      let identical = true;
      const nextPending = new Set<string>();
      const must: Array<[RouteEdge, string, Rect, Rect, -1 | 0 | 1]> = [];
      const maybe: Array<[RouteEdge, string, Rect, Rect, -1 | 0 | 1]> = [];
      for (const e of edges) {
         const a = rects.get(e.source);
         const b = rects.get(e.target);
         if (!a || !b) continue;
         const twin: -1 | 0 | 1 = !pairs.has(`${e.target}>${e.source}`) ? -1 : e.source > e.target ? 1 : 0;
         const key = `${rk(a)}|${rk(b)}|${twin}`;
         const c = this.cache.get(e.id);
         if (!c || c.key !== key) must.push([e, key, a, b, twin]);
         else if (this.pending.has(e.id) || changed.some((r) => intersects(r, c.relevance))) maybe.push([e, key, a, b, twin]);
         else {
            next.set(e.id, c.route);
            if (this.lastMap.get(e.id) !== c.route) identical = false;
         }
      }
      const compute = ([e, key, a, b, twin]: [RouteEdge, string, Rect, Rect, -1 | 0 | 1]) => {
         const obstacles = all.filter(([id]) => id !== e.source && id !== e.target).map(([, r]) => r);
         const { route, relevance } = routeOne(a, b, obstacles, twin);
         this.cache.set(e.id, { key, route, relevance });
         next.set(e.id, route);
         identical = false;
      };
      must.forEach(compute);
      for (const item of maybe) {
         if (performance.now() - t0 < this.budgetMs) compute(item);
         else {
            const c = this.cache.get(item[0].id)!;
            c.staleRoute ??= { ...c.route, clear: false, stale: true };
            next.set(item[0].id, c.staleRoute);
            nextPending.add(item[0].id);
            if (this.lastMap.get(item[0].id) !== c.staleRoute) identical = false;
         }
      }
      this.pending = nextPending;
      for (const id of this.cache.keys()) if (!next.has(id)) this.cache.delete(id);
      if (next.size !== this.lastMap.size) identical = false;
      this.prevRects = new Map(rects);
      this.lastKey = geomKey;
      if (!identical) this.lastMap = next;
      return this.lastMap;
   }
}
