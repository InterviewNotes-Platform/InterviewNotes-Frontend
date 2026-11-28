import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RETRY_AFTER_SECONDS, coldStartGate, isItemRoute, resetApiReadiness } from "./coldStart";

const API = "http://api.test";
const env = { API_URL: API };

function respondAfter(ms: number, status = 200) {
   return vi.fn(() => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response("{}", { status })), ms)));
}

describe("coldStartGate", () => {
   beforeEach(() => {
      vi.useFakeTimers();
      resetApiReadiness();
   });
   afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
   });

   it("gates only the item and Track detail pages", () => {
      for (const path of ["/lessons/a", "/problems/b", "/knowledge/c", "/tracks/d", "/tracks/d/"]) expect(isItemRoute(path)).toBe(true);
      for (const path of ["/", "/tracks", "/knowledge", "/lessons/a/b", "/prepare", "/practice/x", "/login"]) expect(isItemRoute(path)).toBe(false);
   });

   it("lets the page render when the API answers within the budget", async () => {
      const fetch = respondAfter(100);
      vi.stubGlobal("fetch", fetch);
      const gate = coldStartGate("GET", "/lessons/a", env);
      await vi.advanceTimersByTimeAsync(100);
      expect(await gate).toBeNull();
      expect(fetch).toHaveBeenCalledWith(`${API}/content/health`, expect.objectContaining({ cache: "no-store" }));
   });

   it("answers a temporary 503 that names nothing, is never stored or indexed, and says when to retry", async () => {
      vi.stubGlobal("fetch", respondAfter(8000));
      const gate = coldStartGate("GET", "/problems/secret-slug", env);
      await vi.advanceTimersByTimeAsync(5000);
      const res = (await gate)!;
      expect(res.status).toBe(503);
      expect(res.headers.get("retry-after")).toBe(String(RETRY_AFTER_SECONDS));
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      const html = await res.text();
      expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(html).toContain('role="status"');
      expect(html).toContain("<noscript>");
      expect(html).not.toContain("secret-slug");
   });

   it("keeps waking the API after the budget, so the retry finds it awake without a second probe", async () => {
      const fetch = respondAfter(8000);
      vi.stubGlobal("fetch", fetch);
      const first = coldStartGate("GET", "/lessons/a", env);
      await vi.advanceTimersByTimeAsync(5000);
      expect((await first)?.status).toBe(503);
      await vi.advanceTimersByTimeAsync(3000);
      expect(await coldStartGate("GET", "/lessons/a", env)).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(1);
   });

   it("shares one probe between concurrent requests", async () => {
      const fetch = respondAfter(8000);
      vi.stubGlobal("fetch", fetch);
      const gates = [coldStartGate("GET", "/lessons/a", env), coldStartGate("GET", "/tracks/b", env)];
      await vi.advanceTimersByTimeAsync(5000);
      expect((await Promise.all(gates)).map((r) => r?.status)).toEqual([503, 503]);
      expect(fetch).toHaveBeenCalledTimes(1);
   });

   it("treats a 5xx or a failed request as not ready, and a 4xx as awake", async () => {
      vi.stubGlobal("fetch", respondAfter(10, 503));
      const down = coldStartGate("GET", "/lessons/a", env);
      await vi.advanceTimersByTimeAsync(10);
      expect((await down)?.status).toBe(503);

      vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("fetch failed"))));
      expect((await coldStartGate("GET", "/lessons/a", env))?.status).toBe(503);

      vi.stubGlobal("fetch", respondAfter(10, 404));
      const awake = coldStartGate("GET", "/lessons/a", env);
      await vi.advanceTimersByTimeAsync(10);
      expect(await awake).toBeNull();
   });

   it("re-probes once the last answer is older than the fresh window", async () => {
      const fetch = respondAfter(10);
      vi.stubGlobal("fetch", fetch);
      const first = coldStartGate("GET", "/lessons/a", env);
      await vi.advanceTimersByTimeAsync(10);
      await first;
      await vi.advanceTimersByTimeAsync(60_000);
      const second = coldStartGate("GET", "/lessons/a", env);
      await vi.advanceTimersByTimeAsync(10);
      await second;
      expect(fetch).toHaveBeenCalledTimes(2);
   });

   it("answers HEAD without a body", async () => {
      vi.stubGlobal("fetch", respondAfter(8000));
      const gate = coldStartGate("HEAD", "/lessons/a", env);
      await vi.advanceTimersByTimeAsync(5000);
      const res = (await gate)!;
      expect(res.status).toBe(503);
      expect(res.body).toBeNull();
   });

   it("never gates other methods or routes, a deployment without API_URL, or API_WAKE_BUDGET_MS=off", async () => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      expect(await coldStartGate("POST", "/lessons/a", env)).toBeNull();
      expect(await coldStartGate("GET", "/dashboard", env)).toBeNull();
      expect(await coldStartGate("GET", "/lessons/a", {})).toBeNull();
      expect(await coldStartGate("GET", "/lessons/a", { ...env, API_WAKE_BUDGET_MS: "off" })).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
   });
});
