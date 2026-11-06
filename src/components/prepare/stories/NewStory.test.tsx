import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import { NewStory } from "./NewStory";

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

const show = (fetch: typeof globalThis.fetch = api.fetch, userToken = token) => render(<NewStory apiUrl={API} getAccessToken={async () => userToken} fetch={fetch} />);
const posts = () => api.requests.filter(({ method }) => method === "POST");
const create = () => fireEvent.click(screen.getByRole("button", { name: "Create story" }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });

describe("New story", () => {
   it("creates the story the reader wrote, with its tags, and opens it only after the API answered", async () => {
      show();
      type("Title", "  Outage  ");
      type("Year", "2023");
      type("Situation", "The queue stalled");
      type("Result", "Fixed in an hour");
      const tags = screen.getByLabelText(/^Tags/, { selector: "input" });
      fireEvent.change(tags, { target: { value: "Reliability, ops" } });
      fireEvent.keyDown(tags, { key: "Enter" });
      expect(screen.getByRole("list", { name: "Tags on this story" })).toHaveTextContent("reliabilityops");
      create();
      await waitFor(() => expect(nav.push).toHaveBeenCalledOnce());
      expect(posts()).toHaveLength(1);
      expect(posts()[0].body).toEqual({
         title: "Outage",
         framework: "star",
         notes: "",
         year: 2023,
         fields: { situation: "The queue stalled", result: "Fixed in an hour" },
         tags: ["reliability", "ops"],
      });
      expect(nav.push.mock.calls[0][0]).toMatch(/^\/prepare\/stories\/[0-9a-f-]{36}$/);
   });

   it("does not drop a tag typed but not yet added when the reader moves on", async () => {
      show();
      type("Title", "T");
      const tags = screen.getByLabelText(/^Tags/, { selector: "input" });
      fireEvent.change(tags, { target: { value: "kept" } });
      fireEvent.blur(tags);
      create();
      await waitFor(() => expect(posts()).toHaveLength(1));
      expect((posts()[0].body as { tags: string[] }).tags).toEqual(["kept"]);
   });

   it("removes a tag", () => {
      show();
      const tags = screen.getByLabelText(/^Tags/, { selector: "input" });
      fireEvent.change(tags, { target: { value: "a, b" } });
      fireEvent.keyDown(tags, { key: "Enter" });
      fireEvent.click(screen.getByRole("button", { name: "Remove tag a" }));
      expect(screen.getByRole("list", { name: "Tags on this story" })).toHaveTextContent("b");
      expect(screen.queryByRole("button", { name: "Remove tag a" })).not.toBeInTheDocument();
   });

   it("keeps free-form notes and STAR text both when the format is switched, and saves both", async () => {
      show();
      type("Title", "T");
      type("Action", "Led it");
      fireEvent.click(screen.getByRole("radio", { name: "Free-form" }));
      expect(screen.getByLabelText("STAR notes")).toHaveValue("Action\nLed it");
      type("Notes", "In prose");
      create();
      await waitFor(() => expect(posts()).toHaveLength(1));
      expect(posts()[0].body).toMatchObject({ framework: "free_form", notes: "In prose", fields: { action: "Led it" } });
   });

   it("asks for a title and a valid year before sending anything", async () => {
      show();
      type("Year", "99");
      create();
      expect(await screen.findByText("Enter a title.")).toBeInTheDocument();
      expect(screen.getByText(/Enter a year from 1900 to 2100/)).toBeInTheDocument();
      expect(posts()).toHaveLength(0);
   });

   it("shows the server's refusal against the field and keeps every word the reader wrote", async () => {
      show();
      type("Title", "T");
      type("Situation", "x".repeat(20001));
      create();
      expect(await screen.findByText("This is too long to save.")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Nothing was saved; your text is still here.");
      expect(screen.getByLabelText(/^Title/)).toHaveValue("T");
      expect(nav.push).not.toHaveBeenCalled();
   });

   it("shows a server error as not saved, and a second Create sends again", async () => {
      show();
      type("Title", "T");
      api.failNext(500);
      create();
      expect(await screen.findByText(/Nothing was saved; your text is still here/)).toBeInTheDocument();
      expect(nav.push).not.toHaveBeenCalled();
      create();
      await waitFor(() => expect(nav.push).toHaveBeenCalledOnce());
   });

   it("does not claim success or allow a second create after a create of unknown outcome", async () => {
      show();
      type("Title", "T");
      api.failNext("network");
      create();
      await screen.findByText(/We could not confirm that the story was saved/);
      expect(screen.getByRole("link", { name: "your Story Bank" })).toHaveAttribute("href", "/prepare/stories");
      create();
      await act(async () => {});
      expect(posts()).toHaveLength(1);
      expect(nav.push).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: /Allow creating again/ }));
      create();
      await waitFor(() => expect(nav.push).toHaveBeenCalledOnce());
      expect(posts()).toHaveLength(2);
   });

   it("takes no second create while the first is open", async () => {
      let release: () => void = () => {};
      const slow = ((input: RequestInfo | URL, init?: RequestInit) =>
         new Promise<Response>((resolve) => (release = () => void api.fetch(input, init).then(resolve)))) as typeof globalThis.fetch;
      show(slow);
      type("Title", "T");
      create();
      await screen.findByText(/Creating your story/);
      const busy = screen.getByRole("button", { name: "Creating…" });
      fireEvent.click(busy);
      expect(busy).toHaveAttribute("aria-disabled", "true");
      await act(async () => release());
      await waitFor(() => expect(nav.push).toHaveBeenCalledOnce());
      expect(posts()).toHaveLength(1);
   });

   it("asks to sign in again when the session has ended, without saying the story was saved", async () => {
      show(api.fetch, "expired-token");
      type("Title", "T");
      create();
      await screen.findByText(/Your session has ended/);
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", `/login?redirect=${encodeURIComponent("/prepare/stories/new")}`);
      expect(nav.push).not.toHaveBeenCalled();
   });

   it("says the service is not configured when the environment has no API", () => {
      render(<NewStory apiUrl={null} />);
      expect(screen.getByRole("alert")).toHaveTextContent("not configured");
   });
});
