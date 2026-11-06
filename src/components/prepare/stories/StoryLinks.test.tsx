import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerEditor } from "@/components/prepare/editor/AnswerEditor";
import { QuestionPicker, type CatalogLoad } from "@/components/prepare/picker/QuestionPicker";
import { createPrepClient } from "@/lib/prep/client";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import type { Answer, AnswerCreate, Story } from "@/lib/prep/types";
import { LinkedStories } from "./LinkedStories";
import { StoryEditor } from "./StoryEditor";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

const API = "https://api.example.test";
const S1 = "lesson.behavioral-prep-sde-1";
const catalog: CatalogLoad = {
   status: "ok",
   questions: [
      { content_id: S1, question_id: "being-stuck", level: "sde-1", text: "Tell me about a time you were stuck.", snapshot_fallback: false },
      { content_id: S1, question_id: "disagreement", level: "sde-1", text: "Tell me about a time you disagreed.", snapshot_fallback: false },
   ],
};

let api: ReturnType<typeof createFakePrepApi>;
let token: string;

beforeEach(() => {
   nav.push.mockReset();
   api = createFakePrepApi();
   token = api.signIn("user-1");
});

const clientFor = (userToken = token) => createPrepClient({ baseUrl: API, getAccessToken: async () => userToken, fetch: api.fetch });
const client = () => clientFor();

async function makeStory(over: Partial<Story> = {}, userToken = token): Promise<Story> {
   const result = await clientFor(userToken).createStory({
      title: "Migration",
      framework: "star",
      notes: "Raw notes",
      tags: ["data"],
      fields: { situation: "Old stack", result: "Cut over in a week" },
      ...over,
   } as never);
   if (result.status !== "ok") throw new Error("seed story failed");
   return result.data;
}

async function makeAnswer(question = "Tell me about a time you were stuck.", userToken = token): Promise<Answer> {
   const result = await clientFor(userToken).createAnswer({ source: "custom", question_snapshot: question, framework: "star" } as AnswerCreate);
   if (result.status !== "ok") throw new Error("seed answer failed");
   return result.data;
}

const readStory = async (id: string) => {
   const result = await client().getStory(id);
   if (result.status !== "ok") throw new Error("read story failed");
   return result.data;
};
const readAnswer = async (id: string) => {
   const result = await client().getAnswer(id);
   if (result.status !== "ok") throw new Error("read answer failed");
   return result.data;
};

const mounted = (answer: Answer, fetch: typeof globalThis.fetch = api.fetch) =>
   render(<LinkedStories client={createPrepClient({ baseUrl: API, getAccessToken: async () => token, fetch })} answerId={answer.id} initialStoryIds={answer.story_ids} />);

const writes = (method: string, suffix: string) => api.requests.filter((request) => request.method === method && request.path.endsWith(suffix));
const linkButton = () => screen.getByRole("button", { name: "Link story" });
async function chooseStory(title: string) {
   fireEvent.click(await screen.findByRole("button", { name: "Link a story" }));
   const select = await screen.findByLabelText("Story to link");
   const option = within(select).getByRole("option", { name: title }) as HTMLOptionElement;
   fireEvent.change(select, { target: { value: option.value } });
}

describe("one story linked to several answers", () => {
   it("links the same story to two answers and shows both on the story, without copying any text", async () => {
      const story = await makeStory();
      const first = await makeAnswer("First question");
      const second = await makeAnswer("Second question");
      const one = mounted(first);
      await chooseStory("Migration");
      fireEvent.click(linkButton());
      await screen.findByText(/Linked to Migration\. Nothing was copied/);
      one.unmount();
      mounted(second);
      await chooseStory("Migration");
      fireEvent.click(linkButton());
      await screen.findByText(/Linked to Migration\. Nothing was copied/);

      expect((await readStory(story.id)).answer_ids.sort()).toEqual([first.id, second.id].sort());
      expect((await readAnswer(first.id)).fields).toEqual({});
      expect((await readAnswer(second.id)).body).toBeNull();

      render(<StoryEditor apiUrl={API} storyId={story.id} getAccessToken={async () => token} fetch={api.fetch} />);
      const list = await screen.findByRole("heading", { name: "Linked answers" });
      const items = within(list.closest("section")!).getAllByRole("listitem");
      await waitFor(() => expect(items.map((item) => item.textContent)).toEqual(expect.arrayContaining(["First question", "Second question"])));
      expect(screen.getByText("Linked to 2 answers.")).toBeInTheDocument();
   });

   it("does not offer a story that is already linked, so one pair cannot be linked twice from the editor", async () => {
      const story = await makeStory();
      const answer = await makeAnswer();
      await client().linkStory(answer.id, story.id);
      mounted(await readAnswer(answer.id));
      await screen.findByRole("link", { name: "Migration" });
      fireEvent.click(screen.getByRole("button", { name: "Link a story" }));
      await screen.findByText("Every story you have is already linked.");
      expect(screen.queryByLabelText("Story to link")).not.toBeInTheDocument();
   });
});

describe("linking and unlinking", () => {
   it("shows a link only after the API confirmed it, and an unlink only after the API confirmed that", async () => {
      const story = await makeStory();
      const answer = await makeAnswer();
      mounted(answer);
      expect(screen.getByText("No story is linked to this answer.")).toBeInTheDocument();
      await chooseStory("Migration");
      fireEvent.click(linkButton());
      expect(await screen.findByRole("link", { name: "Migration" })).toHaveAttribute("href", `/prepare/stories/${story.id}`);
      expect((await readAnswer(answer.id)).story_ids).toEqual([story.id]);

      fireEvent.click(screen.getByRole("button", { name: "Unlink Migration" }));
      await screen.findByText(/Unlinked from Migration\. Neither the story nor this answer was changed/);
      expect(screen.getByText("No story is linked to this answer.")).toBeInTheDocument();
      expect((await readAnswer(answer.id)).story_ids).toEqual([]);
      expect((await readStory(story.id)).version).toBe(1);
      expect((await readAnswer(answer.id)).version).toBe(1);
   });

   it.each([
      ["a server error", 500, /could not confirm whether linking the story worked/],
      ["a lost connection", "network", /could not confirm whether linking the story worked/],
   ] as const)("a link that fails with %s leaves the list as it was and says what is unknown", async (_name, failure, words) => {
      await makeStory();
      const answer = await makeAnswer();
      mounted(answer);
      await chooseStory("Migration");
      api.failNext(failure);
      fireEvent.click(linkButton());
      expect(await screen.findByRole("alert")).toHaveTextContent(words);
      expect(screen.getByRole("alert")).not.toHaveTextContent("Nothing was changed");
      expect(screen.getByText("No story is linked to this answer.")).toBeInTheDocument();
      expect(screen.queryByText(/^Linked to Migration/)).not.toBeInTheDocument();
   });

   /** The server applies the write and then answers with an error: what a 5xx can mean (contract §6). */
   const commitThen500 =
      (method: string): typeof fetch =>
      async (input, init) => {
         const response = await api.fetch(input, init);
         return init?.method === method ? new Response("upstream", { status: 500 }) : response;
      };

   it("does not say a link did nothing when the server committed it and then returned 500, and a read confirms it", async () => {
      const story = await makeStory();
      const answer = await makeAnswer();
      mounted(answer, commitThen500("PUT"));
      await chooseStory("Migration");
      fireEvent.click(linkButton());
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("could not confirm whether linking the story worked, so it may or may not have been applied");
      expect(alert).not.toHaveTextContent(/Nothing was changed|did not run|not linked/);
      expect(screen.queryByText(/^Linked to Migration/)).not.toBeInTheDocument();
      expect((await readAnswer(answer.id)).story_ids).toEqual([story.id]);

      const puts = writes("PUT", `/stories/${story.id}`).length;
      fireEvent.click(screen.getByRole("button", { name: "Check the saved links" }));
      await screen.findByText(/Checked: the list now shows the links the server holds/);
      expect(await screen.findByRole("link", { name: "Migration" })).toBeInTheDocument();
      expect(writes("PUT", `/stories/${story.id}`)).toHaveLength(puts);
   });

   it("settles an uncertain link by repeating the idempotent link: one link, never two", async () => {
      const story = await makeStory();
      const answer = await makeAnswer();
      let flaky = true;
      const once: typeof fetch = async (input, init) => (flaky && init?.method === "PUT" ? ((flaky = false), commitThen500("PUT")(input, init)) : api.fetch(input, init));
      mounted(answer, once);
      await chooseStory("Migration");
      fireEvent.click(linkButton());
      await screen.findByRole("alert");
      fireEvent.click(linkButton());
      await screen.findByText(/Linked to Migration\. Nothing was copied/);
      expect(writes("PUT", `/stories/${story.id}`)).toHaveLength(2);
      expect((await readAnswer(answer.id)).story_ids).toEqual([story.id]);
   });

   it("does not say an unlink did nothing when the server removed the link and then returned 500", async () => {
      const story = await makeStory();
      const answer = await makeAnswer();
      await client().linkStory(answer.id, story.id);
      mounted(await readAnswer(answer.id), commitThen500("DELETE"));
      await screen.findByRole("link", { name: "Migration" });
      fireEvent.click(screen.getByRole("button", { name: "Unlink Migration" }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("could not confirm whether unlinking the story worked, so it may or may not have been applied");
      expect(alert).not.toHaveTextContent(/Nothing was changed|did not run/);
      expect(screen.queryByText(/^Unlinked from/)).not.toBeInTheDocument();
      expect((await readAnswer(answer.id)).story_ids).toEqual([]);

      fireEvent.click(screen.getByRole("button", { name: "Check the saved links" }));
      await screen.findByText(/Checked: the list now shows the links the server holds/);
      expect(screen.getByText("No story is linked to this answer.")).toBeInTheDocument();
   });

   it("keeps a linked story listed when the unlink fails, and does not claim it was unlinked", async () => {
      const story = await makeStory();
      const answer = await makeAnswer();
      await client().linkStory(answer.id, story.id);
      mounted(await readAnswer(answer.id));
      await screen.findByRole("link", { name: "Migration" });
      api.failNext("network");
      fireEvent.click(screen.getByRole("button", { name: "Unlink Migration" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("could not confirm whether unlinking the story worked");
      expect(screen.getByRole("link", { name: "Migration" })).toBeInTheDocument();
      expect(screen.queryByText(/^Unlinked from/)).not.toBeInTheDocument();
      expect((await readAnswer(answer.id)).story_ids).toEqual([story.id]);
   });

   it("reads a 404 on unlink as already unlinked", async () => {
      const story = await makeStory();
      const answer = await makeAnswer();
      await client().linkStory(answer.id, story.id);
      const loaded = await readAnswer(answer.id);
      await client().unlinkStory(answer.id, story.id);
      mounted(loaded);
      await screen.findByRole("link", { name: "Migration" });
      fireEvent.click(screen.getByRole("button", { name: "Unlink Migration" }));
      await screen.findByText("Migration was not linked any more.");
      expect(screen.getByText("No story is linked to this answer.")).toBeInTheDocument();
   });

   it("says the session ended on a 401 and links nothing", async () => {
      await makeStory();
      const answer = await makeAnswer();
      mounted(answer);
      await chooseStory("Migration");
      token = "expired";
      fireEvent.click(linkButton());
      expect(await screen.findByRole("alert")).toHaveTextContent("Your session has ended, so linking the story did not happen");
      expect(screen.getByText("No story is linked to this answer.")).toBeInTheDocument();
   });

   it("reports a failed story list as an error with a retry, never as an empty Story Bank", async () => {
      await makeStory();
      mounted(await makeAnswer());
      api.failNext("network");
      fireEvent.click(screen.getByRole("button", { name: "Link a story" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/We could not reach the preparation service/);
      expect(screen.queryByText("Your Story Bank is empty.")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await screen.findByLabelText("Story to link");
   });
});

describe("starting an answer from a story", () => {
   const picker = (storyId: string, fetch: typeof globalThis.fetch = api.fetch) =>
      render(<QuestionPicker apiUrl={API} catalog={catalog} storyId={storyId} getAccessToken={async () => token} fetch={fetch} />);
   const choose = (question: RegExp) => fireEvent.click(screen.getByRole("radio", { name: question }));
   const start = () => fireEvent.click(screen.getByRole("button", { name: "Start answer" }));

   it("creates the answer with the story's text copied once, links it, and opens it", async () => {
      const story = await makeStory();
      picker(story.id);
      choose(/you were stuck/);
      start();
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));

      const created = writes("POST", "/answers");
      expect(created).toHaveLength(1);
      expect(created[0].body).toMatchObject({
         source: "catalog",
         question_id: "being-stuck",
         framework: "star",
         fields: { situation: "Old stack", result: "Cut over in a week" },
         body: "Raw notes",
      });
      expect(created[0].body).not.toHaveProperty("tags");
      expect(created[0].body).not.toHaveProperty("title");
      const list = await client().listAnswers();
      if (list.status !== "ok") throw new Error("list failed");
      const answer = list.data.items[0];
      expect(nav.push).toHaveBeenCalledWith(`/prepare/answers/${answer.id}`);
      expect(answer).toMatchObject({ fields: { situation: "Old stack", result: "Cut over in a week" }, body: "Raw notes", story_ids: [story.id] });
      expect((await readStory(story.id)).answer_ids).toEqual([answer.id]);
   });

   it("copies a free-form story as free-form and sends no body for empty notes", async () => {
      const free = await makeStory({ framework: "free_form", notes: "Told as a narrative", fields: {} });
      const { unmount } = picker(free.id);
      choose(/you were stuck/);
      start();
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
      expect(writes("POST", "/answers")[0].body).toMatchObject({ framework: "free_form", body: "Told as a narrative", fields: {} });
      unmount();

      const bare = await makeStory({ notes: "", fields: { action: "I led it" } });
      api.requests.length = 0;
      picker(bare.id);
      choose(/you disagreed/);
      start();
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(2));
      expect(writes("POST", "/answers")[0].body).toMatchObject({ framework: "star", body: null, fields: { action: "I led it" } });
   });

   it("leaves the answer's text alone when the story is edited afterwards, and the story alone when the answer is", async () => {
      const story = await makeStory();
      picker(story.id);
      choose(/you were stuck/);
      start();
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
      const list = await client().listAnswers();
      if (list.status !== "ok") throw new Error("list failed");
      const answer = list.data.items[0];

      const edited = await client().updateStory(story.id, { version: 1, notes: "Rewritten", fields: { situation: "New stack" }, title: "Renamed" });
      expect(edited.status).toBe("ok");
      const after = await readAnswer(answer.id);
      expect(after.body).toBe("Raw notes");
      expect(after.fields).toEqual({ situation: "Old stack", result: "Cut over in a week" });
      expect(after.version).toBe(answer.version);
      expect(after.story_ids).toEqual([story.id]);

      await client().updateAnswer(answer.id, { version: after.version, body: "Answer only", fields: {} });
      const storyAfter = await readStory(story.id);
      expect(storyAfter).toMatchObject({ notes: "Rewritten", fields: { situation: "New stack" }, title: "Renamed" });
    });

   it("creates one answer when Start is pressed twice", async () => {
      const story = await makeStory();
      picker(story.id);
      choose(/you were stuck/);
      const button = screen.getByRole("button", { name: "Start answer" });
      fireEvent.click(button);
      fireEvent.click(button);
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
      expect(writes("POST", "/answers")).toHaveLength(1);
      expect(writes("PUT", `/stories/${story.id}`)).toHaveLength(1);
   });

   it("keeps the copy but retries only the link when the link fails, never creating a second answer", async () => {
      const story = await makeStory();
      let failLink = true;
      const flaky: typeof fetch = async (input, init) => {
         if (init?.method === "PUT" && failLink) throw new TypeError("network lost");
         return api.fetch(input, init);
      };
      picker(story.id, flaky);
      choose(/you were stuck/);
      start();
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("The link may or may not exist. Starting again would make a second answer");
      expect(nav.push).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Start answer" })).toBeDisabled();
      expect((await readStory(story.id)).answer_ids).toEqual([]);

      failLink = false;
      fireEvent.click(screen.getByRole("button", { name: "Try linking again" }));
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
      expect(writes("POST", "/answers")).toHaveLength(1);
      const list = await client().listAnswers();
      if (list.status !== "ok") throw new Error("list failed");
      expect(list.data.total).toBe(1);
      expect((await readStory(story.id)).answer_ids).toEqual([list.data.items[0].id]);
   });

   it("does not claim the story is unlinked when the link committed and the response was a 500; a read confirms it without a second answer", async () => {
      const story = await makeStory();
      const committed500: typeof fetch = async (input, init) => {
         const response = await api.fetch(input, init);
         return init?.method === "PUT" ? new Response("upstream", { status: 500 }) : response;
      };
      picker(story.id, committed500);
      choose(/you were stuck/);
      start();
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("The link may or may not exist");
      expect(alert).not.toHaveTextContent(/not linked yet/);
      expect(nav.push).not.toHaveBeenCalled();
      expect((await readStory(story.id)).answer_ids).toHaveLength(1);

      fireEvent.click(screen.getByRole("button", { name: "Check whether it is linked" }));
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
      expect(writes("POST", "/answers")).toHaveLength(1);
      expect(writes("PUT", `/stories/${story.id}`)).toHaveLength(1);
   });

   it("says a read found the answer not linked only after the read said so", async () => {
      const story = await makeStory();
      const fails: typeof fetch = async (input, init) => (init?.method === "PUT" ? Promise.reject(new TypeError("down")) : api.fetch(input, init));
      picker(story.id, fails);
      choose(/you were stuck/);
      start();
      fireEvent.click(await screen.findByRole("button", { name: "Check whether it is linked" }));
      await screen.findByText("Checked: the answer is not linked to the story yet.");
      expect(nav.push).not.toHaveBeenCalled();
   });

   it("stays uncertain and says so while the retry also fails", async () => {
      const story = await makeStory();
      const fails: typeof fetch = async (input, init) => (init?.method === "PUT" ? Promise.reject(new TypeError("down")) : api.fetch(input, init));
      picker(story.id, fails);
      choose(/you were stuck/);
      start();
      fireEvent.click(await screen.findByRole("button", { name: "Try linking again" }));
      await waitFor(() => expect(screen.getAllByRole("alert")[0]).toHaveTextContent("We still could not confirm whether the link exists"));
      expect(nav.push).not.toHaveBeenCalled();
      expect(writes("POST", "/answers")).toHaveLength(1);
    });
});

describe("ownership", () => {
   it("creates nothing and shows nothing of another reader's story", async () => {
      const theirs = await makeStory({ title: "Their secret story", notes: "Private notes" }, api.signIn("user-2"));
      api.requests.length = 0;
      render(<QuestionPicker apiUrl={API} catalog={catalog} storyId={theirs.id} getAccessToken={async () => token} fetch={api.fetch} />);
      fireEvent.click(screen.getByRole("radio", { name: /you were stuck/ }));
      fireEvent.click(screen.getByRole("button", { name: "Start answer" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("We could not find that story in your Story Bank, so no answer was created.");
      expect(writes("POST", "/answers")).toHaveLength(0);
      expect(document.body).not.toHaveTextContent("Their secret story");
      expect(document.body).not.toHaveTextContent("Private notes");
      const mine = await client().listAnswers();
      expect(mine.status === "ok" && mine.data.total).toBe(0);
      expect(screen.getByRole("button", { name: "Start answer" })).toBeEnabled();
   });

   it("cannot link another reader's story: the link is refused and nothing of theirs appears", async () => {
      const theirs = await makeStory({ title: "Their secret story" }, api.signIn("user-2"));
      const answer = await makeAnswer();
      mounted(answer);
      await makeStory({ title: "Mine" });
      // The list only holds the caller's stories; a crafted link attempt goes straight to the API.
      const attempt = await client().linkStory(answer.id, theirs.id);
      expect(attempt.status).toBe("notFound");
      await chooseStory("Mine");
      expect(screen.queryByRole("option", { name: "Their secret story" })).not.toBeInTheDocument();
      expect((await readAnswer(answer.id)).story_ids).toEqual([]);
      const theirStory = await clientFor("token-user-2").getStory(theirs.id);
      expect(theirStory.status === "ok" && theirStory.data.answer_ids).toEqual([]);
   });

   it("says a linked story that is no longer readable could not be found, without a title", async () => {
      const answer = await makeAnswer();
      const ghost = "00000000-0000-4000-8000-0000000000ff";
      mounted({ ...answer, story_ids: [ghost] });
      await screen.findByText("A linked story could not be found.");
      expect(screen.queryByRole("link", { name: /Migration/ })).not.toBeInTheDocument();
    });

   it("reads another reader's answer as not found on the story page, so linked answers expose nothing", async () => {
      const story = await makeStory();
      const theirs = await makeAnswer("Their private question", api.signIn("user-2"));
      render(<LinkedStories client={client()} answerId={theirs.id} initialStoryIds={[]} />);
      await chooseStory("Migration");
      fireEvent.click(linkButton());
      expect(await screen.findByRole("alert")).toHaveTextContent("could not be found in your Story Bank, so nothing was linked");
      expect((await readStory(story.id)).answer_ids).toEqual([]);
    });
});

describe("the answer editor's mount", () => {
   it("shows the stories linked to the answer opened, and unlinks one without touching the answer's save state", async () => {
      const story = await makeStory();
      const answer = await makeAnswer();
      await client().linkStory(answer.id, story.id);
      render(<AnswerEditor apiUrl={API} answerId={answer.id} catalog={null} getAccessToken={async () => token} fetch={api.fetch} />);
      await screen.findByRole("heading", { name: "Your answer" });
      expect(await screen.findByRole("link", { name: "Migration" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Unlink Migration" }));
      await screen.findByText(/Unlinked from Migration/);
      expect(api.requests.filter(({ method }) => method === "PATCH")).toHaveLength(0);
      expect((await readAnswer(answer.id)).version).toBe(1);
    });
});
