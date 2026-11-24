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

import { PracticeGate } from "@/components/practice-workspace/PracticeGate";
import Layout, * as layoutModule from "./layout";
import Page, * as pageModule from "./[id]/page";

const params = Promise.resolve({ id: "3f2c9d5e-0000-4000-8000-000000000001" });

beforeEach(() => {
   vi.unstubAllEnvs();
   vi.clearAllMocks();
   mocks.hasSession.mockResolvedValue(true);
});

describe("the attempts route boundary", () => {
   it("is dynamic and not indexed, as every per-user route is", () => {
      expect(layoutModule.dynamic).toBe("force-dynamic");
      expect(pageModule.dynamic).toBe("force-dynamic");
      expect(layoutModule.metadata.robots).toEqual({ index: false, follow: false });
      for (const banned of ["generateStaticParams", "revalidate", "fetchCache", "dynamicParams"]) {
         expect(layoutModule).not.toHaveProperty(banned);
         expect(pageModule).not.toHaveProperty(banned);
      }
   });

   it("is not found for everyone while the frontend flag is off (the default)", async () => {
      expect(() => Layout({ children: null })).toThrow("NEXT_NOT_FOUND");
      await expect(Page({ params })).rejects.toThrow("NEXT_NOT_FOUND");
      expect(mocks.hasSession).not.toHaveBeenCalled(); // before any session is read
   });

   it("lets the layout through when the flag is on, and sends a signed-out visitor to sign in", async () => {
      vi.stubEnv("NEXT_PUBLIC_PRACTICE_ENABLED", "true");
      expect(Layout({ children: "x" })).toBe("x");
      mocks.hasSession.mockResolvedValue(false);
      await expect(Page({ params })).rejects.toThrow("NEXT_REDIRECT /login?redirect=%2Fpractice%2Fattempts%2F3f2c9d5e-0000-4000-8000-000000000001");
   });

   it("renders only the gate, which holds nothing back from the backend's answer", async () => {
      vi.stubEnv("NEXT_PUBLIC_PRACTICE_ENABLED", "true");
      vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
      const element = await Page({ params });
      expect(element.type).toBe(PracticeGate);
      expect(element.props).toEqual({ apiUrl: "https://api.example.test" });
   });
});
