import "server-only";

import { cache } from "react";
import { after } from "next/server";

/**
 * P8 hot-path timing: one JSON line per rendered catalog page, written to the function log, so the time a page spends
 * waiting for catalog reads, in cache and in CPU can be separated from the transport floor. It observes only. It sends
 * nothing, adds no header, changes no cache option and reads no session.
 *
 * What it may write is an allowlist: a route label from a closed set, a read kind from a closed set, and numbers. It
 * never receives a slug, a URL, a query value, a token, a body or a user identifier, because `readKind` reduces a path
 * to its kind before anything is stored and the record has no field that could carry anything else.
 *
 * `HOTPATH_TIMING=off` turns it off without a deploy of code.
 */

export type HotpathRoute = "home" | "lesson" | "knowledge" | "problem" | "track";
type ItemKind = "knowledge" | "lesson" | "problem";
/** The closed set of read kinds a line may carry: a kind, never a path. */
export type ReadKind = "tracks" | "track" | "list" | "other" | `item:${ItemKind}` | `meta:${ItemKind}` | `related:${ItemKind}`;
/** `m`: no-store or revalidating read. `a`: `f` the answer is under two seconds old, `c` older (a Data Cache answer), `u` unknown. */
export interface ReadRecord {
   k: ReadKind;
   /** Start, ms after the request's first read. */
   s: number;
   /** Wall ms to the end of the body. */
   ms: number;
   /** Wall ms to the response headers, counted from the start of the read (so it includes `au`). */
   h: number;
   /** Wall ms spent reading the caller's session before the request left; 0 for a public read. */
   au: number;
   /** HTTP status, or 0 when the request failed. */
   st: number;
   m: "ns" | "rv";
   a: "f" | "c" | "u";
}

interface Store {
   t0: number;
   cpu0: NodeJS.CpuUsage;
   reads: ReadRecord[];
}

const MAX_READS = 16;
const FRESH_MS = 2000;
const ITEM_TYPES = new Set<string>(["knowledge", "lesson", "problem"]);

/** Whether timing is on. Read per call so a test, or an environment change, takes effect without a reload. */
export function hotpathEnabled(): boolean {
   return process.env.HOTPATH_TIMING !== "off";
}

/** A request path reduced to the kind of read it is. Anything unrecognised is `other`; no segment is ever kept. */
export function readKind(path: string): ReadKind {
   const [pathname] = path.split("?");
   const parts = pathname.split("/").filter(Boolean);
   if (parts[0] !== "catalog") return "other";
   if (parts[1] === "tracks") return parts.length === 2 ? "tracks" : parts.length === 3 ? "track" : "other";
   if (parts[1] !== "items") return "other";
   if (parts.length === 2) return "list";
   const type = ITEM_TYPES.has(parts[2]) ? (parts[2] as ItemKind) : null;
   if (!type || parts.length < 4) return "other";
   if (parts.length === 4) return `item:${type}`;
   if (parts.length === 5 && parts[4] === "meta") return `meta:${type}`;
   if (parts.length === 5 && parts[4] === "related") return `related:${type}`;
   return "other";
}

/** One store per server render, so the layout guard, the metadata and the page add to the same timeline. */
const store = cache((): Store => ({ t0: performance.now(), cpu0: process.cpuUsage(), reads: [] }));

/** The age of an answer by its `Date` header: a Data Cache entry keeps the header it was stored with. */
function ageOf(response: Response | null): ReadRecord["a"] {
   const date = response?.headers.get("date");
   if (!date) return "u";
   const stamp = Date.parse(date);
   if (Number.isNaN(stamp)) return "u";
   return Date.now() - stamp <= FRESH_MS ? "f" : "c";
}

export interface ReadTimer {
   /** Call once the session read, if the read has one, is finished. */
   session(): void;
   /** Call once the response headers have arrived (or the request failed, with null), with the cache option actually used. */
   headers(response: Response | null, mode: ReadRecord["m"]): void;
   /** Call once the body has been read, with the status that was acted on (0 when the request failed). */
   end(status: number): void;
}

const NOOP: ReadTimer = { session() {}, headers() {}, end() {} };

/** Time one catalog read, from before its session read to the end of its body. */
export function timeRead(path: string): ReadTimer {
   if (!hotpathEnabled()) return NOOP;
   // Observability must never change what a read returns: every step is guarded, and a failure is a lost measurement.
   try {
      const s = store();
      const start = performance.now();
      let au = 0;
      let h = 0;
      let m: ReadRecord["m"] = "ns";
      let a: ReadRecord["a"] = "u";
      let ended = false;
      return {
         session() {
            try {
               au = performance.now() - start;
            } catch {}
         },
         headers(response, mode) {
            try {
               h = performance.now() - start;
               m = mode;
               a = ageOf(response);
            } catch {}
         },
         end(status) {
            try {
               if (ended) return;
               ended = true;
               if (s.reads.length >= MAX_READS) return;
               const now = performance.now();
               s.reads.push({ k: readKind(path), s: round(start - s.t0), ms: round(now - start), h: round(h || now - start), au: round(au), st: status, m, a });
            } catch {}
         },
      };
   } catch {
      return NOOP;
   }
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Sequential waves in a read timeline: reads that overlap are one wave, a read that starts after the others end is the next. */
export function waveCount(reads: Pick<ReadRecord, "s" | "ms">[]): number {
   const sorted = [...reads].sort((a, b) => a.s - b.s);
   let waves = 0;
   let end = Number.NEGATIVE_INFINITY;
   for (const read of sorted) {
      if (read.s >= end - 1) waves += 1;
      end = Math.max(end, read.s + read.ms);
   }
   return waves;
}

export interface RenderLine {
   hp: 1;
   route: HotpathRoute;
   /** Wall ms from the first read to the end of the response. */
   wall: number;
   /** Process CPU ms (user + system) over the same interval; other requests on the same instance add to it. */
   cpu: number;
   waves: number;
   reads: ReadRecord[];
}

/** Build the line for a finished render. Pure, so a test can hold it to its allowlist. */
export function renderLine(route: HotpathRoute, s: Pick<Store, "t0" | "cpu0" | "reads">, now: number, cpu: NodeJS.CpuUsage): RenderLine {
   return {
      hp: 1,
      route,
      wall: round(now - s.t0),
      cpu: round((cpu.user + cpu.system) / 1000),
      waves: waveCount(s.reads),
      reads: s.reads,
   };
}

/**
 * Write the line for this render once its response has finished, so the wall and CPU cover the whole render and the
 * stream, not only the reads. A failure to schedule or write is a lost measurement and nothing else.
 */
export function reportRender(route: HotpathRoute): void {
   if (!hotpathEnabled()) return;
   const s = store();
   try {
      after(() => {
         try {
            console.log(JSON.stringify(renderLine(route, s, performance.now(), process.cpuUsage(s.cpu0))));
         } catch {
            // Observability must never affect the response.
         }
      });
   } catch {
      // `after` is unavailable outside a request.
   }
}

export type LateRead = "tracks" | "free";

export interface HomeLateLine {
   hp: 1;
   route: "home";
   /** `late`: the page rendered without these reads; `settled`: they have since answered, `ms` after the request began. */
   ev: "late" | "settled";
   late: LateRead[];
   ms: number;
}

/**
 * The homepage rendered a read as pending. Writes that fact now and, once the read has answered (which `after` keeps the
 * request alive for), how long it took. Names only the closed set of reads; it is the diagnostic state the page keeps.
 */
export function reportHomeLate(late: LateRead[], settled: Promise<unknown>): void {
   if (!hotpathEnabled()) {
      try {
         after(() => settled.then(() => undefined));
      } catch {
         // `after` is unavailable outside a request.
      }
      return;
   }
   const s = store();
   const line = (ev: HomeLateLine["ev"]): HomeLateLine => ({ hp: 1, route: "home", ev, late, ms: round(performance.now() - s.t0) });
   try {
      console.log(JSON.stringify(line("late")));
      after(async () => {
         await settled;
         console.log(JSON.stringify(line("settled")));
      });
   } catch {
      // Observability must never affect the response.
   }
}
