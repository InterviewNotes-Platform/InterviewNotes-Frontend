import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Footer } from "./Footer";
import { Header } from "./Header";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const hrefs = () => screen.getAllByRole("link").map((a) => a.getAttribute("href"));

describe("public navigation", () => {
    it("header links go to the primary destinations, never to homepage sections", () => {
        render(<Header />);
        const links = hrefs();
        expect(links).toEqual(expect.arrayContaining(["/tracks", "/practice", "/knowledge"]));
        expect(links.filter((h) => h?.startsWith("/#"))).toEqual([]);
        for (const href of links) expect(["/", "/tracks", "/practice", "/knowledge", "/login"]).toContain(href);
    });

    it("header has no Pricing or Premium affordance", () => {
        render(<Header />);
        expect(screen.queryByRole("link", { name: /pricing|premium/i })).toBeNull();
    });

    it("footer links are real routes and expose no dead placeholders", () => {
        render(<Footer />);
        for (const href of hrefs()) expect(href).toMatch(/^\/(learn(\/[a-z-]+)?)?$/);
        expect(screen.queryByText(/blog|newsletter|about us|privacy|terms/i)).toBeNull();
    });
});
