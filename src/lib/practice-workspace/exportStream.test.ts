import { describe, expect, it } from "vitest";
import { EXPORT_RECORD_TYPES, readExport } from "./exportStream";

const zero = () => Object.fromEntries(EXPORT_RECORD_TYPES.map((type) => [type, 0]));
const counts = (over: Record<string, number> = {}) => ({ ...zero(), ...over });
const line = (type: string, data: unknown) => `${JSON.stringify({ type, data })}\n`;
const header = (c = counts({ attempt: 1, event: 2 }), version = 1) => line("header", { format_version: version, exported_at: "2026-11-25T00:00:00Z", counts: c });
const body = line("attempt", { id: "a" }) + line("event", { id: "e1" }) + line("event", { id: "e2" });
const trailer = (c = counts({ attempt: 1, event: 2 })) => line("trailer", { counts: c });

/** A stream of `text` cut into `size`-byte chunks, so lines arrive split across reads. */
function streamOf(text: string, size = 7): ReadableStream<Uint8Array> {
   const bytes = new TextEncoder().encode(text);
   let at = 0;
   return new ReadableStream({
      pull(controller) {
         if (at >= bytes.length) return controller.close();
         controller.enqueue(bytes.slice(at, at + size));
         at += size;
      },
   });
}

async function run(text: string, size?: number) {
   const written: Uint8Array[] = [];
   const outcome = await readExport(streamOf(text, size), (chunk) => void written.push(chunk));
   return { outcome, bytes: written.reduce((n, c) => n + c.length, 0) };
}

describe("practice export validation", () => {
   it("accepts a complete export and passes every byte through, whatever the chunking", async () => {
      const text = header() + body + trailer();
      for (const size of [1, 7, 4096]) {
         const { outcome, bytes } = await run(text, size);
         expect(outcome).toEqual({ kind: "complete", counts: counts({ attempt: 1, event: 2 }) });
         expect(bytes).toBe(new TextEncoder().encode(text).length);
      }
   });

   it("reports a stream cut before the trailer as incomplete", async () => {
      expect((await run(header() + body)).outcome).toEqual({ kind: "incomplete", reason: "no_trailer" });
      expect((await run(header() + body + trailer().slice(0, 20))).outcome).toEqual({ kind: "incomplete", reason: "malformed_line" });
   });

   it("refuses a trailer whose counts differ from the header or the lines seen", async () => {
      expect((await run(header() + body + trailer(counts({ attempt: 1, event: 3 })))).outcome).toEqual({ kind: "incomplete", reason: "count_mismatch" });
      const short = header(counts({ attempt: 1, event: 3 })) + body + trailer(counts({ attempt: 1, event: 3 }));
      expect((await run(short)).outcome).toEqual({ kind: "incomplete", reason: "count_mismatch" });
      const extra = header(counts({ attempt: 1, event: 1 })) + body;
      expect((await run(extra)).outcome).toEqual({ kind: "incomplete", reason: "count_mismatch" });
   });

   it("needs a supported header first and the frozen record order", async () => {
      expect((await run(body + trailer())).outcome).toEqual({ kind: "incomplete", reason: "no_header" });
      expect((await run(header(undefined, 2) + body + trailer())).outcome).toEqual({ kind: "incomplete", reason: "unsupported_version" });
      expect((await run(header() + line("event", { id: "e" }) + line("attempt", { id: "a" }))).outcome).toEqual({ kind: "incomplete", reason: "out_of_order" });
      expect((await run(header() + line("secret", {}))).outcome).toEqual({ kind: "incomplete", reason: "unknown_type" });
      expect((await run(header() + body + trailer() + line("attempt", {}))).outcome).toEqual({ kind: "incomplete", reason: "after_trailer" });
      expect((await run(header(counts({ attempt: 1, event: 2, extra: 1 } as never)) + body + trailer())).outcome).toEqual({ kind: "incomplete", reason: "malformed_line" });
      expect((await run("")).outcome).toEqual({ kind: "incomplete", reason: "no_header" });
   });

   it("reports a failed read, a failed write and an abort as incomplete", async () => {
      const failing = new ReadableStream<Uint8Array>({
         start(controller) {
            controller.enqueue(new TextEncoder().encode(header()));
            controller.error(new Error("network"));
         },
      });
      expect(await readExport(failing, () => undefined)).toEqual({ kind: "incomplete", reason: "read_failed" });
      const refused = await readExport(streamOf(header() + body + trailer()), () => {
         throw new Error("disk full");
      });
      expect(refused).toEqual({ kind: "incomplete", reason: "write_failed" });
      const controller = new AbortController();
      controller.abort();
      expect(await readExport(streamOf(header() + body + trailer()), () => undefined, controller.signal)).toEqual({ kind: "incomplete", reason: "aborted" });
   });
});
