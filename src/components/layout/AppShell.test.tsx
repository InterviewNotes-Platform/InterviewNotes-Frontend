import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell, MAIN_CONTENT_ID } from "./AppShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const FOCUSABLE = "a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])";

function shell() {
    return render(
        <AppShell>
            <main>
                <h1>Page</h1>
                <a href="/inside">Inside</a>
            </main>
        </AppShell>
    );
}

describe("skip link", () => {
    it("is the first focusable element, ahead of the header", () => {
        const { container } = shell();
        const first = container.querySelector(FOCUSABLE);
        expect(first).toBe(screen.getByRole("link", { name: "Skip to content" }));
        expect(first).toHaveAttribute("href", `#${MAIN_CONTENT_ID}`);
        expect(first!.compareDocumentPosition(screen.getByRole("banner")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("is hidden until focused", () => {
        shell();
        expect(screen.getByRole("link", { name: "Skip to content" }).className).toMatch(/\bsr-only\b.*\bfocus:not-sr-only\b/);
    });

    it("targets a stable, programmatically focusable wrapper around the page", () => {
        const { container } = shell();
        const target = container.querySelector(`#${MAIN_CONTENT_ID}`) as HTMLElement;
        expect(target).toHaveAttribute("tabindex", "-1");
        expect(target).toContainElement(screen.getByRole("main"));
        expect(target).not.toContainElement(screen.getByRole("banner"));

        target.focus();
        expect(target).toHaveFocus();
    });

    it("adds no <main> landmark of its own", () => {
        const { container } = shell();
        expect(container.querySelectorAll("main, [role='main']")).toHaveLength(1);
        expect(screen.getAllByRole("main")).toHaveLength(1);
    });
});
