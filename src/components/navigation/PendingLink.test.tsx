import { render, screen } from "@testing-library/react";
import { createElement, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PendingLink } from "./PendingLink";

const status = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", () => ({
   default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean | null }) => createElement("a", { "data-prefetch": String(prefetch), ...props }),
   useLinkStatus: () => status,
}));

// P8-RSP-02 v3: curriculum, related and reader links acknowledge a click at once, with no route loading boundary
// (whose React fallback throttle held fast pages to ~300 ms) and no request before the click.
describe("PendingLink", () => {
   beforeEach(() => {
      status.pending = false;
   });

   it("is never prefetched, whatever the caller passes", () => {
      render(createElement(PendingLink, { href: "/lessons/a", prefetch: true } as ComponentProps<typeof PendingLink>, "Lesson A"));
      expect(screen.getByRole("link", { name: "Lesson A" })).toHaveAttribute("data-prefetch", "false");
   });

   it("shows the decorative pending hint only while its navigation is pending", () => {
      const { container, rerender } = render(<PendingLink href="/lessons/a">Lesson A</PendingLink>);
      expect(container.querySelector("[data-nav-pending]")).toBeNull();
      status.pending = true;
      rerender(<PendingLink href="/lessons/a">Lesson A</PendingLink>);
      const hint = container.querySelector('[data-nav-pending="link"]');
      expect(hint).not.toBeNull();
      expect(hint).toHaveAttribute("aria-hidden", "true");
      expect(screen.getByRole("link", { name: "Lesson A" })).toHaveAccessibleName("Lesson A");
   });

   it("positions itself for the hint, except a stretched link, whose row is positioned", () => {
      render(
         <>
            <PendingLink href="/lessons/a" className="block">Lesson A</PendingLink>
            <PendingLink href="/problems/b" stretched className="after:absolute after:inset-0">Problem B</PendingLink>
         </>
      );
      expect(screen.getByRole("link", { name: "Lesson A" })).toHaveClass("relative", "block");
      expect(screen.getByRole("link", { name: "Problem B" })).not.toHaveClass("relative");
   });
});
