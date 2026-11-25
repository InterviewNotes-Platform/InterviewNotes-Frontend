import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPracticeClient } from "@/lib/practice-workspace/client";
import { EXPORT_RECORD_TYPES } from "@/lib/practice-workspace/exportStream";
import { PRACTICE_DELETE_COPY, PRACTICE_EXPORT_COPY } from "@/lib/practice-terms";
import { PracticeDataControls } from "./PracticeDataControls";

const counts = (attempts: number) => ({ ...Object.fromEntries(EXPORT_RECORD_TYPES.map((t) => [t, 0])), attempt: attempts });
const line = (type: string, data: unknown) => `${JSON.stringify({ type, data })}\n`;
const COMPLETE = line("header", { format_version: 1, exported_at: "x", counts: counts(1) }) + line("attempt", { id: "a" }) + line("trailer", { counts: counts(1) });

type Answer = () => Response | Promise<Response>;

function setup(exportAnswer: Answer, deleteAnswer: Answer = () => new Response(null, { status: 204 })) {
   const controller = new AbortController();
   const requests: string[] = [];
   const fetchFake: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
      if (url.endsWith("/me/practice/export")) return exportAnswer();
      if (url.endsWith("/me/practice") && init?.method === "DELETE") return deleteAnswer();
      return new Response(JSON.stringify({ detail: "x", code: "not_found" }), { status: 404 });
   };
   const client = createPracticeClient({ baseUrl: "https://api.example.test", getAccessToken: async () => "token", fetch: fetchFake });
   const onDeletedAll = vi.fn();
   const view = render(<PracticeDataControls session={{ client, signal: controller.signal, owner: "ada" }} onDeletedAll={onDeletedAll} />);
   return { view, requests, controller, onDeletedAll };
}

const ndjson = (text: string) => new Response(text, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
let created: Blob[] = [];

beforeEach(() => {
   created = [];
   URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return "blob:fake";
   });
   URL.revokeObjectURL = vi.fn();
   HTMLAnchorElement.prototype.click = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("practice data export (T15)", () => {
   it("downloads a complete export and says it is complete", async () => {
      setup(() => ndjson(COMPLETE));
      fireEvent.click(screen.getByRole("button", { name: "Export all practice data" }));
      await screen.findByText(PRACTICE_EXPORT_COPY.complete);
      expect(created).toHaveLength(1);
      expect(await created[0].text()).toBe(COMPLETE);
   });

   it("never offers a cut stream as an export", async () => {
      setup(() => ndjson(COMPLETE.split("\n").slice(0, 2).join("\n") + "\n"));
      fireEvent.click(screen.getByRole("button", { name: "Export all practice data" }));
      await screen.findByText(PRACTICE_EXPORT_COPY.incomplete);
      expect(created).toHaveLength(0);
   });

   it("refuses a trailer whose counts differ from the header", async () => {
      const mismatch = line("header", { format_version: 1, exported_at: "x", counts: counts(2) }) + line("attempt", { id: "a" }) + line("trailer", { counts: counts(2) });
      setup(() => ndjson(mismatch));
      fireEvent.click(screen.getByRole("button", { name: "Export all practice data" }));
      await screen.findByText(PRACTICE_EXPORT_COPY.incomplete);
      expect(created).toHaveLength(0);
   });

   it("says the export did not start when the server refuses it", async () => {
      setup(() => new Response(JSON.stringify({ detail: "x", code: "internal_error" }), { status: 500 }));
      fireEvent.click(screen.getByRole("button", { name: "Export all practice data" }));
      await screen.findByText(PRACTICE_EXPORT_COPY.failed);
   });

   it("shows nothing for an export the session ended", async () => {
      let release: (value: Response) => void = () => undefined;
      const { controller } = setup(() => new Promise<Response>((resolve) => (release = resolve)));
      fireEvent.click(screen.getByRole("button", { name: "Export all practice data" }));
      await screen.findByText("Exporting…");
      controller.abort();
      release(ndjson(COMPLETE));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(created).toHaveLength(0);
      expect(screen.queryByText(PRACTICE_EXPORT_COPY.complete)).not.toBeInTheDocument();
   });
});

describe("delete all practice data (T15)", () => {
   it("deletes only after an explicit confirmation and the server's 204", async () => {
      const { requests, onDeletedAll } = setup(() => ndjson(COMPLETE));
      fireEvent.click(screen.getByRole("button", { name: PRACTICE_DELETE_COPY.all.confirm }));
      const dialog = await screen.findByRole("alertdialog");
      expect(dialog).toHaveTextContent(PRACTICE_DELETE_COPY.all.body);
      expect(requests.filter((r) => r.startsWith("DELETE"))).toHaveLength(0);
      fireEvent.click(screen.getAllByRole("button", { name: PRACTICE_DELETE_COPY.all.confirm }).at(-1)!);
      await screen.findByText(PRACTICE_DELETE_COPY.all.done);
      expect(onDeletedAll).toHaveBeenCalledTimes(1);
      expect(requests.filter((r) => r.startsWith("DELETE"))).toEqual(["DELETE /me/practice"]);
   });

   it("never shows a lost answer as deleted, and checks again on request", async () => {
      let attempt = 0;
      const { onDeletedAll } = setup(
         () => ndjson(COMPLETE),
         () => {
            attempt += 1;
            if (attempt === 1) throw new TypeError("offline");
            return new Response(null, { status: 204 });
         }
      );
      fireEvent.click(screen.getByRole("button", { name: PRACTICE_DELETE_COPY.all.confirm }));
      await screen.findByRole("alertdialog");
      fireEvent.click(screen.getAllByRole("button", { name: PRACTICE_DELETE_COPY.all.confirm }).at(-1)!);
      await screen.findByText(/We could not confirm the deletion/);
      expect(screen.queryByText(PRACTICE_DELETE_COPY.all.done)).not.toBeInTheDocument();
      expect(onDeletedAll).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Check again" }));
      await waitFor(() => expect(onDeletedAll).toHaveBeenCalledTimes(1));
      expect(screen.getByText(PRACTICE_DELETE_COPY.all.done)).toBeInTheDocument();
   });
});
