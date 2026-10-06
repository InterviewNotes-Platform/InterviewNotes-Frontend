import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PRIMARY_NAV } from "@/lib/primary-navigation";
import { HomeContent } from "./HomeContent";
import { ENTRY_POINTS, HERO, PREMIUM } from "./home-copy";
import HomePage, { metadata } from "./page";

// The homepage is static: importing the catalog client or the legacy course loader would throw here.
vi.mock("@/lib/catalog/client", () => {
    throw new Error("the homepage must not import the catalog client");
});
vi.mock("@/lib/courses", () => {
    throw new Error("the homepage must not import the course loader");
});

const NESTED_INTERACTIVE = "a a, a button, button a, button button";

describe("structure", () => {
    it("has one h1 and a heading outline that runs proposition, entry points, premium", () => {
        render(<HomeContent />);
        const headings = within(screen.getByRole("main")).getAllByRole("heading");
        expect(headings.map((h) => h.tagName)).toEqual(["H1", "H2", "H3", "H3", "H3", "H2"]);
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1); // page-wide, footer included
        expect(headings[0]).toHaveTextContent(HERO.heading);
        expect(headings.slice(2, 5).map((h) => h.textContent)).toEqual(["Learn", "Knowledge", "Practice"]);
        expect(headings[5]).toHaveTextContent(PREMIUM.heading);
    });

    it("places the sections in order inside a single main landmark", () => {
        render(<HomeContent />);
        const main = screen.getByRole("main");
        const regions = within(main).getAllByRole("region");
        expect(regions).toHaveLength(3);
        const [hero, entry, premium] = regions;
        expect(hero).toHaveAccessibleName(HERO.heading);
        expect(premium).toHaveAccessibleName(PREMIUM.heading);
        expect(hero.compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(entry.compareDocumentPosition(premium) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("renders no learner-state area or placeholder", () => {
        const { container } = render(<HomeContent />);
        expect(screen.queryByText(/continue learning|your progress|recently viewed/i)).toBeNull();
        expect(screen.queryByRole("progressbar")).toBeNull();
        expect(container.querySelector("[disabled], [aria-busy='true'], .animate-pulse")).toBeNull();
        for (const section of within(screen.getByRole("main")).getAllByRole("region")) {
            expect(section.textContent?.trim(), "an empty section would be a visible reserved area").not.toBe("");
        }
    });
});

describe("entry points", () => {
    const links = () => within(screen.getByRole("region", { name: "Where to start" })).getAllByRole("link");

    it("offers Learn, Knowledge and Practice as three links to their landing routes", () => {
        render(<HomeContent />);
        expect(links().map((link) => link.getAttribute("href"))).toEqual(["/tracks", "/knowledge", "/practice"]);
        for (const [link, { title, action, description }] of links().map((l, i) => [l, ENTRY_POINTS[i]] as const)) {
            expect(link).toHaveAccessibleName(`${title} ${action}`);
            expect(link).toHaveAccessibleDescription(description);
        }
    });

    it("points at the same destinations as the primary navigation", () => {
        render(<HomeContent />);
        for (const link of links()) {
            const title = within(link).getByRole("heading").textContent;
            expect(PRIMARY_NAV.find((entry) => entry.label === title)?.href).toBe(link.getAttribute("href"));
        }
    });

    it("nests no interactive control inside another", () => {
        const { container } = render(<HomeContent />);
        expect(container.querySelectorAll(NESTED_INTERACTIVE)).toHaveLength(0);
    });
});

describe("catalog independence", () => {
    it("renders without a request and links to no catalog item", () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        const { container } = render(<HomePage />);
        vi.unstubAllGlobals();

        expect(fetchSpy).not.toHaveBeenCalled();
        const hrefs = [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!);
        expect(hrefs.filter((href) => /^\/(lessons|problems|knowledge|tracks)\/./.test(href) || href.includes("/catalog"))).toEqual([]);
    });
});

describe("legacy courses", () => {
    it("stay reachable through the page footer, outside the main landmark", () => {
        render(<HomeContent />);
        const footer = screen.getByRole("contentinfo");
        expect(within(footer).getByRole("link", { name: "All courses" })).toHaveAttribute("href", "/learn");
        expect(screen.getByRole("main")).not.toContainElement(footer);
    });
});

describe("public claims", () => {
    it("does not make unsupported claims", () => {
        render(<HomeContent />);
        for (const claim of [/5K\+/, /Offer Rate/i, /Testimonials/i, /Trusted by/i, /\$\d/, /lifetime/i, /AI-powered/i, /guarantee/i]) {
            expect(screen.queryByText(claim)).toBeNull();
        }
    });

    it("states that paid access is not available yet", () => {
        render(<HomeContent />);
        expect(screen.getAllByText(/not available yet/i).length).toBeGreaterThan(0);
    });
});

describe("metadata", () => {
    it("describes the product without numbers, rankings or outcome promises", () => {
        expect(metadata.title).toEqual(expect.stringContaining("InterviewNotes"));
        expect(typeof metadata.description).toBe("string");
        expect(metadata.description).not.toMatch(/\d|guarantee|best|#1|trusted|ranked/i);
    });
});
