import type { ReactNode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackSidebarOutline } from "@/lib/catalog/outline";
import { PRIMARY_NAV } from "@/lib/primary-navigation";
import { PRIVACY_HREF } from "@/lib/privacy";
import { readerOrientation } from "@/lib/reader/shellPolicy";
import { ReaderShell } from "./ReaderShell";
import { ReaderToolStoreProvider, useReaderMode, useReaderToolState } from "./readerState";

// The browser auth client's events, driven by the test: `emit(id)` is a session for that user, `emit(null)` a sign-out.
const auth = vi.hoisted(() => {
   const listeners = new Set<(event: string, session: { user: { id: string } } | null) => void>();
   return { listeners, emit: (id: string | null) => listeners.forEach((listener) => listener("SIGNED_IN", id ? { user: { id } } : null)) };
});
vi.mock("@/lib/supabase/client", () => ({
   createClient: () => ({
      auth: {
         onAuthStateChange: (listener: (event: string, session: { user: { id: string } } | null) => void) => {
            auth.listeners.add(listener);
            return { data: { subscription: { unsubscribe: () => auth.listeners.delete(listener) } } };
         },
      },
   }),
}));

vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return {
      default: ({ prefetch, ...props }: { href: string; prefetch?: boolean; children: ReactNode }) =>
         createElement("a", { "data-prefetch": String(prefetch), ...props }),
   };
});

const OUTLINE: TrackSidebarOutline = {
   title: "Home Track",
   href: "/tracks/home",
   groups: [
      {
         key: "m1",
         number: 1,
         title: "Module one",
         current: true,
         entries: [
            { id: "lesson.a", title: "Lesson A", href: "/lessons/a", type: "lesson", kind: null, access: "free", current: true },
            { id: "lesson.b", title: "Lesson B", href: "/lessons/b", type: "lesson", kind: null, access: "premium", current: false },
         ],
      },
   ],
};

const shell = () => document.querySelector("[data-reader]") as HTMLElement;
const before = (a: Element, b: Element) => expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
const page = <main>Page body</main>;

// A viewport for `(min-width: Npx)` queries; `resize` notifies the shell's media subscriptions.
let width = 1024;
const listeners = new Set<() => void>();
function resize(next: number) {
   width = next;
   act(() => listeners.forEach((listener) => listener()));
}
beforeEach(() => {
   width = 1024;
   vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() {
         return width >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity);
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
   }));
});
afterEach(() => {
   listeners.clear();
   vi.unstubAllGlobals();
});

/** A stand-in for a T27 study tool: its text lives in the shell's tool state, not in this component. */
function ScratchFixture() {
   const [text, setText] = useReaderToolState("scratch", "");
   return (
      <label>
         Scratch ({useReaderMode()})
         <input value={text} onChange={(event) => setText(event.target.value)} />
      </label>
   );
}

describe("readerOrientation (S-LSN-18)", () => {
   it("keeps the outline only for a readable page and fails safe to none", () => {
      expect(readerOrientation("readable", OUTLINE).outline).toBe(OUTLINE);
      expect(readerOrientation("locked", OUTLINE).outline).toBeNull();
      expect(readerOrientation("readable", undefined).outline).toBeNull();
   });
});

describe("ReaderShell", () => {
   it("shows no Track orientation on a locked page even when an outline is passed (S-LSN-18)", () => {
      render(
         <ReaderShell access="locked" surface="paper" outline={OUTLINE} tools={<p>Tool</p>}>
            {page}
         </ReaderShell>
      );
      expect(screen.queryByRole("navigation", { name: "Track contents" })).not.toBeInTheDocument();
      expect(screen.queryByRole("complementary", { name: "Track navigation" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Track contents" })).not.toBeInTheDocument();
      expect(screen.queryByText("Home Track")).not.toBeInTheDocument();
      expect(screen.queryByText("Lesson B")).not.toBeInTheDocument();
      expect(screen.queryByRole("radiogroup", { name: "Reading mode" })).not.toBeInTheDocument();
      expect(screen.queryByText("Tool")).not.toBeInTheDocument();
      expect(screen.getByText("Page body")).toBeInTheDocument();
   });

   it("offers Study/Read on a readable page with no Track and no tools, such as an unplaced Knowledge entry (T26-1)", () => {
      render(
         <ReaderShell access="readable" surface="desk" outline={null}>
            {page}
         </ReaderShell>
      );
      expect(shell()).toHaveAttribute("data-reader-surface", "desk");
      fireEvent.click(screen.getByRole("radio", { name: "Read" }));
      expect(shell()).toHaveAttribute("data-reader-mode", "read");
      expect(screen.queryByRole("complementary", { name: "Track navigation" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Track contents" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Study tools" })).not.toBeInTheDocument();
      expect(screen.getByRole("main")).toHaveTextContent("Page body");
   });

   it("puts the Track outline in the rail, collapsed by default, and toggles it with one control", () => {
      render(
         <ReaderShell access="readable" surface="paper" outline={OUTLINE}>
            {page}
         </ReaderShell>
      );
      const rail = screen.getByRole("complementary", { name: "Track navigation" });
      const toggle = within(rail).getByRole("button", { name: "Expand Track sidebar" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(shell()).toHaveAttribute("data-reader-sidebar-state", "closed");
      const panel = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
      expect(panel).toContainElement(within(rail).getByRole("navigation", { name: "Track contents" }));
      expect(within(rail).getByRole("link", { name: "Lesson A" })).toHaveAttribute("aria-current", "page");
      fireEvent.click(toggle);
      expect(within(rail).getByRole("button", { name: "Collapse Track sidebar" })).toHaveAttribute("aria-expanded", "true");
      expect(shell()).toHaveAttribute("data-reader-sidebar-state", "open");
   });

   it("starts the Lesson's sidebar on the 1440 px default, which a click overrides", () => {
      render(
         <ReaderShell access="readable" surface="paper" outline={OUTLINE} expandWide>
            {page}
         </ReaderShell>
      );
      expect(shell()).toHaveAttribute("data-reader-sidebar-state", "auto");
      fireEvent.click(screen.getByRole("button", { name: "Expand Track sidebar" }));
      expect(shell()).toHaveAttribute("data-reader-sidebar-state", "open");
   });

   it("switches Study and Read as a radio group; Read collapses the sidebar and hides the study tools", () => {
      width = 1280;
      render(
         <ReaderShell access="readable" surface="paper" outline={OUTLINE} expandWide tools={<p>Margin tools</p>}>
            {page}
         </ReaderShell>
      );
      const study = screen.getByRole("radio", { name: "Study" });
      expect(study).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("complementary", { name: "Study tools" })).toHaveTextContent("Margin tools");
      fireEvent.keyDown(study, { key: "ArrowRight" });
      const read = screen.getByRole("radio", { name: "Read" });
      expect(read).toHaveAttribute("aria-checked", "true");
      expect(read).toHaveFocus();
      expect(shell()).toHaveAttribute("data-reader-mode", "read");
      expect(shell()).toHaveAttribute("data-reader-sidebar-state", "closed");
      expect(screen.queryByRole("complementary", { name: "Study tools" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Study tools" })).not.toBeInTheDocument();
      expect(screen.getByRole("main")).toHaveTextContent("Page body");
      fireEvent.click(screen.getByRole("radio", { name: "Study" }));
      expect(shell()).toHaveAttribute("data-reader-sidebar-state", "auto");
   });

   it("opens the Track sheet below 768 px as a modal with the same outline, and makes the page inert while open", () => {
      render(
         <ReaderShell access="readable" surface="paper" outline={OUTLINE}>
            {page}
         </ReaderShell>
      );
      const opener = screen.getByRole("button", { name: "Track contents" });
      expect(opener.parentElement).toHaveClass("md:hidden");
      fireEvent.click(opener);
      const sheet = screen.getByRole("dialog", { name: "Home Track" });
      expect(within(sheet).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/tracks/home", "/lessons/a", "/lessons/b"]);
      expect(shell().closest("[inert]")).not.toBeNull();
      fireEvent.keyDown(sheet, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(document.querySelector("[inert]")).toBeNull();
   });

   it("offers the page's study tools in a sheet below 1280 px, and none when the page supplies none", () => {
      const { unmount } = render(
         <ReaderShell access="readable" surface="paper" tools={<p>Margin tools</p>}>
            {page}
         </ReaderShell>
      );
      fireEvent.click(screen.getByRole("button", { name: "Study tools" }));
      expect(screen.getByRole("dialog", { name: "Study tools" })).toHaveTextContent("Margin tools");
      unmount();
      render(
         <ReaderShell access="readable" surface="paper" outline={OUTLINE}>
            {page}
         </ReaderShell>
      );
      expect(screen.queryByRole("button", { name: "Study tools" })).not.toBeInTheDocument();
   });

   it("keeps a tool's state through Study → Read → Study, with the tool unmounted while reading (T26-2)", () => {
      width = 1280;
      render(
         <ReaderShell access="readable" surface="paper" tools={<ScratchFixture />}>
            {page}
         </ReaderShell>,
         { wrapper: ReaderToolStoreProvider }
      );
      fireEvent.change(screen.getByRole("textbox", { name: /Scratch/ }), { target: { value: "kv cache note" } });
      fireEvent.click(screen.getByRole("radio", { name: "Read" }));
      expect(screen.queryByRole("textbox", { name: /Scratch/ })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("radio", { name: "Study" }));
      expect(screen.getByRole("textbox", { name: "Scratch (study)" })).toHaveValue("kv cache note");
   });

   it("mounts the tools in one place at a time and keeps their state between the margin and the sheet (T26-2)", () => {
      width = 1280;
      render(
         <ReaderShell access="readable" surface="paper" tools={<ScratchFixture />}>
            {page}
         </ReaderShell>,
         { wrapper: ReaderToolStoreProvider }
      );
      expect(screen.queryByRole("button", { name: "Study tools" })).not.toBeInTheDocument();
      fireEvent.change(screen.getByRole("textbox", { name: /Scratch/ }), { target: { value: "pinned table" } });

      resize(390);
      expect(screen.queryByRole("complementary", { name: "Study tools" })).not.toBeInTheDocument();
      expect(screen.queryAllByRole("textbox", { hidden: true })).toHaveLength(0);
      fireEvent.click(screen.getByRole("button", { name: "Study tools" }));
      const sheet = screen.getByRole("dialog", { name: "Study tools" });
      expect(within(sheet).getByRole("textbox", { name: /Scratch/ })).toHaveValue("pinned table");
      fireEvent.change(within(sheet).getByRole("textbox", { name: /Scratch/ }), { target: { value: "pinned table, edited" } });

      resize(1440);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(document.querySelector("[inert]")).toBeNull();
      expect(screen.getAllByRole("textbox", { hidden: true })).toHaveLength(1);
      expect(screen.getByRole("complementary", { name: "Study tools" })).toContainElement(screen.getByRole("textbox", { name: /Scratch/ }));
      expect(screen.getByRole("textbox", { name: /Scratch/ })).toHaveValue("pinned table, edited");
   });

   it("keeps tool state across reader page transitions under the root layout's store, and clears it on reload and on a session change", () => {
      width = 1280;
      // One reader page as App Router renders it under the persistent root layout: a new page is a new shell (the key).
      const at = (route: string, surface: "paper" | "desk" = "paper") => (
         <ReaderToolStoreProvider>
            <ReaderShell key={route} access="readable" surface={surface} tools={<ScratchFixture />}>
               <main>{route}</main>
            </ReaderShell>
         </ReaderToolStoreProvider>
      );
      const scratch = () => screen.getByRole("textbox", { name: /Scratch/ });
      const { rerender, unmount } = render(at("/lessons/a"));
      act(() => auth.emit("user-1"));
      fireEvent.change(scratch(), { target: { value: "kv cache note" } });
      fireEvent.click(screen.getByRole("radio", { name: "Read" }));

      rerender(at("/knowledge/b"));
      expect(screen.getByRole("main")).toHaveTextContent("/knowledge/b");
      expect(shell()).toHaveAttribute("data-reader-mode", "study");
      expect(scratch()).toHaveValue("kv cache note");

      rerender(
         <ReaderToolStoreProvider>
            <main>/pricing</main>
         </ReaderToolStoreProvider>
      );
      rerender(at("/problems/c", "desk"));
      expect(scratch()).toHaveValue("kv cache note");

      act(() => auth.emit("user-2"));
      expect(scratch()).toHaveValue("");
      fireEvent.change(scratch(), { target: { value: "second user's note" } });
      act(() => auth.emit(null));
      expect(scratch()).toHaveValue("");
      fireEvent.change(scratch(), { target: { value: "signed-out note" } });

      unmount();
      render(at("/problems/c", "desk"));
      expect(scratch()).toHaveValue("");
   });

   it("ends every reader page, readable or locked, with the one site footer and its real destinations (T26-3)", () => {
      for (const access of ["readable", "locked"] as const) {
         const { unmount } = render(
            <ReaderShell access={access} surface="paper" outline={OUTLINE}>
               {page}
            </ReaderShell>
         );
         const footers = screen.getAllByRole("contentinfo");
         expect(footers).toHaveLength(1);
         expect(shell()).toContainElement(footers[0]);
         before(screen.getByRole("main"), footers[0]);
         expect(within(footers[0]).getByRole("link", { name: "Privacy & AI Use" })).toHaveAttribute("href", PRIVACY_HREF);
         const explore = PRIMARY_NAV.map(({ label, href }) => [label, within(footers[0]).getByRole("link", { name: label }).getAttribute("href"), href]);
         explore.forEach(([, actual, expected]) => expect(actual).toBe(expected));
         expect(within(footers[0]).queryByRole("link", { name: /Home Track|Lesson/ })).not.toBeInTheDocument();
         unmount();
      }
   });
});
