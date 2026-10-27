import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileMenu } from "./MobileMenu";

const member = { email: "grace@example.com" } as User;

function setup(props: Partial<React.ComponentProps<typeof MobileMenu>> = {}) {
    const onSignOut = vi.fn();
    const { unmount } = render(<MobileMenu active={null} user={null} loading={false} onSignOut={onSignOut} {...props} />);
    const trigger = screen.getByRole("button", { name: "Menu" });
    return { trigger, onSignOut, unmount, open: () => fireEvent.click(trigger) };
}

const menu = () => screen.getByRole("dialog", { name: "Menu" });
const tabbables = () => [...menu().querySelectorAll<HTMLElement>("a[href], button")];

describe("mobile menu", () => {
    it("is closed until its trigger opens it", () => {
        const { trigger, open } = setup();
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByRole("dialog")).toBeNull();

        open();
        expect(trigger).toHaveAttribute("aria-expanded", "true");
        expect(menu()).toBeInTheDocument();
    });

    it("moves focus into the menu, onto the first destination", () => {
        setup().open();
        expect(menu().contains(document.activeElement)).toBe(true);
        expect(document.activeElement).toBe(within(menu()).getByRole("link", { name: "Tracks" }));
    });

    it("offers Tracks, Knowledge, Pricing and FAQ, the Premium link, account and theme control", () => {
        setup().open();
        const nav = within(menu()).getByRole("navigation", { name: "Primary" });
        expect(within(nav).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
            ["Tracks", "/#tracks"],
            ["Knowledge", "/knowledge"],
            ["Pricing", "/#pricing"],
            ["FAQ", "/#faq"],
        ]);
        expect(within(menu()).getByRole("link", { name: "Premium" })).toHaveAttribute("href", "/#pricing");
        expect(within(nav).queryByRole("link", { name: "Practice" })).toBeNull();
        expect(within(menu()).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
        expect(within(menu()).getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
        expect(within(menu()).getByRole("button", { name: "Close" })).toBeInTheDocument();
    });

    describe("Prepare entry", () => {
        afterEach(() => vi.unstubAllEnvs());

        it("is absent while the flag is off", () => {
            setup().open();
            expect(within(menu()).queryByRole("link", { name: "Prepare" })).toBeNull();
        });

        it("is listed after Knowledge when the flag is on", () => {
            vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "true");
            setup({ active: "prepare" }).open();
            const nav = within(menu()).getByRole("navigation", { name: "Primary" });
            const links = within(nav).getAllByRole("link");
            expect(links.map((a) => a.textContent)).toEqual(["Tracks", "Knowledge", "Prepare", "Pricing", "FAQ"]);
            expect(within(nav).getByRole("link", { name: "Prepare" })).toHaveAttribute("href", "/prepare");
            expect(links.filter((a) => a.hasAttribute("aria-current")).map((a) => a.textContent)).toEqual(["Prepare"]);
        });
    });

    it("marks the active area as the current page", () => {
        setup({ active: "learn" }).open();
        const current = within(menu()).getAllByRole("link").filter((a) => a.hasAttribute("aria-current"));
        expect(current.map((a) => a.textContent)).toEqual(["Tracks"]);
    });

    it("signed in: shows the email, Tracks and Log out instead of Sign in", () => {
        const { open, onSignOut } = setup({ user: member });
        open();
        expect(within(menu()).queryByRole("link", { name: "Sign in" })).toBeNull();
        expect(within(menu()).getByText("grace@example.com")).toBeInTheDocument();
        const tracks = within(menu()).getAllByRole("link", { name: "Tracks" });
        expect(tracks.map((a) => a.getAttribute("href"))).toEqual(["/#tracks", "/#tracks"]);
        expect(within(menu()).queryByRole("link", { name: "Courses" })).toBeNull();

        fireEvent.click(within(menu()).getByRole("button", { name: "Log out" }));
        expect(onSignOut).toHaveBeenCalledTimes(1);
    });

    it("shows no account control while auth resolves", () => {
        setup({ loading: true }).open();
        expect(within(menu()).queryByRole("link", { name: /sign in|courses/i })).toBeNull();
        expect(within(menu()).getAllByRole("link", { name: "Tracks" })).toHaveLength(1);
        expect(within(menu()).queryByRole("button", { name: "Log out" })).toBeNull();
        expect(within(menu()).getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
    });

    it("keeps Tab inside the menu in both directions", () => {
        setup().open();
        const items = tabbables();
        const [first, last] = [items[0], items[items.length - 1]];

        last.focus();
        fireEvent.keyDown(last, { key: "Tab" });
        expect(first).toHaveFocus();

        fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
        expect(last).toHaveFocus();
    });

    it("closes on Escape and restores focus to the trigger", async () => {
        const { trigger, open } = setup();
        open();
        fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await waitFor(() => expect(trigger).toHaveFocus());
        expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("closes through its explicit close control and restores focus", async () => {
        const { trigger, open } = setup();
        open();
        fireEvent.click(within(menu()).getByRole("button", { name: "Close" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await waitFor(() => expect(trigger).toHaveFocus());
    });

    it("makes the page behind inert while open, including a page with a live region, and releases it on every close", async () => {
        const page = document.createElement("div");
        page.innerHTML = '<span role="status" aria-live="polite"></span>';
        document.body.appendChild(page);
        const { trigger, open } = setup();

        open();
        expect(page).toHaveAttribute("inert");
        expect(trigger.closest("[inert]")).not.toBeNull();
        expect(menu()).not.toHaveAttribute("inert");
        expect(menu().closest("[inert]")).toBeNull();

        fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(page).not.toHaveAttribute("inert");
        expect(trigger.closest("[inert]")).toBeNull();
        await waitFor(() => expect(trigger).toHaveFocus());

        open();
        expect(page).toHaveAttribute("inert");
        fireEvent.click(within(menu()).getByRole("button", { name: "Close" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(page).not.toHaveAttribute("inert");

        open();
        const link = within(menu()).getByRole("link", { name: "FAQ" });
        link.addEventListener("click", (event) => event.preventDefault());
        fireEvent.click(link);
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(page).not.toHaveAttribute("inert");
        page.remove();
    });

    it("releases the inert page when the menu unmounts while open", () => {
        const page = document.createElement("div");
        document.body.appendChild(page);
        const { unmount, open } = setup();

        open();
        expect(page).toHaveAttribute("inert");
        unmount();
        expect(page).not.toHaveAttribute("inert");
        page.remove();
    });

    it.each(["Tracks", "Knowledge", "Pricing", "FAQ", "Premium", "Sign in"])("closes after choosing %s", async (name) => {
        setup().open();
        const link = within(menu()).getByRole("link", { name });
        link.addEventListener("click", (event) => event.preventDefault()); // jsdom cannot navigate
        fireEvent.click(link);
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });
});
