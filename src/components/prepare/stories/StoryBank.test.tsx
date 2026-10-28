import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { createPrepClient } from "@/lib/prep/client";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import type { StoryCreate } from "@/lib/prep/types";
import { StoryBank } from "./StoryBank";

const API = "https://api.example.test";

let api: ReturnType<typeof createFakePrepApi>;
let token: string;

beforeEach(() => {
   api = createFakePrepApi();
   token = api.signIn("user-1");
});

const show = (userToken = token) => render(<StoryBank apiUrl={API} getAccessToken={async () => userToken} fetch={api.fetch} />);
const seed = async (body: StoryCreate, userToken = token) => {
   const result = await createPrepClient({ baseUrl: API, getAccessToken: async () => userToken, fetch: api.fetch }).createStory(body);
   expect(result.status).toBe("ok");
   api.requests.length = 0;
};
const reads = () => api.requests.filter(({ method, path }) => method === "GET" && path.startsWith("/stories"));
const cards = () => screen.getAllByRole("listitem").filter((item) => within(item).queryByRole("link"));

describe("Story Bank list", () => {
   it("says so, with a way to add the first story, when the bank is empty", async () => {
      show();
      expect(screen.getByRole("status")).toHaveTextContent("Loading your stories");
      await screen.findByText("Your Story Bank is empty. Add the first experience you want to reuse.");
      expect(screen.getByRole("link", { name: "Add your first story" })).toHaveAttribute("href", "/prepare/stories/new");
      expect(screen.getByRole("link", { name: "New story" })).toHaveAttribute("href", "/prepare/stories/new");
   });

   it("lists each story with its year, tags, link count and a link to open it", async () => {
      await seed({ title: "Migration", framework: "star", year: 2024, tags: ["leadership"] });
      show();
      const link = await screen.findByRole("link", { name: "Migration" });
      expect(link.getAttribute("href")).toMatch(/^\/prepare\/stories\/[0-9a-f-]{36}$/);
      expect(screen.getByText(/2024 · Not linked to an answer/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Filter by tag leadership" })).toBeInTheDocument();
      expect(screen.getByText("1 story")).toBeInTheDocument();
   });

   it("lists only the signed-in reader's stories: another reader's are never shown as theirs", async () => {
      const other = api.signIn("user-2");
      await seed({ title: "Someone else's story", framework: "star" }, other);
      await seed({ title: "Mine", framework: "star" });
      show();
      await screen.findByRole("link", { name: "Mine" });
      expect(screen.queryByText("Someone else's story")).not.toBeInTheDocument();
      expect(reads().every((request) => request.token === token)).toBe(true);
   });

   it("searches with the reader's words and says when nothing matches", async () => {
      await seed({ title: "Migration", framework: "star", fields: { action: "moved the database" } });
      await seed({ title: "Outage", framework: "star" });
      show();
      await screen.findByRole("link", { name: "Outage" });
      fireEvent.change(screen.getByLabelText("Search stories"), { target: { value: "  DATABASE " } });
      fireEvent.click(screen.getByRole("button", { name: "Search" }));
      await waitFor(() => expect(cards()).toHaveLength(1));
      expect(screen.getByRole("link", { name: "Migration" })).toBeInTheDocument();
      expect(reads().at(-1)?.path).toBe("/stories?q=DATABASE&limit=100");
      expect(screen.getByText("1 story match")).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Search stories"), { target: { value: "zzz" } });
      fireEvent.click(screen.getByRole("button", { name: "Search" }));
      await screen.findByText("No stories match your search or filters.");
      fireEvent.click(screen.getAllByRole("button", { name: "Clear search and filters" })[0]);
      await screen.findByRole("link", { name: "Outage" });
      expect(screen.getByLabelText("Search stories")).toHaveValue("");
   });

   it("filters by a tag from a card, removes the filter, and sends every chosen tag", async () => {
      await seed({ title: "A", framework: "star", tags: ["leadership", "data"] });
      await seed({ title: "B", framework: "star", tags: ["data"] });
      show();
      await screen.findByRole("link", { name: "B" });
      fireEvent.click(within(screen.getByRole("list", { name: "Tags on A" })).getByRole("button", { name: "Filter by tag leadership" }));
      await waitFor(() => expect(cards()).toHaveLength(1));
      expect(reads().at(-1)?.path).toBe("/stories?tag=leadership&limit=100");
      fireEvent.click(within(screen.getByRole("list", { name: "Tags on A" })).getByRole("button", { name: "Filter by tag data" }));
      await waitFor(() => expect(reads().at(-1)?.path).toBe("/stories?tag=leadership&tag=data&limit=100"));
      fireEvent.click(screen.getByRole("button", { name: "Remove filter leadership" }));
      await waitFor(() => expect(cards()).toHaveLength(2));
   });

   it("says the list is partial when the API holds more than it was asked for", async () => {
      await seed({ title: "A", framework: "star" });
      const partial = (async (input: RequestInfo | URL, init?: RequestInit) => {
         const response = await api.fetch(input, init);
         const body = await response.json();
         return new Response(JSON.stringify({ ...body, total: 240 }), { status: 200 });
      }) as typeof fetch;
      render(<StoryBank apiUrl={API} getAccessToken={async () => token} fetch={partial} />);
      await screen.findByText("Showing the first 1 of 240 stories. Search or filter to narrow them.");
   });

   it("shows a failed read as an error with a retry, never as an empty bank", async () => {
      api.failNext(500);
      show();
      await screen.findByText("We could not reach the preparation service.");
      expect(screen.queryByText(/Your Story Bank is empty/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await screen.findByText("Your Story Bank is empty. Add the first experience you want to reuse.");
   });

   it("asks to sign in again when the session has ended, returning to the Story Bank", async () => {
      show("expired-token");
      await screen.findByText(/Your session has ended/);
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", `/login?redirect=${encodeURIComponent("/prepare/stories")}`);
   });

   it("says the workspace is unavailable when the API answers not found, and when the environment has no API", async () => {
      api.setEnabled(false);
      show();
      await screen.findByText("The Story Bank is not available right now.");
      render(<StoryBank apiUrl={null} />);
      expect(screen.getByText("The preparation service is not configured for this environment.")).toBeInTheDocument();
   });
});
