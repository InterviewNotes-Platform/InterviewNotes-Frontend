import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
   hasSession: vi.fn(),
   notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
   }),
   redirect: vi.fn((to: string) => {
      throw new Error(`NEXT_REDIRECT ${to}`);
   }),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/app/prepare/hasSession", () => ({ hasSession: mocks.hasSession }));

import { HistoryRoute } from "@/components/practice-workspace/HistoryRoute";
import { PracticeGate } from "@/components/practice-workspace/PracticeGate";
import Layout, * as layoutModule from "./layout";
import Page, * as pageModule from "./page";

beforeEach(() => {
   vi.unstubAllEnvs();
   vi.clearAllMocks();
   mocks.hasSession.mockResolvedValue(true);
});

describe("the history route boundary", () => {
   it("is dynamic, private and not indexed, and is never statically generated or revalidated", () => {
      expect(layoutModule.dynamic).toBe("force-dynamic");
      expect(pageModule.dynamic).toBe("force-dynamic");
      expect(layoutModule.metadata.robots).toEqual({ index: false, follow: false });
      for (const banned of ["generateStaticParams", "revalidate", "fetchCache", "dynamicParams"]) {
         expect(layoutModule).not.toHaveProperty(banned);
         expect(pageModule).not.toHaveProperty(banned);
      }
   });

   it("is not found for everyone while the frontend flag is off, before any session is read", async () => {
      expect(() => Layout({ children: null })).toThrow("NEXT_NOT_FOUND");
      await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
      expect(mocks.hasSession).not.toHaveBeenCalled();
   });

   it("sends a signed-out visitor to sign in and returns them here", async () => {
      vi.stubEnv("NEXT_PUBLIC_PRACTICE_ENABLED", "true");
      expect(Layout({ children: "x" })).toBe("x");
      mocks.hasSession.mockResolvedValue(false);
      await expect(Page()).rejects.toThrow("NEXT_REDIRECT /login?redirect=%2Fpractice%2Fhistory");
   });

   it("renders only the gate around the list: no attempt data is in the server's answer", async () => {
      vi.stubEnv("NEXT_PUBLIC_PRACTICE_ENABLED", "true");
      vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
      const element = await Page();
      expect(element.type).toBe(PracticeGate);
      expect(element.props.apiUrl).toBe("https://api.example.test");
      expect(element.props.children.type).toBe(HistoryRoute);
      expect(element.props.children.props).toEqual({});
   });
});
