/**
 * Incremental validation of a practice export (`application/x-ndjson`, format version 1; spec §12, T12 matrix). Lines are
 * checked as they arrive and passed on to a sink unchanged; nothing is kept but the current partial line and the counts,
 * so memory stays bounded by the longest line. An export is complete only when a supported header came first, every
 * record type appeared in the frozen order, and a trailer closed it whose counts equal the header's and the lines seen.
 * Anything else is incomplete, whatever the HTTP status said: a stream cut short is never presented as a whole export.
 */

import manifest from "./m1-contract-manifest.json";

export const EXPORT_FORMAT_VERSION: number = manifest.export.format_version;
export const EXPORT_RECORD_TYPES: readonly string[] = manifest.export.record_types;
/** The longest line accepted; a stage field is at most 6,000 characters and a graph 64 KiB, so this is far above a real line. */
export const MAX_LINE_BYTES = 8 * 1024 * 1024;

export type Counts = Record<string, number>;
export type IncompleteReason =
   | "no_header"
   | "unsupported_version"
   | "malformed_line"
   | "unknown_type"
   | "out_of_order"
   | "line_too_long"
   | "no_trailer"
   | "count_mismatch"
   | "after_trailer"
   | "read_failed"
   | "write_failed"
   | "too_large"
   | "aborted";
/** Thrown by a sink that refuses to hold more; the read stops as `too_large` (the stream is cancelled, nothing is complete). */
export class ExportTooLarge extends Error {
   constructor() {
      super("The export is larger than this browser can hold in memory.");
      this.name = "ExportTooLarge";
   }
}

export type ExportOutcome = { kind: "complete"; counts: Counts } | { kind: "incomplete"; reason: IncompleteReason };

function countsOf(value: unknown): Counts | null {
   if (typeof value !== "object" || value === null) return null;
   const record = value as Record<string, unknown>;
   const keys = Object.keys(record).sort();
   if (keys.join() !== [...EXPORT_RECORD_TYPES].sort().join()) return null;
   return keys.every((key) => Number.isInteger(record[key]) && (record[key] as number) >= 0) ? (record as Counts) : null;
}

const same = (a: Counts, b: Counts) => EXPORT_RECORD_TYPES.every((type) => a[type] === b[type]);

/** A line-by-line checker; `line` returns a reason the export is not valid, or null to continue. */
export function createExportChecker() {
   let header: Counts | null = null;
   let trailer = false;
   let order = -1;
   const seen: Counts = Object.fromEntries(EXPORT_RECORD_TYPES.map((type) => [type, 0]));

   function line(text: string): IncompleteReason | null {
      if (text.trim() === "") return null;
      if (trailer) return "after_trailer";
      let parsed: unknown;
      try {
         parsed = JSON.parse(text);
      } catch {
         return "malformed_line";
      }
      if (typeof parsed !== "object" || parsed === null) return "malformed_line";
      const { type, data } = parsed as { type?: unknown; data?: unknown };
      if (typeof data !== "object" || data === null) return "malformed_line";
      if (header === null) {
         if (type !== "header") return "no_header";
         if ((data as { format_version?: unknown }).format_version !== EXPORT_FORMAT_VERSION) return "unsupported_version";
         header = countsOf((data as { counts?: unknown }).counts);
         return header ? null : "malformed_line";
      }
      if (type === "trailer") {
         const counts = countsOf((data as { counts?: unknown }).counts);
         if (!counts) return "malformed_line";
         if (!same(counts, header) || !same(counts, seen)) return "count_mismatch";
         trailer = true;
         return null;
      }
      const at = typeof type === "string" ? EXPORT_RECORD_TYPES.indexOf(type) : -1;
      if (at < 0) return "unknown_type";
      if (at < order) return "out_of_order";
      order = at;
      seen[type as string] += 1;
      return seen[type as string] > header[type as string] ? "count_mismatch" : null;
   }

   function end(): ExportOutcome {
      if (header === null) return { kind: "incomplete", reason: "no_header" };
      if (!trailer) return { kind: "incomplete", reason: "no_trailer" };
      return { kind: "complete", counts: { ...seen } };
   }

   return { line, end };
}

/**
 * Reads `stream` to its end, checking every line and handing each chunk to `write` as it arrives. Stops at the first
 * problem (cancelling the stream) and reports it; `signal` ends the read as `aborted`.
 */
export async function readExport(stream: ReadableStream<Uint8Array>, write: (chunk: Uint8Array) => Promise<void> | void, signal?: AbortSignal): Promise<ExportOutcome> {
   const reader = stream.getReader();
   const decoder = new TextDecoder();
   const checker = createExportChecker();
   let partial = "";
   const stop = async (reason: IncompleteReason): Promise<ExportOutcome> => {
      await reader.cancel().catch(() => undefined);
      return { kind: "incomplete", reason };
   };
   const onAbort = () => void reader.cancel().catch(() => undefined);
   signal?.addEventListener("abort", onAbort, { once: true });
   try {
      for (;;) {
         if (signal?.aborted) return await stop("aborted");
         let chunk: ReadableStreamReadResult<Uint8Array>;
         try {
            chunk = await reader.read();
         } catch {
            return { kind: "incomplete", reason: signal?.aborted ? "aborted" : "read_failed" };
         }
         if (signal?.aborted) return await stop("aborted");
         if (chunk.done) break;
         partial += decoder.decode(chunk.value, { stream: true });
         const lines = partial.split("\n");
         partial = lines.pop() ?? "";
         for (const text of lines) {
            const problem = checker.line(text);
            if (problem) return await stop(problem);
         }
         if (partial.length > MAX_LINE_BYTES) return await stop("line_too_long");
         try {
            await write(chunk.value);
         } catch (error) {
            return await stop(error instanceof ExportTooLarge ? "too_large" : "write_failed");
         }
      }
      partial += decoder.decode();
      const last = checker.line(partial);
      return last ? { kind: "incomplete", reason: last } : checker.end();
   } finally {
      signal?.removeEventListener("abort", onAbort);
   }
}
