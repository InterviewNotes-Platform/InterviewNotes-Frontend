import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./Header";

const mocks = vi.hoisted(() => ({
    pathname: "/",
    auth: { user: null as unknown, loading: false },
    signOut: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => mocks.pathname,
    useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut: mocks.signOut } }) }));

const signedIn = (user: Partial<User>) => (mocks.auth = { user: { user_metadata: {}, ...user }, loading: false });

beforeEach(() => {
    mocks.pathname = "/";
    mocks.auth = { user: null, loading: false };
    mocks.signOut.mockReset().mockResolvedValue({});
    mocks.push.mockReset();
    mocks.refresh.mockReset();
});

const banner = () => screen.getByRole("banner");
const primary = () => within(banner()).getByRole("navigation", { name: "Primary" });

describe("desktop shell", () => {
    it("holds the logo, Learn / Practice / Knowledge, account and theme controls in the banner", () => {
        render(<Header />);
        expect(within(banner()).getByRole("link", { name: "InterviewNotes" })).toHaveAttribute("href", "/");
        expect(within(primary()).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
            ["Learn", "/tracks"],
            ["Practice", "/practice"],
            ["Knowledge", "/knowledge"],
        ]);
        expect(within(banner()).getByRole("link", { name: "Sign in" })).toBeInTheDocument();
        expect(within(banner()).getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
    });

    it("has no Subscribe, Upgrade, Pricing or search affordance", () => {
        render(<Header />);
        expect(screen.queryByRole("link", { name: /subscribe|upgrade|pricing|premium/i })).toBeNull();
        expect(screen.queryByRole("search")).toBeNull();
        expect(screen.queryByRole("searchbox")).toBeNull();
        expect(screen.queryByText(/search/i)).toBeNull();
    });

    it("names every icon-only control", () => {
        signedIn({ email: "a@b.c" });
        render(<Header />);
        for (const name of ["Menu", "Toggle theme", "Account menu"]) {
            expect(within(banner()).getByRole("button", { name })).toBeInTheDocument();
        }
    });
});

describe("active area", () => {
    it.each([
        ["/tracks", "Learn"],
        ["/tracks/example", "Learn"],
        ["/lessons/example", "Learn"],
        ["/learn", "Learn"],
        ["/learn/ml-system-design/intro", "Learn"],
        ["/practice", "Practice"],
        ["/practice/example", "Practice"],
        ["/problems/example", "Practice"],
        ["/knowledge", "Knowledge"],
        ["/knowledge/example", "Knowledge"],
    ])("marks only %s's area as the current page", (pathname, label) => {
        mocks.pathname = pathname;
        render(<Header />);
        const current = within(primary()).getAllByRole("link").filter((a) => a.getAttribute("aria-current"));
        expect(current.map((a) => [a.textContent, a.getAttribute("aria-current")])).toEqual([[label, "page"]]);
    });

    it.each(["/", "/login", "/signup", "/demo", "/not-a-route"])("marks nothing on %s", (pathname) => {
        mocks.pathname = pathname;
        render(<Header />);
        expect(within(primary()).getAllByRole("link").filter((a) => a.hasAttribute("aria-current"))).toEqual([]);
    });
});

describe("account", () => {
    it("signed out: one quiet Sign in link and no sign-up pair or account menu", () => {
        render(<Header />);
        expect(within(banner()).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
        expect(within(banner()).queryByRole("link", { name: /sign up|log in|login|get started/i })).toBeNull();
        expect(within(banner()).queryByRole("button", { name: "Account menu" })).toBeNull();
    });

    it("reserves the slot without showing either state while auth resolves", () => {
        mocks.auth = { user: null, loading: true };
        render(<Header />);
        expect(within(banner()).queryByRole("link", { name: "Sign in" })).toBeNull();
        expect(within(banner()).queryByRole("button", { name: "Account menu" })).toBeNull();
    });

    it("signed in: shows initials, then email, Courses and Log out from the keyboard", () => {
        signedIn({ email: "ada.lovelace@example.com", user_metadata: { full_name: "Ada Lovelace" } });
        render(<Header />);
        expect(within(banner()).queryByRole("link", { name: "Sign in" })).toBeNull();

        const trigger = within(banner()).getByRole("button", { name: "Account menu" });
        expect(trigger).toHaveTextContent("AL");
        fireEvent.keyDown(trigger, { key: "Enter" });

        const menu = screen.getByRole("menu");
        expect(within(menu).getByText("ada.lovelace@example.com")).toBeInTheDocument();
        expect(within(menu).getByRole("menuitem", { name: "Courses" })).toHaveAttribute("href", "/learn");
        expect(within(menu).getByRole("menuitem", { name: "Log out" })).toBeInTheDocument();
    });

    it("falls back to the email initial", () => {
        signedIn({ email: "grace@example.com" });
        render(<Header />);
        expect(within(banner()).getByRole("button", { name: "Account menu" })).toHaveTextContent("G");
    });

    it("Log out signs out through Supabase, then returns home and refreshes", async () => {
        signedIn({ email: "grace@example.com" });
        render(<Header />);
        fireEvent.keyDown(within(banner()).getByRole("button", { name: "Account menu" }), { key: "Enter" });
        fireEvent.click(screen.getByRole("menuitem", { name: "Log out" }));

        await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
        expect(mocks.signOut).toHaveBeenCalledTimes(1);
        expect(mocks.push).toHaveBeenCalledWith("/");
    });
});
