import { fireEvent, render, screen } from "@testing-library/react";
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
        expect(screen.queryByRole("link", { name: "Login" })).toBeNull();

        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("link", { name: "Login" })).toBeInTheDocument();
    });

    it("closes on Escape and returns focus to the trigger", () => {
        render(<Header />);
        const trigger = screen.getByRole("button", { name: "Menu" });
        fireEvent.click(trigger);
        const login = screen.getByRole("link", { name: "Login" });
        login.focus();

        fireEvent.keyDown(login, { key: "Escape" });
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(trigger).toHaveFocus();
    });
});

describe("interactive semantics", () => {
    it("header and homepage nest no interactive controls", () => {
        const { container } = render(<><Header /><HomeContent courses={[course]} /></>);
        fireEvent.click(screen.getByRole("button", { name: "Menu" }));
        expect(container.querySelectorAll(NESTED_INTERACTIVE)).toHaveLength(0);
        expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute("href", "/login");
    });

    it("chapter sidebar keeps the completion toggle outside the chapter link", () => {
        const { container } = render(<CourseSidebar course={course} />);
        expect(container.querySelectorAll(NESTED_INTERACTIVE)).toHaveLength(0);
        expect(screen.getByRole("link", { name: "Introduction" })).toHaveAttribute("href", "/learn/ml-system-design/intro");
        expect(screen.getAllByRole("button", { name: "Mark as complete" })).toHaveLength(2);
    });

    it("FAQ and sidebar section toggles expose their expanded state", () => {
        render(<><HomeContent courses={[]} /><CourseSidebar course={course} /></>);
        const faq = screen.getByRole("button", { name: /what interview types/i });
        expect(faq).toHaveAttribute("aria-expanded", "false");
        fireEvent.click(faq);
        expect(faq).toHaveAttribute("aria-expanded", "true");

        const section = screen.getByRole("button", { name: /basics/i });
        expect(section).toHaveAttribute("aria-expanded", "true");
        fireEvent.click(section);
        expect(section).toHaveAttribute("aria-expanded", "false");
    });
});
