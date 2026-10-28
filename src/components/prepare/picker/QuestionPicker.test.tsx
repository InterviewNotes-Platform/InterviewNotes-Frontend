import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrepClient } from "@/lib/prep/client";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import type { CatalogQuestion } from "@/lib/prep/questions";
import { QuestionPicker, SNAPSHOT_MAX, type CatalogLoad } from "./QuestionPicker";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

const API = "https://api.example.test";
const S1 = "lesson.behavioral-prep-sde-1";
const S2 = "lesson.behavioral-prep-sde-2";
const EM = "lesson.behavioral-prep-engineering-manager";

// The same question id and the same words in two Lessons: only the pair tells them apart.
const questions: CatalogQuestion[] = [
   { content_id: S1, question_id: "disagreement", level: "sde-1", text: "Tell me about a time you disagreed with a teammate.", snapshot_fallback: false },
   { content_id: S1, question_id: "being-stuck", level: "sde-1", text: "Tell me about a time you were stuck.", snapshot_fallback: false },
   { content_id: S2, question_id: "disagreement", level: "sde-2", text: "Tell me about a time you disagreed with a teammate.", snapshot_fallback: false },
   { content_id: S2, question_id: "disagreeing-with-design", level: "sde-2", text: "Tell me about a time you disagreed with a design.", snapshot_fallback: false },
   { content_id: EM, question_id: "underperformance", level: "engineering-manager", text: "Underperformance on your team", snapshot_fallback: true },
];
const ok: CatalogLoad = { status: "ok", questions };

let api: ReturnType<typeof createFakePrepApi>;
let token: string;

beforeEach(() => {
   nav.push.mockReset();
   nav.refresh.mockReset();
   api = createFakePrepApi();
   token = api.signIn("user-1");
});

function show(props: Partial<React.ComponentProps<typeof QuestionPicker>> = {}, fetch: typeof globalThis.fetch = api.fetch) {
   return render(<QuestionPicker apiUrl={API} catalog={ok} getAccessToken={async () => token} fetch={fetch} {...props} />);
}

const client = () => createPrepClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });
const options = () => within(screen.getByRole("group", { name: "Question" })).getAllByRole("radio");
const posts = () => api.requests.filter(({ method, path }) => method === "POST" && path.endsWith("/answers"));
const submit = () => screen.getByRole("button", { name: "Start answer" });

/** The saved level is read first; a failure queued before that would land on it instead of the write under test. */
const preferenceRead = () => waitFor(() => expect(api.requests.some(({ path }) => path.endsWith("/preferences"))).toBe(true));

async function saveLevel(level: string) {
   const result = await client().updatePreference({ target_level: level as never, version: 0 });
   expect(result.status).toBe("ok");
   api.requests.length = 0;
}

describe("target-level filtering", () => {
   it("lists every question when there is no saved level", async () => {
      show();
      await waitFor(() => expect(api.requests.filter(({ path }) => path.endsWith("/preferences"))).toHaveLength(1));
      expect(options()).toHaveLength(5);
      expect(screen.getByLabelText("Level")).toHaveValue("all");
   });

   it("filters by the saved target level, reading it once and nothing else", async () => {
      await saveLevel("sde-2");
      show();
      await waitFor(() => expect(screen.getByLabelText("Level")).toHaveValue("sde-2"));
      expect(options().map((option) => option.closest("label")?.textContent)).toEqual([
         "Tell me about a time you disagreed with a teammate.",
         "Tell me about a time you disagreed with a design.",
      ]);
      expect(api.requests.map(({ method, path }) => `${method} ${path}`)).toEqual(["GET /preferences"]);
   });

   it("lets the reader change the level, and never moves it afterwards when the saved level arrives late", async () => {
      await saveLevel("sde-2");
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const slow: typeof fetch = async (input, init) => {
         if (String(input).includes("/preferences")) await gate;
         return api.fetch(input, init);
      };
      show({}, slow);
      fireEvent.change(screen.getByLabelText("Level"), { target: { value: "engineering-manager" } });
      await act(async () => release());
      await waitFor(() => expect(api.requests).toHaveLength(1));
      expect(screen.getByLabelText("Level")).toHaveValue("engineering-manager");
      expect(options()).toHaveLength(1);
   });

   it("drops a selection the filter hides, so it cannot be submitted unseen", () => {
      show();
      fireEvent.click(options()[0]);
      expect(submit()).toBeEnabled();
      fireEvent.change(screen.getByLabelText("Level"), { target: { value: "sde-2" } });
      expect(submit()).toBeDisabled();
   });

   it("says so when a level has no questions, rather than showing an empty list as normal", () => {
      show({ catalog: { status: "ok", questions: questions.filter(({ level }) => level !== "sde-3") } });
      fireEvent.change(screen.getByLabelText("Level"), { target: { value: "sde-3" } });
      expect(screen.getByText("There are no questions for this level.")).toBeInTheDocument();
   });

   it("keeps the list usable and says so when the saved level cannot be read, then recovers on retry", async () => {
      await saveLevel("sde-2");
      api.failNext(500);
      show();
      expect(await screen.findByText(/could not load your target level/)).toBeInTheDocument();
      expect(options()).toHaveLength(5);
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await waitFor(() => expect(screen.getByLabelText("Level")).toHaveValue("sde-2"));
      expect(options()).toHaveLength(2);
   });
});

describe("catalog answers", () => {
   it("creates the answer with the exact pair and the snapshot, and opens that answer's editor", async () => {
      show();
      fireEvent.click(options()[3]);
      fireEvent.click(submit());
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
      const listed = await client().listAnswers();
      expect(listed.status === "ok" && listed.data.items).toHaveLength(1);
      expect(nav.push).toHaveBeenCalledWith(`/prepare/answers/${listed.status === "ok" ? listed.data.items[0].id : ""}`);
      expect(posts()).toHaveLength(1);
      expect(posts()[0].token).toBe(token);
      expect(posts()[0].body).toEqual({
         source: "catalog",
         content_id: S2,
         question_id: "disagreeing-with-design",
         question_snapshot: "Tell me about a time you disagreed with a design.",
         snapshot_fallback: false,
         framework: "star",
      });
      const stored = await client().listAnswers();
      expect(stored.status === "ok" && stored.data.items[0]).toMatchObject({ source: "catalog", content_id: S2, question_id: "disagreeing-with-design", snapshot_fallback: false });
   });

   it("keys a question by its pair: the same id and words in another Lesson is a different question", async () => {
      show();
      const [first, , second] = options();
      fireEvent.click(second);
      expect(second).toBeChecked();
      expect(first).not.toBeChecked();
      fireEvent.click(submit());
      await waitFor(() => expect(posts()).toHaveLength(1));
      expect(posts()[0].body).toMatchObject({ content_id: S2, question_id: "disagreement" });
   });

   it("sends the flagged fallback for a question whose text is its heading", async () => {
      show();
      fireEvent.click(options()[4]);
      fireEvent.click(submit());
      await waitFor(() => expect(posts()).toHaveLength(1));
      expect(posts()[0].body).toMatchObject({ content_id: EM, question_id: "underperformance", question_snapshot: "Underperformance on your team", snapshot_fallback: true });
   });

   it("does not create anything until a question is chosen", () => {
      show();
      expect(submit()).toBeDisabled();
      fireEvent.submit(submit().closest("form")!);
      expect(posts()).toHaveLength(0);
   });

   it("sends one request for a double click", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const held: typeof fetch = async (input, init) => {
         if (init?.method === "POST") await gate;
         return api.fetch(input, init);
      };
      show({}, held);
      fireEvent.click(options()[0]);
      fireEvent.click(submit());
      fireEvent.click(submit());
      fireEvent.submit(submit().closest("form")!);
      expect(await screen.findByText(/Creating your answer/)).toBeInTheDocument();
      await act(async () => release());
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
      expect(posts()).toHaveLength(1);
   });
});

describe("a question from a Lesson link", () => {
   it("selects the named pair, shows its level, and reads no saved level", () => {
      show({ requested: { content_id: S2, question_id: "disagreement" } });
      expect(screen.getByLabelText("Level")).toHaveValue("sde-2");
      const checked = options().filter((option) => (option as HTMLInputElement).checked);
      expect(checked).toHaveLength(1);
      expect(checked[0].closest("label")).toHaveTextContent("disagreed with a teammate");
      expect(submit()).toBeEnabled();
      expect(api.requests).toHaveLength(0);
   });

   it("selects nothing, and says so, when the pair is not in the catalog", () => {
      show({ requested: { content_id: S1, question_id: "not-a-question" } });
      expect(screen.getByText(/not in the Lessons any more/)).toBeInTheDocument();
      expect(options().some((option) => (option as HTMLInputElement).checked)).toBe(false);
      expect(submit()).toBeDisabled();
   });

   it("does not let a question id from one Lesson select the same id in another", () => {
      show({ requested: { content_id: EM, question_id: "disagreement" } });
      expect(options().some((option) => (option as HTMLInputElement).checked)).toBe(false);
   });
});

describe("custom questions", () => {
   function write(text: string) {
      fireEvent.click(screen.getByRole("radio", { name: "Write your own" }));
      fireEvent.change(screen.getByLabelText("Your question"), { target: { value: text } });
   }

   it("creates a custom answer with no identifier, trimmed", async () => {
      show();
      write("  How do you decide what to cut?  ");
      fireEvent.click(submit());
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
      expect(posts()[0].body).toEqual({ source: "custom", question_snapshot: "How do you decide what to cut?", framework: "star" });
      const stored = await client().listAnswers();
      expect(stored.status === "ok" && nav.push.mock.calls[0][0]).toBe(`/prepare/answers/${stored.status === "ok" ? stored.data.items[0].id : ""}`);
      expect(stored.status === "ok" && stored.data.items[0]).toMatchObject({ source: "custom", content_id: null, question_id: null, snapshot_fallback: false, question_snapshot: "How do you decide what to cut?" });
   });

   it("is not offered empty, blank, or over the limit", () => {
      show();
      write("   ");
      expect(submit()).toBeDisabled();
      write("x".repeat(SNAPSHOT_MAX));
      expect(submit()).toBeEnabled();
      write("x".repeat(SNAPSHOT_MAX + 1));
      expect(submit()).toBeDisabled();
      expect(screen.getByLabelText("Your question")).toBeInvalid();
      expect(screen.getByText(/the limit is 1,000/)).toBeInTheDocument();
   });

   it("counts characters, not UTF-16 units, as the server does", () => {
      show();
      write("😀".repeat(SNAPSHOT_MAX));
      expect(submit()).toBeEnabled();
   });
});

describe("failures", () => {
   it("reports a refused create as safe to resubmit, with the form still usable", async () => {
      // Unlike a lost response, a validation refusal is definite: the server said nothing was created.
      const refuse: typeof fetch = async (input, init) =>
         init?.method === "POST" ? new Response(JSON.stringify({ detail: "validation_error", code: "validation_error", fields: [{ field: "question_snapshot", reason: "too_long" }] }), { status: 422, headers: { "Content-Type": "application/json" } }) : api.fetch(input, init);
      show({}, refuse);
      fireEvent.click(options()[0]);
      fireEvent.click(submit());
      expect(await screen.findByRole("alert")).toHaveTextContent("did not accept");
      expect(submit()).toBeEnabled();
      expect(screen.queryByRole("button", { name: /create it again/ })).toBeNull();
   });

   it("keeps what was typed for a custom question after a network failure", async () => {
      show();
      await preferenceRead();
      fireEvent.click(screen.getByRole("radio", { name: "Write your own" }));
      fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "My own question" } });
      api.failNext("network");
      fireEvent.click(submit());
      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.getByLabelText("Your question")).toHaveValue("My own question");
   });

   it("sends a reader whose session ended to sign-in, returning with the chosen question", async () => {
      token = "expired";
      show();
      fireEvent.click(options()[0]);
      fireEvent.click(submit());
      const link = await screen.findByRole("link", { name: "Sign in" });
      expect(link.getAttribute("href")).toBe(`/login?redirect=${encodeURIComponent(`/prepare/new?content=${S1}&question=disagreement`)}`);
   });

   it("reports a missing API origin and offers no way to submit", () => {
      show({ apiUrl: null });
      expect(screen.getByRole("alert")).toHaveTextContent("not configured");
      fireEvent.click(options()[0]);
      expect(submit()).toBeDisabled();
   });
});

/** The server commits the create, then the answer never reaches the browser, or arrives unusable. */
const commitThenLose = (how: "lost" | "malformed"): typeof fetch => async (input, init) => {
   const response = await api.fetch(input, init);
   if (init?.method !== "POST") return response;
   if (how === "lost") throw new TypeError("network lost after the server committed");
   return new Response("<html>gateway</html>", { status: 201, headers: { "Content-Type": "text/html" } });
};
/** How many answers the fake server really holds for the signed-in user. */
const storedCount = async () => {
   const list = await client().listAnswers();
   return list.status === "ok" ? list.data.total : -1;
};

describe("an ambiguous create", () => {
   it.each(["lost", "malformed"] as const)("does not allow an immediate second create after the server committed and the response was %s", async (how) => {
      show({}, commitThenLose(how));
      await preferenceRead();
      fireEvent.click(options()[0]);
      fireEvent.click(submit());

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("It may already exist");
      expect(alert).toHaveTextContent("Check In progress in your workspace first");
      expect(await storedCount()).toBe(1);

      // The action state says a write may exist: Start answer is off, and neither a click nor Enter can send another.
      expect(submit()).toBeDisabled();
      fireEvent.click(submit());
      fireEvent.submit(submit().closest("form")!);
      await act(async () => {});
      expect(posts()).toHaveLength(1);
      expect(await storedCount()).toBe(1);
      expect(nav.push).not.toHaveBeenCalled();
      expect(screen.getByRole("link", { name: "Open your workspace" })).toHaveAttribute("href", "/prepare");
   });

   it("allows the same question again only after the reader says it is not there, and then sends exactly one more", async () => {
      show({}, commitThenLose("lost"));
      await preferenceRead();
      fireEvent.click(options()[0]);
      fireEvent.click(submit());
      await screen.findByText(/It may already exist/);
      expect(submit()).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "It is not there: create it again" }));
      await waitFor(() => expect(posts()).toHaveLength(2));
      expect(await storedCount()).toBe(2);
      // That one was lost too, so the same guard is back.
      await screen.findByText(/It may already exist/);
      expect(submit()).toBeDisabled();
      fireEvent.click(submit());
      expect(posts()).toHaveLength(2);
   });

   it("keeps a custom question's text, locks only that text, and frees the form when the text changes", async () => {
      show({}, commitThenLose("lost"));
      await preferenceRead();
      fireEvent.click(screen.getByRole("radio", { name: "Write your own" }));
      fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "My own question" } });
      fireEvent.click(submit());
      await screen.findByText(/It may already exist/);
      expect(screen.getByLabelText("Your question")).toHaveValue("My own question");
      expect(submit()).toBeDisabled();

      fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "A different question" } });
      expect(screen.queryByText(/It may already exist/)).toBeNull();
      expect(submit()).toBeEnabled();
   });

   it("frees the form when a different catalog question is chosen, and locks again if the first is chosen back", async () => {
      show({}, commitThenLose("lost"));
      await preferenceRead();
      fireEvent.click(options()[0]);
      fireEvent.click(submit());
      await screen.findByText(/It may already exist/);

      fireEvent.click(options()[1]);
      expect(submit()).toBeEnabled();
      expect(screen.queryByText(/It may already exist/)).toBeNull();
      fireEvent.click(options()[0]);
      expect(submit()).toBeDisabled();
      expect(posts()).toHaveLength(1);
   });
});

describe("a catalog that could not be read", () => {
   it("shows a failure with a retry, never an empty list, and still allows a custom question", async () => {
      show({ catalog: { status: "failed", reason: "unavailable" } });
      expect(screen.getByRole("alert")).toHaveTextContent("could not load the questions");
      expect(screen.queryByRole("group", { name: "Question" })).toBeNull();
      expect(screen.queryByText(/no questions/i)).toBeNull();
      expect(api.requests).toHaveLength(0);
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(nav.refresh).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: "Write your own question" }));
      fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Mine" } });
      fireEvent.click(submit());
      await waitFor(() => expect(nav.push).toHaveBeenCalled());
   });

   it("offers sign-in, not a retry, when the session ended, and neither for an access problem", () => {
      const { unmount } = show({ catalog: { status: "failed", reason: "signin" } });
      expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
      unmount();
      show({ catalog: { status: "failed", reason: "unentitled" } });
      expect(screen.getByRole("alert")).toHaveTextContent("not included in your access");
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
   });
});

describe("keyboard and names", () => {
   it("uses native radios, named by their question, in labelled groups", () => {
      show();
      expect(screen.getByRole("group", { name: "Where the question comes from" })).toBeInTheDocument();
      for (const option of options()) {
         expect(option).toHaveProperty("type", "radio");
         expect(option).toHaveAccessibleName(/^(Tell me|Underperformance)/);
      }
      expect(screen.getByRole("radio", { name: "Choose from the Lessons" })).toBeChecked();
   });
});
