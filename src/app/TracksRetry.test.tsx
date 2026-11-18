import type { ComponentProps } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KNOWLEDGE, TRACKS } from "./home-copy";
import { RETRY_DELAYS_MS, SLOW_AFTER_MS, TracksPending, TracksRetryButton } from "./TracksRetry";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { useLinkStatus: () => ({ pending: false }), default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});

/** Let every scheduled try run, one `act` per step: React re-renders between tries, and the next delay is set by that render. */
async function runAllTries() {
   for (const delay of RETRY_DELAYS_MS) await act(() => vi.advanceTimersByTimeAsync(delay));
   await act(() => vi.advanceTimersByTimeAsync(0));
}

function visibility(state: "visible" | "hidden") {
   Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
   document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
   vi.useFakeTimers();
   router.refresh.mockReset();
   visibility("visible");
});
afterEach(() => {
   vi.useRealTimers();
   visibility("visible");
});

describe("TracksPending", () => {
   it("says in text that Tracks are loading, holds the space with decorative skeleton cards, and shows no card or link", () => {
      const { container } = render(<TracksPending />);
      expect(screen.getByRole("status")).toHaveTextContent(TRACKS.pending);
      const skeleton = container.querySelector("[data-tracks-skeleton]")!;
      expect(skeleton).toHaveAttribute("aria-hidden", "true");
      expect(skeleton.querySelectorAll("li")).toHaveLength(2);
      expect(container.querySelectorAll("a, button")).toHaveLength(0);
      expect(skeleton.textContent).toBe("");
   });

   it("animates the skeleton only where motion is allowed", () => {
      const { container } = render(<TracksPending />);
      const animated = [...container.querySelectorAll("[data-tracks-skeleton] .animate-pulse, [data-tracks-skeleton] [class*='animate-']")];
      expect(animated.length).toBeGreaterThan(0);
      for (const element of animated) expect(element.className).toMatch(/motion-safe:animate-pulse/);
      expect(container.querySelector("[data-tracks-skeleton] .animate-pulse:not([class*='motion-safe:animate-pulse'])")).toBeNull();
   });

   it("explains the wait after a few seconds, in the same status line", async () => {
      render(<TracksPending />);
      await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS));
      expect(screen.getByRole("status")).toHaveTextContent(TRACKS.pendingSlow);
   });

   it("refreshes the page on the server at each delay, one at a time, and from nowhere else", async () => {
      render(<TracksPending />);
      let elapsed = 0;
      for (const [index, delay] of RETRY_DELAYS_MS.entries()) {
         await act(() => vi.advanceTimersByTimeAsync(delay - 1));
         expect(router.refresh, `try ${index + 1} fired early`).toHaveBeenCalledTimes(index);
         await act(() => vi.advanceTimersByTimeAsync(1));
         expect(router.refresh).toHaveBeenCalledTimes(index + 1);
         elapsed += delay;
      }
      expect(elapsed).toBeLessThanOrEqual(90_000);
   });

   it("stops after the last try, says so, and offers Try again and Knowledge; it makes no further request on its own", async () => {
      render(<TracksPending />);
      await runAllTries();
      expect(router.refresh).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length);
      expect(screen.getByRole("status")).toHaveTextContent(TRACKS.stalled);
      expect(screen.getByRole("button", { name: TRACKS.retry })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: KNOWLEDGE.action.label })).toHaveAttribute("href", KNOWLEDGE.action.href);

      await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
      expect(router.refresh, "it polled after giving up").toHaveBeenCalledTimes(RETRY_DELAYS_MS.length);
   });

   it("Try again starts one more refresh and a fresh sequence", async () => {
      render(<TracksPending />);
      await runAllTries();
      router.refresh.mockClear();
      fireEvent.click(screen.getByRole("button", { name: TRACKS.retry }));
      expect(router.refresh).toHaveBeenCalledTimes(1);
      await act(() => vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]));
      expect(router.refresh).toHaveBeenCalledTimes(2);
   });

   it("does not read for a hidden tab, and tries once when the tab comes back", async () => {
      render(<TracksPending />);
      visibility("hidden");
      await act(() => vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] + 5000));
      expect(router.refresh).not.toHaveBeenCalled();
      visibility("visible");
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(router.refresh).toHaveBeenCalledTimes(1);
   });

   it("stops all timers when it unmounts, which is what happens when the Tracks arrive", async () => {
      const { unmount } = render(<TracksPending />);
      unmount();
      await act(() => vi.advanceTimersByTimeAsync(5 * 60_000));
      expect(router.refresh).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
   });

   it("tells a visitor without script that it cannot refresh itself, hides the skeleton and links on", () => {
      // React's client renderer drops <noscript> children; what a visitor without script gets is the server's HTML.
      const html = renderToString(<TracksPending />);
      const noscript = html.slice(html.indexOf("<noscript>"), html.indexOf("</noscript>"));
      expect(noscript).toContain(TRACKS.noscript);
      expect(noscript).toContain("[data-tracks-js]{display:none}");
      expect(noscript).toContain(`href="${KNOWLEDGE.action.href}"`);
      expect(html.indexOf("data-tracks-js"), "the skeleton and its wording are marked to be hidden without script").toBeGreaterThan(-1);
   });
});

describe("TracksRetryButton", () => {
   it("re-renders the page on the server once, then says it is trying", () => {
      render(<TracksRetryButton />);
      fireEvent.click(screen.getByRole("button", { name: TRACKS.retry }));
      expect(router.refresh).toHaveBeenCalledTimes(1);
   });
});
