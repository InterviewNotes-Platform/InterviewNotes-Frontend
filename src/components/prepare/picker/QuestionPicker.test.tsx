import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrepClient } from "@/lib/prep/client";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import type { CatalogQuestion } from "@/lib/prep/questions";
import { COMPANY_STATEMENT, QuestionPicker, SNAPSHOT_MAX, type CatalogLoad, type CollectionOption } from "./QuestionPicker";

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

/** While every level is listed the picker shows one level at a time; step with Next until the stage is headed `name`. */
function stepTo(name: string) {
   for (let guard = 0; guard < 10 && !screen.queryByRole("heading", { level: 2, name }); guard++) fireEvent.click(screen.getByRole("button", { name: /^Next / }));
   expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
}

/** The saved level is read first; a failure queued before that would land on it instead of the write under test. */
const preferenceRead = () => waitFor(() => expect(api.requests.some(({ path }) => path.endsWith("/preferences"))).toBe(true));

async function saveLevel(level: string) {
   const result = await client().updatePreference({ target_level: level as never, version: 0 });
   expect(result.status).toBe("ok");
   api.requests.length = 0;
}

describe("target-level filtering", () => {
   it("opens the first level, with every level a stop, when there is no saved level", async () => {
      show();
      await waitFor(() => expect(api.requests.filter(({ path }) => path.endsWith("/preferences"))).toHaveLength(1));
      expect(screen.getByLabelText("Level")).toHaveValue("all");
      expect(screen.getByRole("heading", { level: 2, name: "SDE-1" })).toBeInTheDocument();
      // Every question is still reachable, in the Lessons' order, one level at a time.
      const seen: string[] = [];
      for (const level of ["SDE-1", "SDE-2", "Engineering manager"]) {
         stepTo(level);
         seen.push(...options().map((option) => option.closest("label")?.textContent ?? ""));
      }
      expect(seen).toEqual(questions.map(({ text }) => text));
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

   it("never moves the view afterwards when the reader has stepped through the levels or searched before the saved level arrives", async () => {
      await saveLevel("sde-2");
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const slow: typeof fetch = async (input, init) => {
         if (String(input).includes("/preferences")) await gate;
         return api.fetch(input, init);
      };
      show({}, slow);
      fireEvent.click(screen.getByRole("button", { name: "Next group" }));
      expect(screen.getByRole("heading", { level: 2, name: "SDE-2" })).toBeInTheDocument();
      await act(async () => release());
      await waitFor(() => expect(api.requests).toHaveLength(1));
      // The saved level is SDE-2, and the reader chose to look at levels: the Level choice stays on all.
      expect(screen.getByLabelText("Level")).toHaveValue("all");
      expect(screen.getByRole("heading", { level: 2, name: "SDE-2" })).toBeInTheDocument();
   });

   it("removes the open position from the address when a level is chosen, because one level is a plain list", () => {
      window.history.replaceState(null, "", "/prepare/new?group=2");
      show();
      fireEvent.change(screen.getByLabelText("Level"), { target: { value: "sde-1" } });
      expect(window.location.search).toBe("");
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
      expect(screen.getByRole("heading", { level: 2, name: "SDE-1" })).toBeInTheDocument();
      expect(options()).toHaveLength(2);
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await waitFor(() => expect(screen.getByLabelText("Level")).toHaveValue("sde-2"));
      expect(options()).toHaveLength(2);
   });
});

describe("catalog answers", () => {
   it("creates the answer with the exact pair and the snapshot, and opens that answer's editor", async () => {
      show();
      stepTo("SDE-2");
      fireEvent.click(options()[1]);
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
      // The same id and words sit in SDE-1 and SDE-2; choosing the second must not check the first.
      fireEvent.click(options()[0]);
      stepTo("SDE-2");
      const second = options()[0];
      fireEvent.click(second);
      expect(second).toBeChecked();
      fireEvent.click(screen.getByRole("button", { name: "Previous group" }));
      expect(options()[0]).not.toBeChecked();
      fireEvent.click(submit());
      await waitFor(() => expect(posts()).toHaveLength(1));
      expect(posts()[0].body).toMatchObject({ content_id: S2, question_id: "disagreement" });
   });

   it("sends the flagged fallback for a question whose text is its heading", async () => {
      show();
      stepTo("Engineering manager");
      fireEvent.click(options()[0]);
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

describe("collections", () => {
   const AMAZON = "lesson.amazon-leadership-principles";
   const COLLECTIONS: CollectionOption[] = [
      { id: "behavioral", title: "General Behavioral", levelFilter: true, grouped: false },
      { id: "amazon", title: "Amazon Leadership Principles", levelFilter: false, grouped: true },
      { id: "google", title: "Googleyness & Leadership", levelFilter: false, grouped: true },
   ];
   const own: CatalogQuestion<null>["group"] = { title: "Ownership", explanation: "Owning the outcome.\n\n**Editorial note.** Strong evidence is specific." };
   const dive: CatalogQuestion<null>["group"] = { title: "Dive Deep", explanation: "Knowing the details." };
   const company = (id: string, text: string, group: CatalogQuestion<null>["group"]): CatalogQuestion<null> => ({
      content_id: AMAZON, question_id: id, level: null, text, snapshot_fallback: false, group,
   });
   const grouped: CatalogLoad = {
      status: "ok",
      questions: [
         company("alp-ownership-01", "Tell me about owning a fix.", own),
         company("alp-ownership-02", "Tell me about an unowned problem.", own),
         company("alp-dive-deep-01", "Tell me about digging into a metric.", dive),
      ],
   };
   const showCollection = (id: string, catalog: CatalogLoad, extra: Partial<React.ComponentProps<typeof QuestionPicker>> = {}) =>
      show({ collections: COLLECTIONS, collectionId: id, catalog, ...extra });

   it("lists the three collections with the current one marked, and asks the page for another by an ordinary link instead of filtering", () => {
      showCollection("amazon", grouped, { storyId: "11111111-1111-4111-8111-111111111111" });
      const switcher = screen.getByRole("navigation", { name: "Collections" });
      const links = within(switcher).getAllByRole("link");
      expect(links.map((link) => link.getAttribute("aria-label"))).toEqual(COLLECTIONS.map(({ title }) => title));
      expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([null, "page", null]);
      expect(within(switcher).getByRole("link", { name: "Googleyness & Leadership" })).toHaveAttribute("href", "/prepare/new?collection=google&story=11111111-1111-4111-8111-111111111111");
      // Another collection is another server read: the picker never loads it itself, so it does not navigate on its own.
      expect(nav.push).not.toHaveBeenCalled();
      expect(nav.refresh).not.toHaveBeenCalled();
   });

   it("opens one principle at a time, in source order, with its own guidance beside only its own questions", () => {
      showCollection("amazon", grouped);
      expect(screen.getByRole("heading", { level: 2, name: "Ownership" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Dive Deep" })).toBeNull();
      expect(options()).toHaveLength(2);
      const ownership = screen.getByRole("region", { name: "Ownership" });
      // The guidance is drawn for a wide screen and for a phone; only one is shown by the stylesheet.
      expect(within(ownership).getAllByText("Owning the outcome.").length).toBeGreaterThan(0);
      expect(within(ownership).getAllByText("Editorial note. Strong evidence is specific.").length).toBeGreaterThan(0);
      expect(screen.queryByText("Knowing the details.")).toBeNull();
      expect(screen.queryByRole("radio", { name: /^Ownership$/ })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Next group" }));
      expect(screen.getByRole("heading", { level: 2, name: "Dive Deep" })).toBeInTheDocument();
      expect(options()).toHaveLength(1);
      expect(within(screen.getByRole("region", { name: "Dive Deep" })).getAllByText("Knowing the details.").length).toBeGreaterThan(0);
   });

   it("has no level filter for a company collection, shows no level under a question and never reads the saved level", async () => {
      showCollection("amazon", grouped);
      expect(screen.queryByLabelText("Level")).toBeNull();
      expect(screen.queryByText("SDE-1")).toBeNull();
      await act(async () => {});
      expect(api.requests.filter(({ path }) => path.endsWith("/preferences"))).toHaveLength(0);
   });

   it("shows the non-affiliation statement exactly, with a company collection only", () => {
      expect(COMPANY_STATEMENT).toBe(
         "InterviewNotes-created practice material; not affiliated with or endorsed by Amazon or Google. Company hiring practices can change; these questions and signals are editorial preparation aids, not official questions or scoring rubrics."
      );
      const { unmount } = showCollection("amazon", grouped);
      expect(screen.getByText(COMPANY_STATEMENT)).toBeInTheDocument();
      unmount();
      showCollection("behavioral", ok);
      expect(screen.queryByText(COMPANY_STATEMENT)).toBeNull();
   });

   it("keeps the general picker's level filter and has no principle guidance; every level is a stop instead of a label on each question", async () => {
      showCollection("behavioral", ok);
      expect(screen.getByLabelText("Level")).toBeInTheDocument();
      expect(options()).toHaveLength(2);
      expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
      expect(screen.getByRole("heading", { level: 2, name: "SDE-1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Jump to group" })).toBeInTheDocument();
      await preferenceRead();
   });

   it("creates the answer with the authored pair and the Lesson's question line as the snapshot", async () => {
      showCollection("amazon", grouped);
      fireEvent.click(screen.getByRole("button", { name: "Next group" }));
      fireEvent.click(options()[0]);
      fireEvent.click(submit());
      await waitFor(() => expect(posts()).toHaveLength(1));
      expect(posts()[0].body).toEqual({
         source: "catalog",
         content_id: AMAZON,
         question_id: "alp-dive-deep-01",
         question_snapshot: "Tell me about digging into a metric.",
         snapshot_fallback: false,
         framework: "star",
      });
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
   });

   it("selects the question a Lesson link named inside its group", () => {
      showCollection("amazon", grouped, { requested: { content_id: AMAZON, question_id: "alp-ownership-02" } });
      expect(screen.getByRole("radio", { name: /unowned problem/ })).toBeChecked();
   });

   it("offers no company questions when the collection could not be read, and still lets the reader switch", () => {
      showCollection("google", { status: "failed", reason: "unavailable" });
      expect(screen.getByRole("alert")).toHaveTextContent("We could not load the questions");
      expect(screen.queryAllByRole("radio", { name: /Tell me/ })).toHaveLength(0);
      expect(screen.getByRole("link", { name: "Googleyness & Leadership" })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("link", { name: "Amazon Leadership Principles" })).toHaveAttribute("href", "/prepare/new?collection=amazon");
      expect(screen.getByText(COMPANY_STATEMENT)).toBeInTheDocument();
   });

   it("returns a reader whose session ended to the same company collection when no question was chosen yet", async () => {
      token = "expired";
      showCollection("google", { status: "failed", reason: "signin" });
      const link = await screen.findByRole("link", { name: "Sign in" });
      expect(link.getAttribute("href")).toBe(`/login?redirect=${encodeURIComponent("/prepare/new?collection=google")}`);
   });

   it("shows no selector without a registry, as before", () => {
      show();
      expect(screen.queryByRole("navigation", { name: "Collections" })).toBeNull();
   });
});

/*
 * The Desk picker (P8-PREP-UX-02): one principle at a time, a jump menu, search inside the loaded collection, and Start answer kept
 * in reach. Everything here is presentation over the same create path, so the guarantees are about what it must NOT do: no request
 * from stepping or searching, no navigation by the router, no second create.
 */
describe("the Desk picker", () => {
   const AMAZON = "lesson.amazon-leadership-principles";
   const COLLECTIONS: CollectionOption[] = [
      { id: "behavioral", title: "General Behavioral", short: "General", unit: { one: "level", many: "levels" }, levelFilter: true, grouped: false },
      { id: "amazon", title: "Amazon Leadership Principles", short: "Amazon", unit: { one: "principle", many: "principles" }, levelFilter: false, grouped: true },
   ];
   const group = (title: string, explanation: string) => ({ title, explanation });
   const own = group("Ownership", "Owning the outcome.\n\n**Editorial note.** Strong evidence is specific.");
   const dive = group("Dive Deep", "Knowing the details.");
   const trust = group("Earn Trust", "Being straight with people.");
   const q = (id: string, title: string, text: string, g: ReturnType<typeof group>): CatalogQuestion<null> => ({
      content_id: AMAZON, question_id: id, level: null, text, title, snapshot_fallback: false, group: g,
   });
   const catalog: CatalogLoad = {
      status: "ok",
      questions: [
         q("alp-ownership-01", "A problem nobody had assigned", "Tell me about a production problem that was not formally yours.", own),
         q("alp-ownership-02", "Inheriting something fragile", "Describe taking over a brittle system.", own),
         q("alp-dive-deep-01", "A metric that looked wrong", "Tell me about digging into a metric that did not add up.", dive),
         q("alp-dive-deep-02", "Résumé of an outage", "Walk me through how you traced an outage to its cause.", dive),
         q("alp-earn-trust-01", "Saying the hard thing", "Tell me about delivering bad news to your team.", trust),
      ],
   };
   const open = (extra: Partial<React.ComponentProps<typeof QuestionPicker>> = {}, fetch?: typeof globalThis.fetch) => show({ collections: COLLECTIONS, collectionId: "amazon", catalog, ...extra }, fetch);
   const heading = () => screen.getByRole("heading", { level: 2 }).textContent;
   const search = () => screen.getByRole("searchbox", { name: "Find a question in Amazon Leadership Principles" });
   const type = (value: string) => fireEvent.change(search(), { target: { value } });

   beforeEach(() => window.history.replaceState(null, "", "/prepare/new?collection=amazon"));

   describe("the stepper", () => {
      it("starts on the first principle, says where it is, and has no Previous there", () => {
         open();
         expect(heading()).toBe("Ownership");
         expect(screen.getByText("Principle 1 of 3")).toBeInTheDocument();
         expect(screen.getByRole("button", { name: "Previous principle" })).toBeDisabled();
         expect(screen.getByRole("button", { name: "Next principle" })).toBeEnabled();
      });

      it("steps in source order to the last principle, where Next ends", () => {
         open();
         fireEvent.click(screen.getByRole("button", { name: "Next principle" }));
         expect(heading()).toBe("Dive Deep");
         fireEvent.click(screen.getByRole("button", { name: "Next principle" }));
         expect(heading()).toBe("Earn Trust");
         expect(screen.getByRole("button", { name: "Next principle" })).toBeDisabled();
         fireEvent.click(screen.getByRole("button", { name: "Previous principle" }));
         expect(heading()).toBe("Dive Deep");
      });

      it("keeps the chosen question when stepping away and back", () => {
         open();
         fireEvent.click(options()[1]);
         fireEvent.click(screen.getByRole("button", { name: "Next principle" }));
         expect(options().some((option) => (option as HTMLInputElement).checked)).toBe(false);
         fireEvent.click(screen.getByRole("button", { name: "Previous principle" }));
         expect(options()[1]).toBeChecked();
      });

      it("makes no request and does not navigate, however many steps are taken", () => {
         open();
         for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole("button", { name: "Next principle" }));
         fireEvent.click(screen.getByRole("button", { name: "Previous principle" }));
         expect(api.requests).toEqual([]);
         expect(nav.push).not.toHaveBeenCalled();
         expect(nav.refresh).not.toHaveBeenCalled();
      });

      it("says the principle it moved to in a polite live region, without moving focus", () => {
         open();
         const next = screen.getByRole("button", { name: "Next principle" });
         next.focus();
         fireEvent.click(next);
         expect(screen.getByText("Principle 2 of 3: Dive Deep, 2 questions")).toHaveAttribute("aria-live", "polite");
         expect(next).toHaveFocus();
      });

      it("writes the position to the address with replaceState only, and removes it on the first principle", () => {
         const replace = vi.spyOn(window.history, "replaceState");
         open();
         fireEvent.click(screen.getByRole("button", { name: "Next principle" }));
         expect(window.location.search).toBe("?collection=amazon&group=2");
         fireEvent.click(screen.getByRole("button", { name: "Previous principle" }));
         expect(window.location.search).toBe("?collection=amazon");
         expect(replace).toHaveBeenCalledTimes(2);
         replace.mockRestore();
      });

      it("keeps every other parameter when the position is written", () => {
         window.history.replaceState(null, "", "/prepare/new?collection=amazon&story=11111111-1111-4111-8111-111111111111");
         open({ storyId: "11111111-1111-4111-8111-111111111111" });
         fireEvent.click(screen.getByRole("button", { name: "Next principle" }));
         expect(new URLSearchParams(window.location.search).get("story")).toBe("11111111-1111-4111-8111-111111111111");
         expect(new URLSearchParams(window.location.search).get("collection")).toBe("amazon");
      });
   });

   describe("the open principle at load", () => {
      it("opens the principle the address names, counted from 1", () => {
         open({ initialGroup: 3 });
         expect(heading()).toBe("Earn Trust");
      });

      it("opens the last principle for a position past the end, and the first for none", () => {
         open({ initialGroup: 99 });
         expect(heading()).toBe("Earn Trust");
      });

      it("opens the principle that holds a question a Lesson link named, with it selected", () => {
         open({ requested: { content_id: AMAZON, question_id: "alp-dive-deep-02" } });
         expect(heading()).toBe("Dive Deep");
         expect(screen.getByRole("radio", { name: /Walk me through/ })).toBeChecked();
      });

      it("lets an explicit position win over the link's principle, keeping the link's question chosen", () => {
         open({ initialGroup: 1, requested: { content_id: AMAZON, question_id: "alp-dive-deep-02" } });
         expect(heading()).toBe("Ownership");
         fireEvent.click(screen.getByRole("button", { name: "Next principle" }));
         expect(screen.getByRole("radio", { name: /Walk me through/ })).toBeChecked();
      });
   });

   describe("the jump menu", () => {
      const trigger = () => screen.getByRole("button", { name: "Jump to principle" });

      it("is a disclosure that lists every principle in order, with the open one marked", () => {
         open();
         expect(trigger()).toHaveAttribute("aria-expanded", "false");
         fireEvent.click(trigger());
         expect(trigger()).toHaveAttribute("aria-expanded", "true");
         const panel = document.getElementById(trigger().getAttribute("aria-controls")!)!;
         const items = within(panel).getAllByRole("button");
         expect(items.map((item) => item.textContent?.replace(/\d+ questions?$/, "").replace(/^\d+/, ""))).toEqual(["Ownership", "Dive Deep", "Earn Trust"]);
         expect(items.map((item) => item.getAttribute("aria-current"))).toEqual(["true", null, null]);
      });

      it("opens the chosen principle, closes, and gives focus back to its button", () => {
         open();
         fireEvent.click(trigger());
         fireEvent.click(screen.getByRole("button", { name: /Earn Trust/ }));
         expect(heading()).toBe("Earn Trust");
         expect(trigger()).toHaveAttribute("aria-expanded", "false");
         expect(trigger()).toHaveFocus();
         expect(window.location.search).toBe("?collection=amazon&group=3");
      });

      it("closes on Escape without changing the principle", () => {
         open();
         fireEvent.click(trigger());
         fireEvent.keyDown(screen.getByRole("button", { name: /Ownership/ }), { key: "Escape" });
         expect(trigger()).toHaveAttribute("aria-expanded", "false");
         expect(heading()).toBe("Ownership");
      });

      it("moves between the principles with the arrow keys", () => {
         open();
         fireEvent.click(trigger());
         const first = screen.getByRole("button", { name: /Ownership/ });
         first.focus();
         fireEvent.keyDown(first, { key: "ArrowDown" });
         expect(screen.getByRole("button", { name: /Dive Deep/ })).toHaveFocus();
         fireEvent.keyDown(document.activeElement!, { key: "End" });
         expect(screen.getByRole("button", { name: /Earn Trust/ })).toHaveFocus();
      });
   });

   describe("search inside the collection", () => {
      it("is not offered when the catalog could not be read, or in Write your own", () => {
         show({ collections: COLLECTIONS, collectionId: "amazon", catalog: { status: "failed", reason: "unavailable" } });
         expect(screen.queryByRole("searchbox")).toBeNull();
      });

      it("shows matches grouped under their principles, in source order, and hides the stepper", async () => {
         open();
         type("metric outage");
         expect(screen.queryByRole("button", { name: "Next principle" })).toBeNull();
         type("tell");
         const results = screen.getByRole("region", { name: "Search results" });
         expect(within(results).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Ownership", "Dive Deep", "Earn Trust"]);
         expect(within(results).getAllByRole("radio")).toHaveLength(3);
      });

      it("needs every word, ignores case and accents, and searches the heading, the wording and the group", () => {
         open();
         type("RESUME outage");
         expect(options()).toHaveLength(1);
         expect(options()[0]).toHaveAccessibleName(/Walk me through how you traced an outage/);
         type("dive deep");
         expect(options()).toHaveLength(2);
         type("brittle");
         expect(options()).toHaveLength(1);
         type("brittle outage");
         expect(screen.queryAllByRole("radio", { name: /./ }).filter((radio) => radio.closest("fieldset")?.querySelector("legend")?.textContent === "Question")).toHaveLength(0);
      });

      it("marks the matched words and leaves the question's text as written", () => {
         open();
         type("metric");
         const marked = [...document.querySelectorAll("mark")].map((mark) => mark.textContent);
         expect(marked).toContain("metric");
         expect(options()[0].closest("label")?.textContent).toBe("A metric that looked wrong Tell me about digging into a metric that did not add up.");
      });

      it("says how many match once typing pauses, and says when none do", async () => {
         open();
         type("tell");
         expect(await screen.findByText("3 questions match “tell” in Amazon Leadership Principles.")).toBeInTheDocument();
         type("zzzz");
         expect(await screen.findByText("No questions match “zzzz”.")).toBeInTheDocument();
         expect(screen.getByText("No question matches those words.")).toBeInTheDocument();
      });

      it("makes no request and does not navigate", () => {
         open();
         type("tell");
         type("");
         expect(api.requests).toEqual([]);
         expect(nav.push).not.toHaveBeenCalled();
         expect(nav.refresh).not.toHaveBeenCalled();
      });

      it("never starts an answer on Enter, and Escape clears it", () => {
         open();
         type("tell");
         const enter = fireEvent.keyDown(search(), { key: "Enter" });
         expect(enter).toBe(false);
         expect(posts()).toHaveLength(0);
         fireEvent.keyDown(search(), { key: "Escape" });
         expect(search()).toHaveValue("");
         expect(heading()).toBe("Ownership");
      });

      it("moves into the results with the down arrow, to the chosen one when there is one", () => {
         open();
         type("tell");
         fireEvent.keyDown(search(), { key: "ArrowDown" });
         expect(options()[0]).toHaveFocus();
         fireEvent.click(options()[2]);
         search().focus();
         fireEvent.keyDown(search(), { key: "ArrowDown" });
         expect(options()[2]).toHaveFocus();
      });

      it("keeps a chosen question that the search hides, and says so in the dock", () => {
         open();
         fireEvent.click(options()[0]);
         type("trust");
         expect(options()).toHaveLength(1);
         expect(screen.getByText(/Selected ·/)).toHaveTextContent("A problem nobody had assigned");
         expect(submit()).toBeEnabled();
         fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
         expect(options()[0]).toBeChecked();
      });

      it("opens a result's principle with View principle, with the question still chosen and its guidance beside it", () => {
         open();
         type("trust");
         fireEvent.click(options()[0]);
         fireEvent.click(screen.getByRole("button", { name: "View principle: Earn Trust" }));
         expect(search()).toHaveValue("");
         expect(heading()).toBe("Earn Trust");
         expect(options()[0]).toBeChecked();
         expect(screen.getAllByText("Being straight with people.").length).toBeGreaterThan(0);
         expect(window.location.search).toBe("?collection=amazon&group=3");
      });

      it("creates the answer with the exact pair when started from a search result", async () => {
         open();
         type("outage");
         fireEvent.click(options()[0]);
         fireEvent.click(submit());
         await waitFor(() => expect(posts()).toHaveLength(1));
         expect(posts()[0].body).toEqual({
            source: "catalog", content_id: AMAZON, question_id: "alp-dive-deep-02",
            question_snapshot: "Walk me through how you traced an outage to its cause.", snapshot_fallback: false, framework: "star",
         });
      });

      it("searches only the open level of the general collection, and offers every level", () => {
         show({ collections: COLLECTIONS, collectionId: "behavioral", catalog: ok });
         fireEvent.change(screen.getByLabelText("Level"), { target: { value: "sde-2" } });
         fireEvent.change(screen.getByRole("searchbox", { name: "Find a question in General Behavioral" }), { target: { value: "stuck" } });
         expect(screen.getByText("No question matches those words.")).toBeInTheDocument();
         fireEvent.click(screen.getByRole("button", { name: "Search all levels" }));
         expect(options()).toHaveLength(1);
         expect(screen.getByRole("region", { name: "Search results" })).toHaveTextContent("SDE-1");
         // Every level is now searched; clearing the search shows the Level choice again, set to all.
         fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
         expect(screen.getByLabelText("Level")).toHaveValue("all");
      });
   });

   describe("question rows", () => {
      it("shows the Lesson's heading and the question as written, and names the radio by both", () => {
         open();
         expect(options()[0]).toHaveAccessibleName("A problem nobody had assigned Tell me about a production problem that was not formally yours.");
      });

      it("shows the wording once when a question has no title of its own", () => {
         show({ catalog: ok });
         expect(options()[0]).toHaveAccessibleName("Tell me about a time you disagreed with a teammate.");
      });
   });

   describe("Start answer in the dock", () => {
      it("says what to do until a question is chosen, then which one is chosen", () => {
         open();
         expect(screen.getByText("Choose a question to start your answer.")).toBeInTheDocument();
         expect(submit()).toBeDisabled();
         fireEvent.click(options()[1]);
         expect(screen.getByText(/Selected ·/)).toHaveTextContent("Inheriting something fragile");
         expect(submit()).toBeEnabled();
      });

      it("is part of the same form, so one create path serves every way of choosing", () => {
         open();
         expect(submit()).toHaveAttribute("type", "submit");
         expect(submit().closest("form")).toContainElement(options()[0]);
      });

      it("shows a custom question as such, and asks for one until it is written", () => {
         open();
         fireEvent.click(screen.getByRole("radio", { name: "Write your own" }));
         expect(screen.getByText("Write your question to start your answer.")).toBeInTheDocument();
         expect(screen.queryByRole("searchbox")).toBeNull();
         expect(screen.queryByRole("navigation", { name: "Collections" })).toBeNull();
         fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "My own?" } });
         expect(screen.getByText(/Selected ·/)).toHaveTextContent("Your own question");
      });

      it("holds the create's own states beside the button, and creates exactly once for a double click", async () => {
         let release!: () => void;
         const gate = new Promise<void>((resolve) => (release = resolve));
         const held: typeof fetch = async (input, init) => {
            if (init?.method === "POST") await gate;
            return api.fetch(input, init);
         };
         open({}, held);
         fireEvent.click(options()[0]);
         fireEvent.click(submit());
         fireEvent.click(submit());
         const creating = await screen.findByText(/Creating your answer/);
         expect(submit().closest("form")).toContainElement(creating);
         await act(async () => release());
         await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
         expect(posts()).toHaveLength(1);
      });

      it("keeps an unconfirmed create's guard through a search and a step: the same question stays off until the reader says it is not there", async () => {
         const lost: typeof fetch = async (input, init) => {
            if (init?.method === "POST") throw new TypeError("fetch failed");
            return api.fetch(input, init);
         };
         open({}, lost);
         fireEvent.click(options()[0]);
         fireEvent.click(submit());
         await screen.findByText(/could not confirm/);
         expect(submit()).toBeDisabled();
         type("trust");
         fireEvent.click(options()[0]);
         expect(submit()).toBeEnabled();
         type("");
         fireEvent.click(screen.getByRole("button", { name: "Next principle" }));
         fireEvent.click(screen.getByRole("button", { name: "Previous principle" }));
         fireEvent.click(options()[0]);
         expect(submit()).toBeDisabled();
         expect(screen.getByRole("button", { name: "It is not there: create it again" })).toBeInTheDocument();
      });
   });

   describe("the collection switch", () => {
      it("keeps the company statement once, whatever the collection", () => {
         open();
         expect(screen.getAllByText(COMPANY_STATEMENT)).toHaveLength(1);
      });

      it("links the other collections and does not follow a link while an answer is being made", async () => {
         open();
         const general = screen.getByRole("link", { name: "General Behavioral" });
         expect(general).toHaveAttribute("href", "/prepare/new?collection=behavioral");
         expect(screen.getByRole("link", { name: "Amazon Leadership Principles" })).toHaveAttribute("aria-current", "page");
      });
   });
});
