import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPrepClient } from "@/lib/prep/client";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import { forgetItemStateAvailability } from "./itemStateAvailable";
import { ReaderControls } from "./ReaderControls";

const BASE = "https://api.example.test";
const LESSON = "lesson.dynamic-batching";
const PROBLEM = "problem.rate-limiter";

type Options = { signedIn?: boolean; continuity?: boolean; enabled?: boolean; id?: string; fetch?: (api: ReturnType<typeof createFakePrepApi>) => typeof fetch };

function setup({ signedIn = true, continuity = true, enabled = true, id = LESSON, fetch: wrap }: Options = {}) {
   const api = createFakePrepApi({ continuity, enabled });
   const token = signedIn ? api.signIn("ada") : null;
   const fetchImpl = wrap ? wrap(api) : api.fetch;
   const getAccessToken = async () => token;
   const view = render(
      <>
         <p>Reader body</p>
         <ReaderControls contentId={id} apiUrl={BASE} getAccessToken={getAccessToken} fetch={fetchImpl} />
      </>
   );
   /** Another browser context of the same learner. */
   const other = createPrepClient({ baseUrl: BASE, getAccessToken, fetch: api.fetch });
   return { api, view, other };
}

const calls = (api: ReturnType<typeof createFakePrepApi>) => api.requests.map(({ method, path }) => `${method} ${path}`);
const complete = () => screen.getByRole("button", { name: "Mark complete" });
const bookmark = () => screen.getByRole("button", { name: "Bookmark" });
const loaded = () => waitFor(() => expect(complete()).toBeEnabled());
const click = async (button: HTMLElement) => {
   await act(async () => {
      fireEvent.click(button);
   });
};

beforeEach(() => forgetItemStateAvailability());
afterEach(() => {
   window.localStorage.clear();
   window.sessionStorage.clear();
});

describe("when M2 is on and the reader is signed in", () => {
   it("shows completion and bookmark on a Lesson, off, after asking features, recording the visit and reading the item", async () => {
      const { api } = setup();
      await loaded();
      expect(screen.getByRole("group", { name: "Lesson actions" })).toBeInTheDocument();
      expect(complete()).toHaveAttribute("aria-pressed", "false");
      expect(bookmark()).toHaveAttribute("aria-pressed", "false");
      expect(calls(api)).toEqual(["GET /features", `POST /item-state/${LESSON}/visit`, `GET /item-state/${LESSON}`]);
   });

   it("shows the same two controls on a Problem", async () => {
      setup({ id: PROBLEM });
      await loaded();
      expect(screen.getByRole("group", { name: "Problem actions" })).toBeInTheDocument();
      expect(bookmark()).toBeEnabled();
   });

   it("keeps the buttons in place, disabled and busy, while the state loads", async () => {
      setup({ fetch: (api) => ((input, init) => (String(input).endsWith(LESSON) ? new Promise<Response>(() => {}) : api.fetch(input, init))) as typeof fetch });
      await waitFor(() => expect(complete()).toBeInTheDocument());
      expect(complete()).toBeDisabled();
      expect(complete()).toHaveAttribute("aria-busy", "true");
      expect(screen.getByText("Reader body")).toBeInTheDocument();
   });
});

describe("completion", () => {
   it("marks complete with the version just read, then clears it", async () => {
      const { api, other } = setup();
      await loaded();
      await click(complete());
      expect(complete()).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("status")).toHaveTextContent("Saved");
      expect(api.requests.at(-1)).toMatchObject({ method: "PATCH", path: `/item-state/${LESSON}`, body: { version: 1, completed: true } });
      expect(await other.getItemState(LESSON)).toMatchObject({ status: "ok", data: { version: 2, completed_at: expect.any(String) } });

      await click(complete());
      expect(complete()).toHaveAttribute("aria-pressed", "false");
      expect(api.requests.at(-1)?.body).toEqual({ version: 2, completed: false });
      expect(await other.getItemState(LESSON)).toMatchObject({ data: { version: 3, completed_at: null } });
   });

   it("ignores a second press while the first is pending", async () => {
      const { api } = setup();
      await loaded();
      await act(async () => {
         fireEvent.click(complete());
         fireEvent.click(complete());
         fireEvent.click(bookmark());
      });
      expect(calls(api).filter((call) => call.startsWith("PATCH"))).toHaveLength(1);
   });

   it("keeps focus on the control after a save", async () => {
      setup();
      await loaded();
      complete().focus();
      await click(complete());
      expect(complete()).toHaveFocus();
   });
});

describe("bookmark", () => {
   it("bookmarks and unbookmarks, and a reload shows the saved state", async () => {
      const { api, view, other } = setup();
      await loaded();
      await click(bookmark());
      expect(bookmark()).toHaveAttribute("aria-pressed", "true");
      expect(api.requests.at(-1)?.body).toEqual({ version: 1, bookmarked: true });

      view.unmount();
      forgetItemStateAvailability();
      render(<ReaderControls contentId={LESSON} apiUrl={BASE} getAccessToken={async () => api.signIn("ada")} fetch={api.fetch} />);
      await waitFor(() => expect(bookmark()).toHaveAttribute("aria-pressed", "true"));

      await click(bookmark());
      expect(bookmark()).toHaveAttribute("aria-pressed", "false");
      expect(await other.getItemState(LESSON)).toMatchObject({ data: { bookmarked_at: null } });
   });
});

describe("a change made in another context", () => {
  it("is shown, not overwritten, when the version is stale", async () => {
      const { api, other } = setup();
      await loaded();
      await other.updateItemState(LESSON, { version: 1, bookmarked: true });

      await click(complete());
      expect(screen.getByRole("status")).toHaveTextContent("This changed elsewhere");
      expect(complete()).toHaveAttribute("aria-pressed", "false");
      expect(bookmark()).toHaveAttribute("aria-pressed", "true");
      expect(await other.getItemState(LESSON)).toMatchObject({ data: { completed_at: null, bookmarked_at: expect.any(String), version: 2 } });

      await click(complete());
      expect(complete()).toHaveAttribute("aria-pressed", "true");
      expect(api.requests.at(-1)?.body).toEqual({ version: 2, completed: true });
   });
});

describe("last visited", () => {
   it("is recorded once per open, however often the effect or the page runs again", async () => {
      const { api, view } = setup();
      await loaded();
      await click(complete());
      view.rerender(<ReaderControls contentId={LESSON} apiUrl={BASE} getAccessToken={async () => "x"} fetch={api.fetch} />);
      expect(calls(api).filter((call) => call.endsWith("/visit"))).toHaveLength(1);
   });

   it("is recorded once under React Strict Mode", async () => {
      const api = createFakePrepApi();
      const token = api.signIn("ada");
      render(
         <StrictMode>
            <ReaderControls contentId={LESSON} apiUrl={BASE} getAccessToken={async () => token} fetch={api.fetch} />
         </StrictMode>
      );
      await loaded();
      expect(calls(api).filter((call) => call.endsWith("/visit"))).toHaveLength(1);
      expect(complete()).toBeEnabled();
   });

   it("sends no body, does not change the version, and a later open still reads and writes", async () => {
      const first = setup();
      await loaded();
      expect(first.api.requests.find(({ path }) => path.endsWith("/visit"))?.body).toBeUndefined();
      first.view.unmount();
      forgetItemStateAvailability();
      render(<ReaderControls contentId={LESSON} apiUrl={BASE} getAccessToken={async () => first.api.signIn("ada")} fetch={first.api.fetch} />);
      await loaded();
      await click(complete());
      expect(first.api.requests.at(-1)?.body).toEqual({ version: 1, completed: true });
   });

   it("does not stop the controls when the visit fails", async () => {
      setup({ fetch: (api) => ((input, init) => (String(input).endsWith("/visit") ? Promise.reject(new TypeError("offline")) : api.fetch(input, init))) as typeof fetch });
      await loaded();
      expect(screen.getByText("Reader body")).toBeInTheDocument();
   });
});

describe("failures", () => {
   it("offers a retry when the item cannot be read, and the reader body stays", async () => {
      let fail = true;
      setup({ fetch: (api) => ((input, init) => (fail && String(input).endsWith(LESSON) ? Promise.resolve(new Response("{}", { status: 500 })) : api.fetch(input, init))) as typeof fetch });
      await screen.findByText("Couldn't load your saved state.");
      expect(screen.getByText("Reader body")).toBeInTheDocument();
      fail = false;
      await click(screen.getByRole("button", { name: "Try again" }));
      await loaded();
      expect(screen.queryByText("Couldn't load your saved state.")).not.toBeInTheDocument();
   });

   it("says a save failed, keeps the saved state and lets the learner try again", async () => {
      const { api } = setup();
      await loaded();
      api.failNext("network");
      await click(complete());
      expect(screen.getByRole("status")).toHaveTextContent("Couldn't save the completion");
      expect(complete()).toHaveAttribute("aria-pressed", "false");
      await click(complete());
      expect(complete()).toHaveAttribute("aria-pressed", "true");
   });

   it("hides the controls when the server stops offering item state", async () => {
      const { api } = setup();
      await loaded();
      api.setContinuity(false);
      await click(complete());
      expect(screen.queryByRole("group")).not.toBeInTheDocument();
   });
});

describe("when the controls must not appear", () => {
   it("signed out: renders nothing and sends no request", async () => {
      const { api, view } = setup({ signedIn: false });
      await act(async () => {});
      expect(view.container.querySelector("[data-reader-controls]")).toBeNull();
      expect(api.requests).toEqual([]);
   });

   it("M2 off: asks features only, renders nothing and never calls an item-state route", async () => {
      const { api, view } = setup({ continuity: false });
      await act(async () => {});
      expect(view.container.querySelector("[data-reader-controls]")).toBeNull();
      expect(calls(api)).toEqual(["GET /features"]);
   });

   it("the feature answer cannot be read: fails closed, makes no item-state request, asks again next time", async () => {
      const api = createFakePrepApi();
      const token = api.signIn("ada");
      api.failNext(500);
      const props = { contentId: LESSON, apiUrl: BASE, getAccessToken: async () => token, fetch: api.fetch };
      const first = render(<ReaderControls {...props} />);
      await act(async () => {});
      expect(first.container.querySelector("[data-reader-controls]")).toBeNull();
      expect(calls(api)).toEqual(["GET /features"]);
      first.unmount();
      render(<ReaderControls {...props} />);
      await loaded();
      expect(calls(api).filter((call) => call === "GET /features")).toHaveLength(2);
   });

   it("PREP off: a 404 on features is read as not available", async () => {
      const { api, view } = setup({ enabled: false });
      await act(async () => {});
      expect(view.container.querySelector("[data-reader-controls]")).toBeNull();
      expect(calls(api)).toEqual(["GET /features"]);
   });

   it("without an API origin: renders nothing and sends nothing", async () => {
      const api = createFakePrepApi();
      const { container } = render(<ReaderControls contentId={LESSON} apiUrl={null} getAccessToken={async () => api.signIn("ada")} fetch={api.fetch} />);
      await act(async () => {});
      expect(container).toBeEmptyDOMElement();
      expect(api.requests).toEqual([]);
   });
});

describe("nothing is kept in the browser", () => {
   it("writes no storage or cookie while reading, visiting, completing and bookmarking", async () => {
      setup();
      await loaded();
      await click(complete());
      await click(bookmark());
      expect(window.localStorage.length).toBe(0);
      expect(window.sessionStorage.length).toBe(0);
      expect(document.cookie).toBe("");
      expect(window.location.search + window.location.hash).toBe("");
   });
});
