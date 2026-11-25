/**
 * Saving a practice export to a file while it streams. Where the browser offers a save picker (File System Access), the
 * file is written chunk by chunk and an incomplete export is discarded (`abort`), so memory stays bounded. Elsewhere the
 * chunks are held until the export is known complete, and only a complete export is ever offered for download. That
 * in-memory fallback is capped at `MAX_BUFFERED_EXPORT_BYTES`: past it the stream is cancelled, what was held is released and
 * the outcome is `too_large` (never a partial download, never silently truncated records). Nothing is put in browser
 * storage; the object URL is revoked at once.
 */

import type { PracticeResult } from "./client";
import { ExportTooLarge, readExport, type ExportOutcome } from "./exportStream";

/**
 * The most an export may hold in memory where the browser cannot stream to a file (no File System Access: Firefox, Safari,
 * most phones). One attempt is far below 1 MiB (stage fields are at most 6,000 characters, a graph 64 KiB), so 32 MiB holds
 * many attempts while staying well inside what a phone's tab can keep along with the Blob copy made for the download. A
 * larger export stops as `too_large` and the learner is offered per-attempt export instead.
 */
export const MAX_BUFFERED_EXPORT_BYTES = 32 * 1024 * 1024;

type Writable = { write: (chunk: Uint8Array) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> };
type Picker = (options: { suggestedName: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ createWritable: () => Promise<Writable> }>;

export type SaveOutcome = ExportOutcome | { kind: "failed"; result: Exclude<PracticeResult<unknown>, { status: "ok" }> } | { kind: "cancelled" };

function picker(): Picker | null {
   const candidate = (globalThis as { showSaveFilePicker?: Picker }).showSaveFilePicker;
   return typeof candidate === "function" ? candidate.bind(globalThis) : null;
}

/** The download name: no learner text, only the date and, for one attempt, its opaque ID. */
export function exportFileName(attemptId?: string, now = new Date()): string {
   const day = now.toISOString().slice(0, 10);
   return attemptId ? `practice-attempt-${attemptId}-${day}.ndjson` : `practice-export-${day}.ndjson`;
}

function download(parts: Uint8Array[], name: string): void {
   const url = URL.createObjectURL(new Blob(parts as BlobPart[], { type: "application/x-ndjson" }));
   try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.rel = "noopener";
      anchor.click();
   } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
   }
}

/**
 * Opens the export with `open` and saves it as `name`. The picker (when there is one) is asked first, inside the
 * learner's click, so the browser allows it. Resolves to what really happened; never "complete" for a cut stream.
 */
export async function saveExport(open: () => Promise<PracticeResult<ReadableStream<Uint8Array>>>, name: string, signal?: AbortSignal, maxBufferedBytes = MAX_BUFFERED_EXPORT_BYTES): Promise<SaveOutcome> {
   const choose = picker();
   let file: Writable | null = null;
   if (choose) {
      try {
         file = await (await choose({ suggestedName: name, types: [{ description: "Practice export", accept: { "application/x-ndjson": [".ndjson"] } }] })).createWritable();
      } catch (error) {
         // The learner closed the picker: nothing happens. Any other refusal (policy, no gesture): the download below instead.
         if (error instanceof DOMException && error.name === "AbortError") return { kind: "cancelled" };
      }
   }
   const opened = await open();
   if (opened.status !== "ok") {
      await file?.abort().catch(() => undefined);
      return { kind: "failed", result: opened };
   }
   const parts: Uint8Array[] = [];
   let buffered = 0;
   const hold = (chunk: Uint8Array) => {
      buffered += chunk.byteLength;
      if (buffered > maxBufferedBytes) throw new ExportTooLarge();
      parts.push(chunk);
   };
   const outcome = await readExport(opened.data, (chunk) => (file ? file.write(chunk) : hold(chunk)), signal);
   if (outcome.kind !== "complete") {
      parts.length = 0; // release what was held: an incomplete export is never offered
      await file?.abort().catch(() => undefined);
      return outcome;
   }
   if (file) {
      try {
         await file.close();
      } catch {
         return { kind: "incomplete", reason: "write_failed" };
      }
   } else {
      download(parts, name);
   }
   return outcome;
}
