import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ headers: null as Headers | null }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
   headers: async () => {
      if (!request.headers) throw new Error("outside a request scope");
      return request.headers;
   },
}));

import { ITEM_READ_BUDGET_MS, itemReadBudgetMs, withinItemBudget } from "./itemRead";

const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const never = () => new Promise<never>(() => {});

describe("itemReadBudgetMs", () => {
   it("defaults to the item budget, honours a usable override and `off`, and ignores anything below the floor", () => {
      expect(itemReadBudgetMs(undefined)).toBe(ITEM_READ_BUDGET_MS);
      expect(itemReadBudgetMs("2500")).toBe(2500);
      expect(itemReadBudgetMs(" OFF ")).toBeNull();
      expect(itemReadBudgetMs("50")).toBe(ITEM_READ_BUDGET_MS);
      expect(itemReadBudgetMs("soon")).toBe(ITEM_READ_BUDGET_MS);
   });
});

describe("withinItemBudget", () => {
   beforeEach(() => vi.useFakeTimers());
   afterEach(() => {
      vi.useRealTimers();
      request.headers = null;
   });

   it("stops waiting for a browser at the deadline, without settling on anything", async () => {
      request.headers = new Headers({ "user-agent": BROWSER, "sec-fetch-mode": "navigate" });
      const answer = withinItemBudget(never());
      await vi.advanceTimersByTimeAsync(ITEM_READ_BUDGET_MS);
      await expect(answer).resolves.toEqual({ settled: false });
   });

   it("passes on an answer that arrives in time, including a not-found one", async () => {
      request.headers = new Headers({ "user-agent": BROWSER, "sec-fetch-mode": "navigate" });
      await expect(withinItemBudget(Promise.resolve({ status: "notFound" }))).resolves.toEqual({ settled: true, value: { status: "notFound" } });
   });

   it("waits as long as the read takes for a crawler, a request without Sec-Fetch-Mode, or no request at all", async () => {
      for (const headers of [new Headers({ "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)", "sec-fetch-mode": "navigate" }), new Headers({ "user-agent": "curl/8.5.0" }), null]) {
         request.headers = headers;
         let answered = false;
         const read = new Promise<string>((resolve) => setTimeout(() => resolve("late"), ITEM_READ_BUDGET_MS * 4));
         const answer = withinItemBudget(read).then((value) => ((answered = true), value));
         await vi.advanceTimersByTimeAsync(ITEM_READ_BUDGET_MS * 2);
         expect(answered).toBe(false);
         await vi.advanceTimersByTimeAsync(ITEM_READ_BUDGET_MS * 2);
         await expect(answer).resolves.toEqual({ settled: true, value: "late" });
      }
   });
});
