import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeContent } from "@/app/HomeContent";
import { TRACKS_ENTRY } from "@/lib/primary-navigation";
import { Footer } from "./Footer";
import { Header } from "./Header";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const hrefs = () => screen.getAllByRole("link").map((a) => a.getAttribute("href"));

describe("public navigation", () => {
    it("header links go to Tracks, Knowledge, the homepage Pricing and FAQ sections, and sign-in only", () => {
        render(<Header />);
        const links = hrefs();
        expect(links).toEqual(expect.arrayContaining(["/learn", "/knowledge", "/#pricing", "/#faq"]));
        for (const href of links) expect(["/", "/learn", "/knowledge", "/#pricing", "/#faq", "/login"]).toContain(href);
    });

    it("the Tracks link opens the same place in the header, the mobile menu and the homepage actions", () => {
        render(<><Header /><HomeContent /></>);
        const header = within(screen.getByRole("banner"));
        const desktop = header.getByRole("navigation", { name: "Primary" }).querySelector("a[href]")!;
        expect(desktop).toHaveTextContent("Tracks");
        const home = within(screen.getByRole("main")); // read before the open menu hides the page from the role tree
        const homeTargets = [...home.getAllByRole("link", { name: "Start Learning" }), home.getByRole("link", { name: /Explore Tracks/ })];
        fireEvent.click(header.getByRole("button", { name: "Menu" }));
        const mobile = within(screen.getByRole("dialog")).getByRole("link", { name: "Tracks" });
        const targets = [desktop, mobile, ...homeTargets];
        expect(new Set(targets.map((a) => a.getAttribute("href")))).toEqual(new Set([TRACKS_ENTRY]));
        expect(TRACKS_ENTRY).toBe("/learn");
    });

    it("header sends Pricing and Premium to the informational pricing section, never to a purchase route", () => {
        render(<Header />);
        for (const name of ["Pricing", "Premium"]) expect(screen.getByRole("link", { name })).toHaveAttribute("href", "/#pricing");
        expect(hrefs().filter((h) => /checkout|billing|purchase|subscribe|stripe|payment|practice/i.test(h ?? ""))).toEqual([]);
    });

    it("footer links are real routes and expose no dead placeholders", () => {
        render(<Footer />);
        for (const href of hrefs()) expect(href).toMatch(/^\/(learn(\/[a-z-]+)?)?$/);
        expect(screen.queryByText(/blog|newsletter|about us|privacy|terms/i)).toBeNull();
    });
});
