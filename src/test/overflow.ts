import { act } from "@testing-library/react";
import { vi } from "vitest";

interface Widths {
  scrollWidth: number;
  clientWidth: number;
}

/** jsdom has no layout: report fixed widths. Call the returned function (optionally with new widths) to fire every observer. */
export function mockOverflow(initial: Widths) {
  const widths = { ...initial };
  const fire: (() => void)[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        fire.push(() => callback([], this));
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.spyOn(Element.prototype, "scrollWidth", "get").mockImplementation(() => widths.scrollWidth);
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(() => widths.clientWidth);
  return (next?: Partial<Widths>) => {
    Object.assign(widths, next);
    act(() => fire.forEach((run) => run()));
  };
}
