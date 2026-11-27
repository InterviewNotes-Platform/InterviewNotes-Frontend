import type { ComponentProps } from "react";
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RETRY_DELAYS_MS, SLOW_AFTER_MS } from "@/app/TracksRetry";
import { CatalogPending, PENDING } from "./CatalogPending";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { useLinkStatus: () => ({ pending: false }), default: (props: ComponentProps<"a">) => createElement("a", props) };
});

beforeEach(() => {
   vi.useFakeTimers();
   router.refresh.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("CatalogPending", () => {
   it("says the page is loading, then that the server may be starting, refreshing on the server a bounded number of times", async () => {
      render(<CatalogPending href="/lessons/synthetic" />);
      expect(screen.getByRole("status")).toHaveTextContent(PENDING.loading);
      await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS));
      expect(screen.getByRole("status")).toHaveTextContent(PENDING.slow);
      for (const delay of RETRY_DELAYS_MS) await act(() => vi.advanceTimersByTimeAsync(delay));
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(router.refresh).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length);
      expect(screen.getByRole("status")).toHaveTextContent(PENDING.stalled);
      expect(screen.getByRole("button", { name: PENDING.retry })).toBeVisible();
      await act(() => vi.advanceTimersByTimeAsync(60_000));
      expect(router.refresh).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length);
   });

   it("names nothing about the item, and without script links to a reload of this page and to the Tracks", () => {
      const html = renderToString(<CatalogPending href="/lessons/synthetic" />);
      expect(html).toContain("<noscript>");
      expect(html).toContain('href="/lessons/synthetic"');
      expect(html).toContain('href="/tracks"');
      expect(html).toContain(PENDING.noscript);
      expect(html).not.toMatch(/Sign in|Paid access|retired|not found/i);
   });
});
