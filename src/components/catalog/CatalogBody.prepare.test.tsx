import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogHeading } from "@/lib/catalog/types";

vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => null }));

const auth = vi.hoisted(() => ({
   session: null as unknown,
   listener: null as ((event: string, session: unknown) => void) | null,
   unsubscribe: vi.fn(),
   fail: false,
}));
vi.mock("@/lib/supabase/client", () => ({
   createClient: () => {
      if (auth.fail) throw new Error("Supabase is not configured");
      return {
         auth: {
            getSession: async () => ({ data: { session: auth.session } }),
            onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
               auth.listener = listener;
               return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
            },
         },
      };
   },
}));

import { CatalogBody } from "./CatalogBody";

const h = (id: string, text: string, authored: boolean): CatalogHeading => ({ id, level: 2, text, authored });
const TEXT = [
   "## What fits at this level",
   "",
   "Prose.",
   "",
   "## Being stuck {#being-stuck}",
   "",
   'The question: "Tell me about a time you were stuck."',
   "",
   "## Worked example: a stuck story",
   "",
   'The question: "Tell me about a time you were stuck."',
   "",
   "## Feedback {#feedback}",
   "",
   'The question: "Tell me about feedback you got."',
   "",
].join("\n");
const HEADINGS = [
   h("what-fits-at-this-level", "What fits at this level", false),
   h("being-stuck", "Being stuck", true),
   h("worked-example-a-stuck-story", "Worked example: a stuck story", false),
   h("feedback", "Feedback", true),
];
const LESSON = "lesson.behavioral-prep-sde-1";
const prepare = { contentId: LESSON, questionIds: new Set(["being-stuck", "feedback"]) };
const body = { format: "markdown@1" as const, text: TEXT };

const draw = (reading: { prepare?: typeof prepare }) =>
   render(<CatalogBody body={body} reading={{ headings: HEADINGS, ...reading }} />);

beforeEach(() => {
   auth.session = null;
   auth.listener = null;
   auth.fail = false;
   auth.unsubscribe.mockReset();
});

describe("Prepare your answer on a Lesson", () => {
   it("is one link per question section for a signed-in reader, naming the exact pair", async () => {
      auth.session = { access_token: "t" };
      draw({ prepare });
      const links = await screen.findAllByRole("link", { name: /^Prepare your answer/ });
      expect(links.map((link) => link.getAttribute("href"))).toEqual([
         `/prepare/new?content=${LESSON}&question=being-stuck`,
         `/prepare/new?content=${LESSON}&question=feedback`,
      ]);
      expect(links[0]).toHaveAccessibleName("Prepare your answer: Being stuck");
      expect(links[0]).toHaveTextContent("Prepare your answer");
      expect(links[0].closest("p")?.previousElementSibling).toHaveAttribute("id", "being-stuck");
   });

   it("is absent from the excluded sections and from any heading the source did not recognise", async () => {
      auth.session = { access_token: "t" };
      draw({ prepare });
      await screen.findAllByRole("link", { name: /^Prepare your answer/ });
      for (const id of ["what-fits-at-this-level", "worked-example-a-stuck-story"]) {
         expect(document.getElementById(id)?.nextElementSibling?.textContent).not.toContain("Prepare your answer");
      }
      expect(screen.getAllByRole("link", { name: /^Prepare your answer/ })).toHaveLength(2);
   });

   it("leaves the markup of a signed-out reader exactly as it is without the feature", async () => {
      const plain = draw({}).container.innerHTML;
      document.body.innerHTML = "";
      const { container } = draw({ prepare });
      await act(async () => {});
      expect(container.innerHTML).toBe(plain);
      expect(screen.queryByRole("link", { name: /Prepare your answer/ })).toBeNull();
   });

   it("renders nothing without the feature, even for a signed-in reader, and never reads the session", async () => {
      auth.session = { access_token: "t" };
      const { container } = draw({});
      await act(async () => {});
      expect(screen.queryByRole("link", { name: /Prepare your answer/ })).toBeNull();
      expect(container.querySelector("[data-catalog-body]")).not.toBeNull();
      expect(auth.listener).toBeNull();
   });

   it("appears when the reader signs in and goes when they sign out, without a reload", async () => {
      draw({ prepare });
      await act(async () => {});
      expect(screen.queryByRole("link", { name: /Prepare your answer/ })).toBeNull();
      act(() => auth.listener?.("SIGNED_IN", { access_token: "t" }));
      expect(await screen.findAllByRole("link", { name: /^Prepare your answer/ })).toHaveLength(2);
      act(() => auth.listener?.("SIGNED_OUT", null));
      await waitFor(() => expect(screen.queryByRole("link", { name: /Prepare your answer/ })).toBeNull());
   });

   it("shows nothing when the session cannot be read, and stops listening on unmount", async () => {
      auth.fail = true;
      draw({ prepare });
      await act(async () => {});
      expect(screen.queryByRole("link", { name: /Prepare your answer/ })).toBeNull();

      auth.fail = false;
      const { unmount } = draw({ prepare });
      await act(async () => {});
      unmount();
      expect(auth.unsubscribe).toHaveBeenCalled();
   });
});
