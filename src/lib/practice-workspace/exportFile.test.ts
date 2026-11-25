import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_BUFFERED_EXPORT_BYTES, saveExport } from "./exportFile";
import { EXPORT_RECORD_TYPES } from "./exportStream";

const counts = Object.fromEntries(EXPORT_RECORD_TYPES.map((t) => [t, 0]));
const COMPLETE = `${JSON.stringify({ type: "header", data: { format_version: 1, exported_at: "x", counts } })}\n${JSON.stringify({ type: "trailer", data: { counts } })}\n`;
const stream = (text: string) => new Response(text).body!;
const open = (text: string) => async () => ({ status: "ok" as const, data: stream(text) });

function writable() {
   return { written: [] as Uint8Array[], write: vi.fn(async function (this: { written: Uint8Array[] }, chunk: Uint8Array) { this.written.push(chunk); }), close: vi.fn(async () => undefined), abort: vi.fn(async () => undefined) };
}

beforeEach(() => {
   URL.createObjectURL = vi.fn(() => "blob:fake");
   URL.revokeObjectURL = vi.fn();
   HTMLAnchorElement.prototype.click = vi.fn();
});
afterEach(() => {
   delete (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker;
   vi.restoreAllMocks();
});

describe("saving a practice export", () => {
   it("streams into the chosen file and closes it only when the export is complete", async () => {
      const file = writable();
      (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn(async () => ({ createWritable: async () => file }));
      expect(await saveExport(open(COMPLETE), "x.ndjson")).toMatchObject({ kind: "complete" });
      expect(file.close).toHaveBeenCalledTimes(1);
      expect(file.abort).not.toHaveBeenCalled();
      expect(URL.createObjectURL).not.toHaveBeenCalled();
   });

   it("discards the chosen file when the stream is cut", async () => {
      const file = writable();
      (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn(async () => ({ createWritable: async () => file }));
      expect(await saveExport(open(COMPLETE.split("\n")[0] + "\n"), "x.ndjson")).toEqual({ kind: "incomplete", reason: "no_trailer" });
      expect(file.abort).toHaveBeenCalledTimes(1);
      expect(file.close).not.toHaveBeenCalled();
   });

   it("does nothing when the learner closes the picker, and falls back to a download when the picker is refused", async () => {
      (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn(async () => {
         throw new DOMException("closed", "AbortError");
      });
      const opener = vi.fn(open(COMPLETE));
      expect(await saveExport(opener, "x.ndjson")).toEqual({ kind: "cancelled" });
      expect(opener).not.toHaveBeenCalled();
      (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn(async () => {
         throw new DOMException("no gesture", "SecurityError");
      });
      expect(await saveExport(open(COMPLETE), "x.ndjson")).toMatchObject({ kind: "complete" });
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
   });

   it("offers no download for an incomplete export without a picker", async () => {
      expect(await saveExport(open("not json\n"), "x.ndjson")).toEqual({ kind: "incomplete", reason: "malformed_line" });
      expect(URL.createObjectURL).not.toHaveBeenCalled();
   });
});

describe("the in-memory export fallback is bounded (v2)", () => {
   const HEADER = `${JSON.stringify({ type: "header", data: { format_version: 1, exported_at: "x", counts: { ...counts, attempt: 3 } } })}\n`;
   const record = (n: number) => `${JSON.stringify({ type: "attempt", data: { id: `a${n}`, pad: "x".repeat(40) } })}\n`;
   const TRAILER = `${JSON.stringify({ type: "trailer", data: { counts: { ...counts, attempt: 3 } } })}\n`;
   const chunks = [HEADER, record(1), record(2), record(3), TRAILER];

   function chunked(parts: string[]) {
      const encoder = new TextEncoder();
      const state = { pulled: 0, cancelled: false };
      const body = new ReadableStream<Uint8Array>({
         pull(controller) {
            if (state.pulled === parts.length) return controller.close();
            controller.enqueue(encoder.encode(parts[state.pulled++]));
         },
         cancel() {
            state.cancelled = true;
         },
      });
      return { state, open: async () => ({ status: "ok" as const, data: body }) };
   }

   it("stops past the bound, cancels the stream and offers no partial file", async () => {
      const source = chunked(chunks);
      const limit = HEADER.length + record(1).length + 10; // room for the header and one record, not two
      expect(await saveExport(source.open, "x.ndjson", undefined, limit)).toEqual({ kind: "incomplete", reason: "too_large" });
      expect(source.state.cancelled).toBe(true);
      expect(source.state.pulled).toBeLessThan(chunks.length); // the rest was never read
      expect(URL.createObjectURL).not.toHaveBeenCalled(); // nothing truncated is ever offered as a download
   });

   it("still validates and downloads a complete export that fits", async () => {
      const source = chunked(chunks);
      expect(await saveExport(source.open, "x.ndjson", undefined, chunks.join("").length)).toEqual({ kind: "complete", counts: { ...counts, attempt: 3 } });
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
   });

   it("keeps validating within the bound: a count mismatch is incomplete, not too large", async () => {
      const source = chunked([HEADER, record(1), TRAILER]);
      expect(await saveExport(source.open, "x.ndjson")).toEqual({ kind: "incomplete", reason: "count_mismatch" });
      expect(URL.createObjectURL).not.toHaveBeenCalled();
   });

   it("does not bound the streaming path, which never holds the export in memory", async () => {
      const file = writable();
      (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn(async () => ({ createWritable: async () => file }));
      expect(await saveExport(chunked(chunks).open, "x.ndjson", undefined, 1)).toMatchObject({ kind: "complete" });
      expect(file.close).toHaveBeenCalledTimes(1);
   });

   it("uses a documented default bound of 32 MiB", () => {
      expect(MAX_BUFFERED_EXPORT_BYTES).toBe(32 * 1024 * 1024);
   });
});
