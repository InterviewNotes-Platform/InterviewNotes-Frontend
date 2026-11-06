import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrepClient } from "@/lib/prep/client";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import type { Story } from "@/lib/prep/types";
import { StoryEditor } from "./StoryEditor";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

const API = "https://api.example.test";

let api: ReturnType<typeof createFakePrepApi>;
let token: string;

beforeEach(() => {
   nav.push.mockReset();
   api = createFakePrepApi();
   token = api.signIn("user-1");
});

const clientFor = (userToken: string, fetch: typeof globalThis.fetch = api.fetch) => createPrepClient({ baseUrl: API, getAccessToken: async () => userToken, fetch });

async function seed(userToken = token): Promise<Story> {
   const result = await clientFor(userToken).createStory({ title: "Migration", framework: "star", year: 2024, tags: ["leadership"], fields: { situation: "Old stack" } });
   if (result.status !== "ok") throw new Error("seed failed");
   api.requests.length = 0;
   return result.data;
}

function show(story: Story, fetch: typeof globalThis.fetch = api.fetch, userToken = token) {
   return render(<StoryEditor apiUrl={API} storyId={story.id} getAccessToken={async () => userToken} fetch={fetch} />);
}

const ready = () => screen.findByRole("button", { name: "Save changes" });
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
const patches = () => api.requests.filter(({ method }) => method === "PATCH");
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
const status = () => screen.getByText((_, element) => element?.getAttribute("data-slot") === "save-status" && element.textContent !== "");

/** Another browser context saves a change to the same story first. */
async function changeElsewhere(story: Story, patch: { title: string }) {
   const result = await clientFor(token).updateStory(story.id, { version: story.version, ...patch });
   expect(result.status).toBe("ok");
}

describe("opening a story", () => {
   it("shows the saved story with its link count", async () => {
      const story = await seed();
      show(story);
      await ready();
      expect(screen.getByLabelText(/^Title/)).toHaveValue("Migration");
      expect(screen.getByLabelText(/^Year/)).toHaveValue("2024");
      expect(screen.getByLabelText("Situation")).toHaveValue("Old stack");
      expect(screen.getByText("Not linked to an answer.")).toBeInTheDocument();
      expect(screen.getByRole("list", { name: "Tags on this story" })).toHaveTextContent("leadership");
   });

   it("reads another reader's story as not found, offering no form to edit or delete it", async () => {
      const theirs = await seed(api.signIn("user-2"));
      show(theirs);
      await screen.findByText(/We could not find this story in your Story Bank/);
      expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
      expect(screen.queryByText("Migration")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
      expect(api.requests.map(({ method }) => method)).toEqual(["GET"]);
   });

   it("shows a failed read as an error with a retry, and asks to sign in when the session ended", async () => {
      const story = await seed();
      api.failNext("network");
      const first = show(story);
      await screen.findByText("We could not reach the preparation service.");
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await ready();
      first.unmount();
      show(story, api.fetch, "expired-token");
      await screen.findByText(/Your session has ended/);
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", `/login?redirect=${encodeURIComponent(`/prepare/stories/${story.id}`)}`);
   });
});

describe("editing", () => {
   it("offers Save only once something changed, sends only what changed with the version read, and says Saved after the API answered", async () => {
      const story = await seed();
      show(story);
      await ready();
      expect(screen.getByRole("button", { name: "Save changes" })).toHaveAttribute("aria-disabled", "true");
      type("Title", "Cutover");
      expect(status()).toHaveTextContent("Unsaved changes");
      save();
      await waitFor(() => expect(status()).toHaveTextContent("Saved"));
      expect(patches()).toHaveLength(1);
      expect(patches()[0].body).toEqual({ version: 1, title: "Cutover" });
      expect(screen.getByLabelText(/^Title/)).toHaveValue("Cutover");
      type("Title", "Cutover 2");
      save();
      await waitFor(() => expect(patches()).toHaveLength(2));
      expect(patches()[1].body).toEqual({ version: 2, title: "Cutover 2" });
   });

   it("adds and removes tags, replacing the tag list as a whole", async () => {
      const story = await seed();
      show(story);
      await ready();
      const tags = screen.getByLabelText(/^Tags/, { selector: "input" });
      fireEvent.change(tags, { target: { value: "Data" } });
      fireEvent.keyDown(tags, { key: "Enter" });
      fireEvent.click(screen.getByRole("button", { name: "Remove tag leadership" }));
      save();
      await waitFor(() => expect(patches()).toHaveLength(1));
      expect(patches()[0].body).toEqual({ version: 1, tags: ["data"] });
   });

   it("keeps what was written and says Saving until the API answers", async () => {
      const story = await seed();
      let release: () => void = () => {};
      const slow = ((input: RequestInfo | URL, init?: RequestInit) =>
         init?.method === "PATCH" ? new Promise<Response>((resolve) => (release = () => void api.fetch(input, init).then(resolve))) : api.fetch(input, init)) as typeof globalThis.fetch;
      show(story, slow);
      await ready();
      type("Title", "Cutover");
      save();
      await waitFor(() => expect(status()).toHaveTextContent("Saving…"));
      expect(screen.queryByText("Saved")).not.toBeInTheDocument();
      expect(screen.getByLabelText(/^Title/)).toBeDisabled();
      await act(async () => release());
      await waitFor(() => expect(status()).toHaveTextContent("Saved"));
   });

   it("refuses an empty title and a bad year before sending", async () => {
      const story = await seed();
      show(story);
      await ready();
      type("Title", " ");
      type("Year", "12");
      save();
      expect(await screen.findByText("Enter a title.")).toBeInTheDocument();
      expect(screen.getByText(/Enter a year from 1900/)).toBeInTheDocument();
      expect(patches()).toHaveLength(0);
   });

   it("shows the server's refusal against the field, as not saved, with the text kept", async () => {
      const story = await seed();
      show(story);
      await ready();
      type("Task", "x".repeat(20001));
      save();
      expect(await screen.findByText("This is too long to save.")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Nothing was saved; your changes are still here.");
      expect(status()).toHaveTextContent("Couldn't save");
      expect(screen.queryByText("Saved")).not.toBeInTheDocument();
   });

   it("shows a server error as not saved, never as Saved, and a retry saves", async () => {
      const story = await seed();
      show(story);
      await ready();
      type("Title", "Cutover");
      api.failNext(500);
      save();
      await screen.findByText(/Nothing was saved; your changes are still here/);
      expect(status()).toHaveTextContent("Couldn't save");
      save();
      await waitFor(() => expect(status()).toHaveTextContent("Saved"));
   });

   it("after a save of unknown outcome, reads the story again and reports what it holds", async () => {
      const story = await seed();
      const lost = ((input: RequestInfo | URL, init?: RequestInit) =>
         init?.method === "PATCH" ? api.fetch(input, init).then(() => Promise.reject(new TypeError("connection lost"))) : api.fetch(input, init)) as typeof globalThis.fetch;
      show(story, lost);
      await ready();
      type("Title", "Cutover");
      save();
      await screen.findByText(/We could not confirm whether your changes were saved/);
      expect(status()).toHaveTextContent("Couldn't confirm the save");
      save();
      await act(async () => {});
      expect(patches()).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: "Check the saved story" }));
      await waitFor(() => expect(status()).toHaveTextContent("Saved"));
      expect(patches()).toHaveLength(1);
   });

   it("after a lost save that never reached the server, says so and keeps the text for another save", async () => {
      const story = await seed();
      show(story);
      await ready();
      type("Title", "Cutover");
      api.failNext("network");
      save();
      await screen.findByText(/We could not confirm whether your changes were saved/);
      fireEvent.click(screen.getByRole("button", { name: "Check the saved story" }));
      await screen.findByText(/The earlier save did not reach the server/);
      expect(screen.getByLabelText(/^Title/)).toHaveValue("Cutover");
      save();
      await waitFor(() => expect(status()).toHaveTextContent("Saved"));
   });

   it("says a story deleted elsewhere cannot be saved to, and keeps the text", async () => {
      const story = await seed();
      show(story);
      await ready();
      await clientFor(token).deleteStory(story.id);
      type("Title", "Cutover");
      save();
      await screen.findByText(/Your text is still here, but it cannot be saved to a story that is not in your Story Bank/);
      expect(screen.getByLabelText(/^Title/)).toHaveValue("Cutover");
   });

   it("asks to sign in again, with the text kept, when the session ends during a save", async () => {
      const story = await seed();
      let current = token;
      render(<StoryEditor apiUrl={API} storyId={story.id} getAccessToken={async () => current} fetch={api.fetch} />);
      await ready();
      type("Title", "Cutover");
      current = "expired-token";
      save();
      await screen.findByText(/Your session has ended/);
      expect(screen.getByLabelText(/^Title/)).toHaveValue("Cutover");
   });
});

describe("a newer version saved elsewhere", () => {
   async function conflict() {
      const story = await seed();
      show(story);
      await ready();
      await changeElsewhere(story, { title: "Server title" });
      type("Year", "2020");
      save();
      await screen.findByRole("group", { name: "Choose which version to keep" });
      expect(status()).toHaveTextContent("Not saved: a newer version exists");
      return story;
   }

   it("offers a choice and replaces nothing until it is made", async () => {
      await conflict();
      expect(screen.getByLabelText(/^Year/)).toHaveValue("2020");
      expect(screen.getByLabelText(/^Title/)).toHaveValue("Migration");
      expect(patches()).toHaveLength(2);
   });

   it("keeps mine: saves the reader's changes on the newer version", async () => {
      await conflict();
      fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
      await waitFor(() => expect(status()).toHaveTextContent("Saved"));
      expect(patches().at(-1)?.body).toEqual({ version: 2, year: 2020 });
      expect(screen.getByLabelText(/^Title/)).toHaveValue("Server title");
      expect(screen.getByLabelText(/^Year/)).toHaveValue("2020");
   });

   it("loads the server version: the reader's edits are replaced by what is saved", async () => {
      await conflict();
      fireEvent.click(screen.getByRole("button", { name: "Load server version" }));
      await waitFor(() => expect(screen.queryByRole("group", { name: "Choose which version to keep" })).not.toBeInTheDocument());
      expect(screen.getByLabelText(/^Title/)).toHaveValue("Server title");
      expect(screen.getByLabelText(/^Year/)).toHaveValue("2024");
      expect(patches()).toHaveLength(1 + 1);
   });
});

describe("duplicating", () => {
   it("creates an independent copy of what is saved and opens it", async () => {
      const story = await seed();
      show(story);
      await ready();
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      await waitFor(() => expect(nav.push).toHaveBeenCalledOnce());
      const copyId = nav.push.mock.calls[0][0].split("/").pop();
      expect(copyId).not.toBe(story.id);
      const listed = await clientFor(token).listStories();
      expect(listed.status === "ok" && listed.data.items.map(({ title }) => title)).toEqual(["Migration", "Migration"]);
   });

   it("is unavailable while there are unsaved changes, because a copy holds what is saved", async () => {
      const story = await seed();
      show(story);
      await ready();
      type("Title", "Cutover");
      expect(screen.getByText(/Save your changes before duplicating/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      await act(async () => {});
      expect(api.requests.filter(({ path }) => path.endsWith("/duplicate"))).toHaveLength(0);
   });

   it("says no copy was made after a server error, and does not allow another duplicate after an unknown outcome", async () => {
      const story = await seed();
      show(story);
      await ready();
      api.failNext(500);
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      await screen.findByText(/No copy was made/);
      api.failNext("network");
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      await screen.findByText(/We could not confirm that the copy was made/);
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      await act(async () => {});
      expect(api.requests.filter(({ path }) => path.endsWith("/duplicate"))).toHaveLength(2);
      expect(nav.push).not.toHaveBeenCalled();
   });
});

describe("deleting", () => {
   const open = async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Delete…" }));
      return screen.findByRole("alertdialog");
   };
   const deletes = () => api.requests.filter(({ method }) => method === "DELETE");

   it("asks first, names the story, and deletes nothing when cancelled", async () => {
      const story = await seed();
      show(story);
      const dialog = await open();
      expect(dialog).toHaveTextContent("“Migration” will be permanently deleted. This cannot be undone.");
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(deletes()).toHaveLength(0);
      expect(screen.getByLabelText(/^Title/)).toBeInTheDocument();
   });

   it("deletes only after confirmation and reports it from the API's answer", async () => {
      const story = await seed();
      show(story);
      fireEvent.click(within(await open()).getByRole("button", { name: "Delete story" }));
      await screen.findByRole("heading", { name: "Story deleted" });
      expect(screen.getByRole("status")).toHaveTextContent("The server confirmed that “Migration” was deleted.");
      expect(deletes()).toHaveLength(1);
      const listed = await clientFor(token).listStories();
      expect(listed.status === "ok" && listed.data.total).toBe(0);
   });

   it("tells the reader a linked story's answers stay", async () => {
      const story = await seed();
      const answer = await clientFor(token).createAnswer({ source: "custom", question_snapshot: "Q?", framework: "star" });
      if (answer.status !== "ok") throw new Error("seed failed");
      await clientFor(token).linkStory(answer.data.id, story.id);
      show(story);
      expect(await open()).toHaveTextContent("It is linked to 1 answer: the link is removed and the answers stay as they are.");
   });

   it("shows a failed delete as not deleted, keeps the story, and a retry deletes", async () => {
      const story = await seed();
      show(story);
      const dialog = await open();
      api.failNext(500);
      fireEvent.click(within(dialog).getByRole("button", { name: "Delete story" }));
      await within(dialog).findByText(/Nothing was deleted/);
      expect(screen.queryByRole("heading", { name: "Story deleted" })).not.toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "Try deleting again" }));
      await screen.findByRole("heading", { name: "Story deleted" });
   });

   it("does not claim a delete of unknown outcome", async () => {
      const story = await seed();
      show(story);
      const dialog = await open();
      api.failNext("network");
      fireEvent.click(within(dialog).getByRole("button", { name: "Delete story" }));
      await within(dialog).findByText(/We cannot tell whether it was deleted, so nothing is shown as deleted/);
      expect(screen.queryByRole("heading", { name: "Story deleted" })).not.toBeInTheDocument();
   });

   it("says the story was not found, and that this request deleted nothing, when it is gone already", async () => {
      const story = await seed();
      show(story);
      const dialog = await open();
      await clientFor(token).deleteStory(story.id);
      fireEvent.click(within(dialog).getByRole("button", { name: "Delete story" }));
      await screen.findByRole("heading", { name: "Story not found" });
      expect(screen.getByRole("status")).toHaveTextContent("this request deleted nothing");
   });

   it("makes the page inert behind the dialog and restores it on close", async () => {
      const story = await seed();
      const { container } = show(story);
      const dialog = await open();
      expect(container).toHaveAttribute("inert");
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(container).not.toHaveAttribute("inert"));
   });
});

describe("leaving the page with unsaved edits", () => {
   const confirm = vi.spyOn(window, "confirm");
   const back = () => screen.getByRole("link", { name: "Back to your Story Bank" });
   const PROMPT = "Your changes could not be saved. Leave anyway and lose them?";

   beforeEach(() => confirm.mockReset().mockReturnValue(false));
   afterEach(() => confirm.mockReset());

   it("lets a link through untouched when nothing is unsaved, and asks the browser to guard a tab close only while something is", async () => {
      const story = await seed();
      show(story);
      await ready();
      const clean = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(clean);
      expect(clean.defaultPrevented).toBe(false);
      fireEvent.click(back());
      await act(async () => {});
      expect(patches()).toHaveLength(0);
      expect(confirm).not.toHaveBeenCalled();

      type("Title", "Cutover");
      const dirty = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(dirty);
      expect(dirty.defaultPrevented).toBe(true);
   });

   it("saves first when a link is followed with unsaved edits, then leaves, without asking", async () => {
      const story = await seed();
      show(story);
      await ready();
      type("Title", "Cutover");
      fireEvent.click(back());
      await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/prepare/stories"));
      expect(patches()).toHaveLength(1);
      expect(patches()[0].body).toEqual({ version: 1, title: "Cutover" });
      expect(confirm).not.toHaveBeenCalled();
      const stored = await clientFor(token).getStory(story.id);
      expect(stored.status === "ok" && stored.data.title).toBe("Cutover");
   });

   it("waits for a save already in the air rather than sending a second", async () => {
      const story = await seed();
      let release: () => void = () => {};
      const slow = ((input: RequestInfo | URL, init?: RequestInit) =>
         init?.method === "PATCH" ? new Promise<Response>((resolve) => (release = () => void api.fetch(input, init).then(resolve))) : api.fetch(input, init)) as typeof globalThis.fetch;
      show(story, slow);
      await ready();
      type("Title", "Cutover");
      save();
      await waitFor(() => expect(status()).toHaveTextContent("Saving…"));
      fireEvent.click(back());
      await act(async () => {});
      expect(nav.push).not.toHaveBeenCalled();
      await act(async () => release());
      await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/prepare/stories"));
      expect(patches()).toHaveLength(1);
   });

   it("stays, with the text kept, when the save fails and the reader chooses not to discard; leaves only when they choose to", async () => {
      const story = await seed();
      show(story);
      await ready();
      type("Title", "Cutover");
      api.failNext(500);
      fireEvent.click(back());
      await waitFor(() => expect(confirm).toHaveBeenCalledWith(PROMPT));
      expect(nav.push).not.toHaveBeenCalled();
      expect(screen.getByLabelText(/^Title/)).toHaveValue("Cutover");
      expect(status()).toHaveTextContent("Couldn't save");

      confirm.mockReturnValue(true);
      api.failNext(500);
      fireEvent.click(back());
      await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/prepare/stories"));
      const stored = await clientFor(token).getStory(story.id);
      expect(stored.status === "ok" && stored.data.title).toBe("Migration");
   });

   it("never overwrites a newer version on the way out: it asks, and the choice stays on screen", async () => {
      const story = await seed();
      show(story);
      await ready();
      await changeElsewhere(story, { title: "Server title" });
      type("Year", "2020");
      fireEvent.click(back());
      await waitFor(() => expect(confirm).toHaveBeenCalledWith(PROMPT));
      expect(nav.push).not.toHaveBeenCalled();
      await screen.findByRole("group", { name: "Choose which version to keep" });
      expect(patches().map(({ body }) => body)).toEqual([{ version: 1, title: "Server title" }, { version: 1, year: 2020 }]);
   });

   it("does not save an invalid draft on the way out: it asks", async () => {
      const story = await seed();
      show(story);
      await ready();
      type("Title", " ");
      fireEvent.click(back());
      await waitFor(() => expect(confirm).toHaveBeenCalledWith(PROMPT));
      expect(patches()).toHaveLength(0);
      expect(nav.push).not.toHaveBeenCalled();
      expect(await screen.findByText("Enter a title.")).toBeInTheDocument();
   });

   it("holds nothing back once the story is deleted, even though edits were pending", async () => {
      const story = await seed();
      show(story);
      await ready();
      type("Title", "Cutover");
      fireEvent.click(screen.getByRole("button", { name: "Delete…" }));
      fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete story" }));
      await screen.findByRole("heading", { name: "Story deleted" });
      const after = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(after);
      expect(after.defaultPrevented).toBe(false);
      fireEvent.click(back());
      await act(async () => {});
      expect(patches()).toHaveLength(0);
      expect(confirm).not.toHaveBeenCalled();
   });
});
