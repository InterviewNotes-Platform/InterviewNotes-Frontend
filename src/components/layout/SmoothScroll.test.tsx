import { render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

interface Instance {
   destroy: ReturnType<typeof vi.fn>;
   options: Record<string, unknown>;
}
const instances = vi.hoisted(() => [] as Instance[]);
// A stand-in for the React adapter that records one "instance" per distinct options object, as the real one does per distinct options.
vi.mock("lenis/react", () => ({
   ReactLenis: ({ options }: { options: Instance["options"] }) => {
      useEffect(() => {
         const instance = { destroy: vi.fn(), options };
         instances.push(instance);
         return () => instance.destroy();
      }, [options]);
      return null;
   },
}));

import { SmoothScroll } from "./SmoothScroll";

const query = (reduce: boolean) => (q: string) => ({ matches: q.includes("no-preference") ? !reduce : reduce, addEventListener() {}, removeEventListener() {} });

beforeEach(() => {
   instances.length = 0;
   route.pathname = "/";
   vi.stubGlobal("matchMedia", query(false));
});
afterEach(() => vi.unstubAllGlobals());

describe("SmoothScroll", () => {
   it("mounts one instance with the prototype's settings and destroys it on unmount", () => {
      const { unmount, rerender } = render(<SmoothScroll />);
      rerender(<SmoothScroll />);
      expect(instances).toHaveLength(1);
      expect(instances[0].options).toMatchObject({ autoRaf: true, lerp: 0.09 });
      unmount();
      expect(instances[0].destroy).toHaveBeenCalledTimes(1);
   });

   it("creates no instance when the reader prefers reduced motion", () => {
      vi.stubGlobal("matchMedia", query(true));
      render(<SmoothScroll />);
      expect(instances).toHaveLength(0);
   });

   it("lets Lenis animate in-page anchors on the homepage only", () => {
      const { rerender } = render(<SmoothScroll />);
      expect(instances[0].options.anchors).toBe(true);
      for (const pathname of ["/knowledge", "/lessons/anatomy-of-a-model-request", "/problems/some-problem", "/prepare", "/pricing"]) {
         route.pathname = pathname;
         rerender(<SmoothScroll />);
         expect(instances.at(-1)!.options.anchors, pathname).toBe(false);
      }
   });

   it("keeps the same options object across renders of one route, so a route does not rebuild the instance", () => {
      route.pathname = "/knowledge";
      const { rerender } = render(<SmoothScroll />);
      rerender(<SmoothScroll />);
      rerender(<SmoothScroll />);
      expect(instances).toHaveLength(1);
   });

   it("leaves nested scrolling regions, a running glide at navigation and overlays to the browser", () => {
      render(<SmoothScroll />);
      const { options } = instances[0];
      expect(options).toMatchObject({ allowNestedScroll: true, stopInertiaOnNavigate: true });
      const prevent = options.prevent as (node: HTMLElement) => boolean;
      const el = (html: string) => {
         const host = document.createElement("div");
         host.innerHTML = html;
         return host.firstElementChild as HTMLElement;
      };
      expect(prevent(el('<div role="dialog"></div>'))).toBe(true);
      expect(prevent(el('<div role="menu"></div>'))).toBe(true);
      expect(prevent(el('<ul role="listbox"></ul>'))).toBe(true);
      expect(prevent(el('<div data-scroll-locked="1"></div>')), "the body while a modal holds its scroll lock").toBe(true);
      expect(prevent(el("<div></div>"))).toBe(false);
   });
});
