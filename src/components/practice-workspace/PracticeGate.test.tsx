import type { ComponentProps } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFakePracticeApi } from "@/lib/practice-workspace/fakeApi";

vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});

import { PracticeGate } from "./PracticeGate";

const API = "https://api.example.test";
const CHILD = <p>the workspace</p>;

function gate(options: Parameters<typeof createFakePracticeApi>[0] & { signedIn?: boolean; apiUrl?: string | null } = {}) {
   const api = createFakePracticeApi(options);
   const token = options.signedIn === false ? null : api.signIn("ada");
   const view = render(
      <PracticeGate apiUrl={options.apiUrl === undefined ? API : options.apiUrl} getAccessToken={async () => token} fetch={api.fetch}>
         {CHILD}
      </PracticeGate>
   );
   return { api, view };
}

describe("the practice route boundary", () => {
   it("says it is checking, then that practice is unavailable, when the backend offers nothing (every T06 answer)", async () => {
      gate();
      expect(screen.getByRole("status")).toHaveTextContent("Checking");
      await screen.findByText("Practice is not available right now.");
      expect(screen.queryByText("the workspace")).not.toBeInTheDocument();
   });

   it("links back to the Problems without prefetching", async () => {
      gate();
      const link = await screen.findByRole("link", { name: "Browse Problems" });
      expect(link).toHaveAttribute("href", "/practice");
      expect(link).toHaveAttribute("data-prefetch", "false");
   });

   it("shows its children only when the backend says practice is available", async () => {
      gate({ capability: { practice_available: true } });
      await screen.findByText("the workspace");
   });

   it.each([
      ["the master flag is off", { enabled: false }],
      ["the caller is outside the rollout", { admitted: false }],
   ])("keeps the children away when %s, whatever the frontend flag says", async (_name, options) => {
      vi.stubEnv("NEXT_PUBLIC_PRACTICE_ENABLED", "true");
      gate({ ...options, capability: { practice_available: true } });
      await screen.findByText("Practice is not available right now.");
      expect(screen.queryByText("the workspace")).not.toBeInTheDocument();
      vi.unstubAllEnvs();
   });

   it("is unavailable on a network failure and when no API is configured", async () => {
      const failing = createFakePracticeApi();
      failing.failNext("network");
      render(<PracticeGate apiUrl={API} getAccessToken={async () => failing.signIn("ada")} fetch={failing.fetch} />);
      await screen.findByText("Practice is not available right now.");

      gate({ apiUrl: null });
      expect(screen.getAllByText("Practice is not available right now.")).toHaveLength(2);
   });

   it("asks a signed-out caller to sign in, without prefetching, and sends nothing", async () => {
      const { api } = gate({ signedIn: false });
      const link = await screen.findByRole("link", { name: "Sign in" });
      expect(link).toHaveAttribute("href", "/login?redirect=%2Fpractice");
      expect(link).toHaveAttribute("data-prefetch", "false");
      expect(api.requests).toHaveLength(0);
   });

   it("asks the backend once and keeps nothing in the browser", async () => {
      const { api } = gate();
      await waitFor(() => expect(api.requests).toHaveLength(1));
      expect(api.requests[0]).toMatchObject({ method: "GET", route: "capability" });
      expect(localStorage.length + sessionStorage.length).toBe(0);
      expect(document.cookie).toBe("");
   });
});
