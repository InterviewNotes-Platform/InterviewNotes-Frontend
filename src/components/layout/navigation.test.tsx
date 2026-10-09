import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
        expect(links).toEqual(expect.arrayContaining(["/tracks", "/knowledge", "/#pricing", "/#faq"]));
        for (const href of links) expect(["/", "/tracks", "/knowledge", "/#pricing", "/#faq", "/login"]).toContain(href);
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
