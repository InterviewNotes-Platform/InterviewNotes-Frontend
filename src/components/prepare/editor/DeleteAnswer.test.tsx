import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrepClient } from "@/lib/prep/client";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import type { Answer } from "@/lib/prep/types";
import { DeleteAnswer } from "./DeleteAnswer";

const API = "https://api.example.test";
const QUESTION = "Tell me about a time you were stuck.";

let api: ReturnType<typeof createFakePrepApi>;
let token: string | null;

beforeEach(() => {
   api = createFakePrepApi();
   token = api.signIn("user-1");
});

const client = () => createPrepClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });

async function seed(): Promise<Answer> {
   const result = await client().createAnswer({ source: "custom", question_snapshot: QUESTION, framework: "star" });
   if (result.status !== "ok") throw new Error("seed failed");
   api.requests.length = 0;
   return result.data;
}

function show(answer: Answer, props: Partial<React.ComponentProps<typeof DeleteAnswer>> = {}) {
   const onDeleted = vi.fn();
   render(<DeleteAnswer client={client()} answer={answer} onDeleted={onDeleted} {...props} />);
   return onDeleted;
}

const openDialog = () => fireEvent.click(screen.getByRole("button", { name: "Delete…" }));
const confirm = () => fireEvent.click(screen.getByRole("button", { name: /^(Delete answer|Try deleting again)$/ }));
const deletes = () => api.requests.filter(({ method }) => method === "DELETE");

describe("DeleteAnswer", () => {
   it("asks first, names the question, puts focus on Cancel and deletes nothing when cancelled", async () => {
      const onDeleted = show(await seed());
      openDialog();
      const dialog = await screen.findByRole("alertdialog");
      expect(dialog).toHaveTextContent("Delete this answer?");
      expect(dialog).toHaveTextContent(QUESTION);
      expect(dialog).toHaveTextContent("This cannot be undone");
      await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect(deletes()).toHaveLength(0);
      expect(onDeleted).not.toHaveBeenCalled();
   });

   it("sends one DELETE on confirm and reports deleted only from the API's answer", async () => {
      const answer = await seed();
      const onDeleted = show(answer);
      openDialog();
      await screen.findByRole("alertdialog");
      confirm();
      await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("deleted"));
      expect(deletes().map(({ path }) => path)).toEqual([`/answers/${answer.id}`]);
      expect((await client().getAnswer(answer.id)).status).toBe("notFound");
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
   });

   it("reports missing, not deleted, when the API says the answer is not there", async () => {
      const answer = await seed();
      await client().deleteAnswer(answer.id);
      const onDeleted = show(answer);
      openDialog();
      await screen.findByRole("alertdialog");
      confirm();
      await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("missing"));
   });

   it("keeps the dialog open and says nothing was deleted after a server error, then deletes on another try", async () => {
      const answer = await seed();
      const onDeleted = show(answer);
      openDialog();
      await screen.findByRole("alertdialog");
      api.failNext(500);
      confirm();
      expect(await screen.findByRole("alert")).toHaveTextContent("Nothing was deleted.");
      expect(onDeleted).not.toHaveBeenCalled();
      confirm();
      await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("deleted"));
   });

   it("says it cannot tell whether the answer was deleted after a lost reply, and shows nothing as deleted", async () => {
      const onDeleted = show(await seed());
      openDialog();
      await screen.findByRole("alertdialog");
      api.failNext("network");
      confirm();
      expect(await screen.findByRole("alert")).toHaveTextContent("We cannot tell whether it was deleted");
      expect(onDeleted).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Try deleting again" })).toBeInTheDocument();
   });

   it("sends the reader to sign in, returning to the same answer, when the session has ended", async () => {
      const answer = await seed();
      token = null;
      const onDeleted = show(answer);
      openDialog();
      await screen.findByRole("alertdialog");
      confirm();
      expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", `/login?redirect=${encodeURIComponent(`/prepare/answers/${answer.id}`)}`);
      expect(onDeleted).not.toHaveBeenCalled();
   });

});
