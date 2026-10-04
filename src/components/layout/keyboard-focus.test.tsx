import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeContent } from "@/app/HomeContent";
import type { Course } from "@/lib/courses";
import { CourseSidebar } from "./CourseSidebar";
import { Header } from "./Header";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/learn/ml-system-design/intro",
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const NESTED_INTERACTIVE = "a a, a button, button a, button button";

const chapter = (id: string, title: string) => ({
    id, title, slug: id, courseId: "c1", section: "Basics", order: 1, isPremium: false, estimatedReadTime: 10,
});
const course = {
    id: "c1", slug: "ml-system-design", title: "ML System Design", description: "", icon: "BarChart2",
    chapterCount: 2, chapters: [chapter("intro", "Introduction"), chapter("ranking", "Ranking")],
} as Course;

describe("mobile menu", () => {
    it("exposes a named trigger whose expanded state tracks the menu", () => {
        render(<Header />);
        const trigger = screen.getByRole("button", { name: "Menu" });
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByRole("dialog")).toBeNull();

        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute("aria-expanded", "true");
        const menu = screen.getByRole("dialog", { name: "Menu" });
        expect(within(menu).getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    });

    it("closes on Escape and returns focus to the trigger", async () => {
        render(<Header />);
        const trigger = screen.getByRole("button", { name: "Menu" });
        fireEvent.click(trigger);
        const signIn = within(screen.getByRole("dialog")).getByRole("link", { name: "Sign in" });
        signIn.focus();

        fireEvent.keyDown(signIn, { key: "Escape" });
        await waitFor(() => expect(trigger).toHaveFocus());
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});

describe("interactive semantics", () => {
    it("header, open menu and homepage nest no interactive controls", () => {
        render(<><Header /><HomeContent /></>);
        expect(within(screen.getByRole("banner")).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");

        fireEvent.click(screen.getByRole("button", { name: "Menu" }));
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(document.body.querySelectorAll(NESTED_INTERACTIVE)).toHaveLength(0);
    });

    it("chapter sidebar keeps the completion toggle outside the chapter link", () => {
        const { container } = render(<CourseSidebar course={course} />);
        expect(container.querySelectorAll(NESTED_INTERACTIVE)).toHaveLength(0);
        expect(screen.getByRole("link", { name: "Introduction" })).toHaveAttribute("href", "/learn/ml-system-design/intro");
        expect(screen.getAllByRole("button", { name: "Mark as complete" })).toHaveLength(2);
    });

    it("sidebar section toggles expose their expanded state", () => {
        render(<CourseSidebar course={course} />);
        const section = screen.getByRole("button", { name: /basics/i });
        expect(section).toHaveAttribute("aria-expanded", "true");
        fireEvent.click(section);
        expect(section).toHaveAttribute("aria-expanded", "false");
    });
});
