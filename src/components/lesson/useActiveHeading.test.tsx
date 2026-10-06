import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { activeHeading, SCROLL_OFFSET, useActiveHeading } from "./useActiveHeading";

const LINE = SCROLL_OFFSET + 8;
const at = (...tops: number[]) => tops.map((top, index) => ({ id: `h${index + 1}`, top }));

describe("activeHeading", () => {
   it("is none before the first heading has reached the line", () => {
      expect(activeHeading([])).toBeNull();
      expect(activeHeading(at(400, 900))).toBeNull();
   });

   it("is the last heading at or above the line, in document order", () => {
      expect(activeHeading(at(-900, -200, 60, 700))).toBe("h3");
      expect(activeHeading(at(-900, -200, -50, -10))).toBe("h4");
   });

   it("takes a heading as current exactly where a contents jump leaves it", () => {
      expect(activeHeading(at(LINE))).toBe("h1");
      expect(activeHeading(at(LINE + 1))).toBeNull();
      expect(activeHeading(at(SCROLL_OFFSET))).toBe("h1");
   });

   it("is deterministic when several cross together: the later one wins, whatever else is below", () => {
      expect(activeHeading(at(10, 40, 90, 300))).toBe("h3");
   });
});

interface FakeObserver {
   callback: IntersectionObserverCallback;
   options?: IntersectionObserverInit;
   observed: Element[];
   disconnect: Mock<() => void>;
}
const observers: FakeObserver[] = [];

beforeEach(() => {
   observers.length = 0;
   vi.stubGlobal(
      "IntersectionObserver",
      class {
         private self: FakeObserver;
         constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
            this.self = { callback, options, observed: [], disconnect: vi.fn<() => void>() };
            observers.push(this.self);
         }
         observe(element: Element) {
            this.self.observed.push(element);
         }
         disconnect() {
            this.self.disconnect();
         }
      }
   );
});
afterEach(() => {
   vi.unstubAllGlobals();
   vi.restoreAllMocks();
});

function Probe({ ids }: { ids: string[] }) {
   const [active] = useActiveHeading(ids);
   return (
      <>
         <output>{active ?? "none"}</output>
         {ids.map((id) => (
            <h2 key={id} id={id}>
               {id}
            </h2>
         ))}
      </>
   );
}
const tops = (map: Record<string, number>) =>
   vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return { top: map[this.id] ?? 9999 } as DOMRect;
   });
const fire = () => act(() => observers[0].callback([], observers[0] as unknown as IntersectionObserver));

describe("useActiveHeading", () => {
   it("watches each heading on the page with one observer set to the contents line", () => {
      render(<Probe ids={["a", "b", "c"]} />);
      expect(observers).toHaveLength(1);
      expect(observers[0].observed.map((element) => element.id)).toEqual(["a", "b", "c"]);
      expect(observers[0].options).toEqual({ rootMargin: `-${LINE}px 0px 0px 0px`, threshold: [0, 1] });
      expect(screen.getByRole("status")).toHaveTextContent("none");
   });

   it("reads the headings' positions when the observer fires and reports the current one", () => {
      render(<Probe ids={["a", "b", "c"]} />);
      tops({ a: -300, b: 40, c: 500 });
      fire();
      expect(screen.getByRole("status")).toHaveTextContent("b");

      tops({ a: -900, b: -600, c: 20 });
      fire();
      expect(screen.getByRole("status")).toHaveTextContent("c");

      tops({ a: 300, b: 700, c: 1100 });
      fire();
      expect(screen.getByRole("status")).toHaveTextContent("none");
   });

   it("stops observing when the page goes away", () => {
      const { unmount } = render(<Probe ids={["a", "b"]} />);
      unmount();
      expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
   });

   it("keeps its observer across renders that do not change the headings", () => {
      const { rerender } = render(<Probe ids={["a", "b"]} />);
      rerender(<Probe ids={["a", "b"]} />);
      expect(observers).toHaveLength(1);
      rerender(<Probe ids={["a", "b", "c"]} />);
      expect(observers).toHaveLength(2);
      expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
   });

   it("skips an id that is not on the page, and observes nothing when there is nothing to watch", () => {
      render(<Probe ids={["a"]} />);
      expect(observers[0].observed.map((element) => element.id)).toEqual(["a"]);
      render(<output>x</output>);
      const before = observers.length;
      function Empty() {
         useActiveHeading([]);
         return null;
      }
      render(<Empty />);
      expect(observers).toHaveLength(before);
   });

   it("does nothing, and does not throw, where IntersectionObserver does not exist", () => {
      vi.unstubAllGlobals();
      // @ts-expect-error jsdom has none by default; make that explicit
      delete globalThis.IntersectionObserver;
      expect(() => render(<Probe ids={["a", "b"]} />)).not.toThrow();
      expect(screen.getByRole("status")).toHaveTextContent("none");
   });
});
