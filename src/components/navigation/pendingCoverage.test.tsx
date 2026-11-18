import { render, screen, within, fireEvent } from "@testing-library/react";
import { createElement, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LinkedMeta } from "@/lib/catalog/lesson";
import type { TrackPlacement } from "@/lib/catalog/navigation";
import type { PreparationGroup } from "@/lib/catalog/problem";
import type { CatalogMeta, CatalogOutlineEntry, CatalogTrack } from "@/lib/catalog/types";

const status = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", () => ({
   default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean | null }) => createElement("a", { "data-prefetch": String(prefetch), ...props }),
   useLinkStatus: () => status,
}));

import { CatalogBody } from "@/components/catalog/CatalogBody";
import { DiscoveryCard } from "@/components/catalog/DiscoveryCard";
import { EntryRow } from "@/components/catalog/EntryRow";
import { ProblemPreparation } from "@/components/catalog/ProblemPreparation";
import { TrackPrevNext } from "@/components/catalog/TrackContext";
import { KnowledgeAbout } from "@/components/lesson/KnowledgeAbout";

// P8-RSP-02 follow-up: the catalog links that did not yet acknowledge a click. Each one must show the decorative
// pending hint while its navigation is pending, and none may gain or lose a prefetch it did not have before.
const HINT = '[data-nav-pending="link"]';
const pendingIn = (link: HTMLElement) => link.querySelector(HINT) !== null;

beforeEach(() => {
   status.pending = false;
});

const meta = (id: string, over: Partial<CatalogMeta> = {}): CatalogMeta => {
   const [type, slug] = id.split(".");
   return { id, type: type as CatalogMeta["type"], slug, title: `Title ${slug}`, summary: `Summary ${slug}`, tags: [], category: null, difficulty: null, level: null, access: "free", ...over };
};
const linked = (id: string): LinkedMeta => {
   const entry = meta(id);
   return { entry, href: `/${entry.type === "knowledge" ? "knowledge" : `${entry.type}s`}/${entry.slug}` };
};
const outlineEntry = (id: string, over: Partial<CatalogOutlineEntry> = {}): CatalogOutlineEntry => {
   const [type, slug] = id.split(".");
   return { id, type: type as CatalogOutlineEntry["type"], slug, title: `Step ${slug}`, access: "free", primary: true, ...over };
};
const track = (): CatalogTrack => ({
   id: "track.home",
   slug: "home",
   title: "Home Track",
   summary: "",
   modules: [{ key: "m", title: "Module", position: 0, items: [outlineEntry("lesson.a")] }],
});
const placement = (): TrackPlacement => ({
   track: track(),
   module: track().modules[0],
   previousLesson: outlineEntry("lesson.before"),
   nextLesson: outlineEntry("lesson.after", { access: "premium" }),
});

describe("catalog links acknowledge a click", () => {
   it("a Discovery card (Knowledge and Problem cards): never prefetched, hint spans the card", () => {
      const { container, rerender } = render(<DiscoveryCard title="Caching" summary="s" href="/knowledge/caching" cue="Open" />);
      const link = screen.getByRole("link", { name: "Caching" });
      expect(link).toHaveAttribute("data-prefetch", "false");
      expect(link).not.toHaveClass("relative"); // stretched: the positioned card carries the hint
      expect(container.querySelector("article")).toHaveClass("relative");
      expect(pendingIn(link)).toBe(false);
      status.pending = true;
      rerender(<DiscoveryCard title="Caching" summary="s" href="/knowledge/caching" cue="Open" />);
      expect(pendingIn(link)).toBe(true);
   });

   it("an Entry row (Track outline, Related content): keeps its prefetch rules and shows the hint", () => {
      const free = { title: "Free one", type: "lesson" as const, access: "free" as const };
      const premium = { title: "Premium one", type: "lesson" as const, access: "premium" as const };
      status.pending = true;
      const { rerender } = render(<ul><EntryRow entry={free} href="/lessons/free" /><EntryRow entry={premium} href="/lessons/premium" /></ul>);
      const freeLink = screen.getByRole("link", { name: /Free one/ });
      const premiumLink = screen.getByRole("link", { name: /Premium one/ });
      expect(freeLink).toHaveAttribute("data-prefetch", "undefined"); // unchanged: the caller decides
      expect(premiumLink).toHaveAttribute("data-prefetch", "false"); // unchanged: premium is never prefetched
      for (const link of [freeLink, premiumLink]) {
         expect(link).toHaveClass("relative");
         expect(pendingIn(link)).toBe(true);
      }
      rerender(<ul><EntryRow entry={free} href="/lessons/free" prefetch={false} /></ul>);
      expect(screen.getByRole("link", { name: /Free one/ })).toHaveAttribute("data-prefetch", "false");
   });

   it("a Problem preparation row", () => {
      const groups: PreparationGroup[] = [{ id: "g", label: "Read first", rows: [linked("knowledge.base"), linked("lesson.first")] }];
      status.pending = true;
      render(<ProblemPreparation groups={groups} />);
      for (const link of screen.getAllByRole("link")) {
         expect(link).toHaveAttribute("data-prefetch", "false");
         expect(pendingIn(link)).toBe(true);
      }
   });

   it("the Previous and Next lesson steps, in both presentations", () => {
      status.pending = true;
      for (const reading of [false, true]) {
         const { unmount } = render(<TrackPrevNext placement={placement()} reading={reading} />);
         const links = within(screen.getByRole("navigation")).getAllByRole("link");
         expect(links).toHaveLength(2);
         for (const link of links) {
            expect(link).toHaveAttribute("data-prefetch", "false");
            expect(pendingIn(link)).toBe(true);
         }
         unmount();
      }
   });

   it("an in-prose Lesson or Knowledge link: hint added, prefetch unchanged in each mode", () => {
      const text = "See [RAG](ref:knowledge.rag) and [Batching](ref:lesson.batching) and [site](https://example.com).";
      status.pending = true;
      const body = { format: "markdown@1" as const, text };
      const { unmount } = render(<CatalogBody body={body} reading={{ headings: [] }} />);
      for (const name of ["RAG", "Batching"]) {
         const link = screen.getByRole("link", { name });
         expect(link).toHaveAttribute("data-prefetch", "false");
         expect(link.className).toContain("has-[[data-nav-pending]]:opacity-60"); // wrapped prose links dim; no positioned bar
         expect(pendingIn(link)).toBe(true);
         expect(link.querySelector("span[hidden][aria-hidden='true']")).not.toBeNull(); // the marker takes no space and is not announced
      }
      expect(screen.getByRole("link", { name: "site" }).querySelector("span[aria-hidden]")).toBeNull(); // external: no hint
      unmount();
      render(<CatalogBody body={body} stayOnDeployment />);
      expect(screen.getByRole("link", { name: "RAG" })).toHaveAttribute("data-prefetch", "undefined"); // non-reading is unchanged
      expect(pendingIn(screen.getByRole("link", { name: "RAG" }))).toBe(true);
   });

   it("the Knowledge 'Open' link inside the About panel", () => {
      status.pending = true;
      render(<KnowledgeAbout title="KV cache" summary="s" href="/knowledge/kv-cache" />);
      fireEvent.click(screen.getByRole("button", { name: "About KV cache" }));
      const link = screen.getByRole("link", { name: "Open KV cache" });
      expect(link).toHaveAttribute("data-prefetch", "false");
      expect(pendingIn(link)).toBe(true);
   });
});
