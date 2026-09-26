import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeContent } from "@/app/HomeContent";
import { Footer } from "./Footer";
import { Header } from "./Header";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const hrefs = () => screen.getAllByRole("link").map((a) => a.getAttribute("href"));

describe("public navigation", () => {
    it("header section links resolve to ids on the homepage", () => {
        const { unmount } = render(<Header />);
        const anchors = hrefs().filter((h) => h?.startsWith("/#"));
        expect(anchors).toEqual(expect.arrayContaining(["/#access", "/#faq"]));
        unmount();

        const { container } = render(<HomeContent courses={[]} />);
        for (const href of anchors) {
            expect(container.querySelector(`[id="${href!.slice(2)}"]`)).not.toBeNull();
        }
    });

    it("header has no Pricing or Premium affordance", () => {
        render(<Header />);
        expect(screen.queryByRole("link", { name: /pricing|premium/i })).toBeNull();
    });

    it("footer links are real routes and expose no dead placeholders", () => {
        render(<Footer />);
        for (const href of hrefs()) expect(href).toMatch(/^\/(learn\/[a-z-]+)?$/);
        expect(screen.queryByText(/blog|newsletter|about us|privacy|terms/i)).toBeNull();
    });
});
