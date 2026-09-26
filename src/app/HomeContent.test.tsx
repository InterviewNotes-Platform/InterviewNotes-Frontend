import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Course } from "@/lib/courses";
import { HomeContent } from "./HomeContent";

const course = {
    id: "ml-system-design",
    slug: "ml-system-design",
    title: "ML System Design",
    description: "Design ML systems",
    icon: "brain",
    chapterCount: 2,
    chapters: [{ estimatedReadTime: 30 }, { estimatedReadTime: 30 }],
} as unknown as Course;

describe("HomeContent public claims", () => {
    it("does not make unsupported claims", () => {
        render(<HomeContent courses={[course]} />);
        for (const claim of [/5K\+/, /Offer Rate/i, /Testimonials/i, /Trusted by/i, /\$40/, /lifetime/i, /AI-powered/i]) {
            expect(screen.queryByText(claim)).toBeNull();
        }
    });

    it("states that paid access is not available yet", () => {
        render(<HomeContent courses={[course]} />);
        expect(screen.getAllByText(/not available yet/i).length).toBeGreaterThan(0);
    });
});
