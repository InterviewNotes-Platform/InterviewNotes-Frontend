import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return {
      default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) =>
         createElement("a", { "data-prefetch": String(prefetch), onClick: (event: Event) => event.preventDefault(), ...props }),
   };
});

import { outlineOf } from "@/lib/catalog/outline";
import type { CatalogOutlineEntry, CatalogTrack } from "@/lib/catalog/types";
import { TrackDrawer } from "./TrackDrawer";

const entry = (id: string, over: Partial<CatalogOutlineEntry> = {}): CatalogOutlineEntry => {
   const [type, slug] = id.split(".");
   return { id, type: type as CatalogOutlineEntry["type"], slug, title: `Title ${slug}`, access: "free", primary: true, ...over };
};
const TRACK: CatalogTrack = {
   id: "track.t",
   slug: "t",
   title: "Track t",
   summary: "",
   modules: [
      { key: "one", title: "First", position: 1, items: [entry("lesson.a"), entry("lesson.b", { access: "premium" })] },
      { key: "two", title: "Second", position: 2, items: [entry("lesson.c"), entry("problem.p")] },
   ],
};

const show = () => render(<TrackDrawer outline={outlineOf(TRACK, "lesson.c")!} />);
const trigger = () => screen.getByRole("button", { name: "Track contents" });
const dialog = () => screen.getByRole("dialog", { name: "Track t" });

describe("TrackDrawer (S6-RDR-7, S6-A11Y-3)", () => {
   it("is a 44 px Track contents control that hides from lg, with nothing else in the page until opened", () => {
      const { container } = show();
      expect(trigger()).toHaveClass("min-h-11");
      expect(container.firstElementChild).toHaveClass("lg:hidden");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
   });

   it("opens a dialog named for the Track holding the same ordered outline, with the current entry marked", () => {
      show();
      fireEvent.click(trigger());
      const nav = within(dialog()).getByRole("navigation", { name: "Track contents" });
      expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/tracks/t", "/lessons/a", "/lessons/b", "/lessons/c", "/problems/p"]);
      expect(within(nav).getByRole("link", { name: /Title c/ })).toHaveAttribute("aria-current", "page");
      expect(within(nav).getByRole("searchbox", { name: "Filter by title" })).toBeInTheDocument();
   });

   it("moves focus inside, closes on Escape and returns focus to the control", async () => {
      show();
      fireEvent.click(trigger());
      expect(dialog().contains(document.activeElement)).toBe(true);
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(trigger()).toHaveFocus();
   });

   it("makes the page behind inert while open, including a page with a live region, and releases it on close", async () => {
      const page = document.createElement("div");
      page.innerHTML = '<span role="status" aria-live="polite"></span>';
      document.body.appendChild(page);
      show();
      fireEvent.click(trigger());
      expect(page).toHaveAttribute("inert");
      expect(dialog()).not.toHaveAttribute("inert");
      fireEvent.click(within(dialog()).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(page).not.toHaveAttribute("inert");
      page.remove();
   });

   it("closes with its close button and returns focus", async () => {
      show();
      fireEvent.click(trigger());
      fireEvent.click(within(dialog()).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(trigger()).toHaveFocus();
   });

   it("closes when an entry is chosen", async () => {
      show();
      fireEvent.click(trigger());
      fireEvent.click(within(dialog()).getByRole("link", { name: /Title a/ }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
   });

   it("filters inside the drawer without leaving a collapsed entry reachable", () => {
      show();
      fireEvent.click(trigger());
      fireEvent.change(within(dialog()).getByRole("searchbox"), { target: { value: "title p" } });
      expect(within(dialog()).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/tracks/t", "/problems/p"]);
      expect(dialog().querySelectorAll("details:not([open]) a")).toHaveLength(0);
   });
});
