import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRIMARY_NAV } from "@/lib/primary-navigation";
import { HomeContent } from "./HomeContent";
import { ENTRY_POINTS, FAQ, HERO, HERO_TOPICS, PREMIUM, PRICING } from "./home-copy";
import HomePage, { metadata } from "./page";

// The homepage is static: importing the catalog client or the legacy course loader would throw here.
vi.mock("@/lib/catalog/client", () => {
    throw new Error("the homepage must not import the catalog client");
});
vi.mock("@/lib/courses", () => {
    throw new Error("the homepage must not import the course loader");
});

const NESTED_INTERACTIVE = "a a, a button, button a, button button";
const H = (n: number) => `H${n}`;

function stubMotion(reduce: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => stubMotion(false));
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("structure", () => {
    it("has one h1 and a heading outline that runs proposition, entry points, access, FAQ", () => {
        render(<HomeContent />);
        const headings = within(screen.getByRole("main")).getAllByRole("heading");
        expect(headings.map((h) => h.tagName)).toEqual([1, 2, 3, 3, 3, 2, 3, 3, 2, 3, 3, 3, 3, 3].map(H));
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1); // page-wide, footer included
        expect(headings.slice(2, 5).map((h) => h.textContent)).toEqual(["Learn", "Knowledge", "Practice"]);
        expect(headings[5]).toHaveTextContent(PREMIUM.heading);
        expect(headings[8]).toHaveTextContent(FAQ.heading);
        expect(headings.slice(9).map((h) => h.textContent)).toEqual(FAQ.items.map((item) => item.q));
    });

    it("places the sections in order inside a single main landmark", () => {
        render(<HomeContent />);
        const main = screen.getByRole("main");
        const regions = within(main).getAllByRole("region");
        expect(regions).toHaveLength(4);
        const [hero, entry, premium, faq] = regions;
        expect(hero).toHaveAccessibleName(`${HERO.lead} ${HERO.subject} ${HERO.tail}`);
        expect(entry).toHaveAccessibleName("Where to start");
        expect(premium).toHaveAccessibleName(PREMIUM.heading);
        expect(faq).toHaveAccessibleName(FAQ.heading);
        regions.slice(1).forEach((section, i) => expect(regions[i].compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
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

describe("hero", () => {
    it("is named by static text, so the animated subject adds nothing to the heading", () => {
        render(<HomeContent />);
        const h1 = screen.getByRole("heading", { level: 1 });
        expect(h1).toHaveAccessibleName(`${HERO.lead} ${HERO.subject} ${HERO.tail}`);
        for (const topic of HERO_TOPICS) expect(within(h1).getByText(topic).closest("[aria-hidden='true']")).not.toBeNull();
    });

    it("offers two calls to action: the Learn landing route, and the access section on this page", () => {
        render(<HomeContent />);
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        expect(within(hero).getByRole("link", { name: HERO.primaryAction.label })).toHaveAttribute("href", "/tracks");
        expect(within(hero).getByRole("link", { name: HERO.secondaryAction.label })).toHaveAttribute("href", "#access");
        expect(document.getElementById("access")).toBe(screen.getByRole("region", { name: PREMIUM.heading }));
    });

    it("keeps the gold accent on the primary action", () => {
        render(<HomeContent />);
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        expect(within(hero).getByRole("link", { name: HERO.primaryAction.label }).className).toMatch(/\bbg-gold\b/);
    });

    it("lists the subject areas as plain items, not controls", () => {
        render(<HomeContent />);
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        const chips = within(hero).getAllByRole("listitem");
        expect(chips.length).toBeGreaterThan(0);
        for (const chip of chips) expect(chip.querySelector("a, button")).toBeNull();
    });
});

describe("rotating subject", () => {
    const active = () =>
        HERO_TOPICS.filter((topic) => within(screen.getByRole("heading", { level: 1 })).getByText(topic).className.includes("opacity-100"));

    it("steps through every topic once, returns to the first and then stops, within five seconds", () => {
        vi.useFakeTimers();
        render(<HomeContent />);
        expect(active()).toEqual([HERO_TOPICS[0]]);
        for (let step = 1; step < HERO_TOPICS.length; step++) {
            act(() => void vi.advanceTimersByTime(1200));
            expect(active()).toEqual([HERO_TOPICS[step]]);
        }
        act(() => void vi.advanceTimersByTime(1200));
        expect(active()).toEqual([HERO_TOPICS[0]]);
        vi.advanceTimersByTime(60_000);
        expect(active(), "it rests on the first topic").toEqual([HERO_TOPICS[0]]);
        expect(1200 * HERO_TOPICS.length, "WCAG 2.2.2: moving content that stops within 5s needs no control").toBeLessThanOrEqual(5000);
    });

    it("stays on the first topic when the reader prefers reduced motion", () => {
        stubMotion(true);
        vi.useFakeTimers();
        render(<HomeContent />);
        act(() => void vi.advanceTimersByTime(1200));
        expect(active()).toEqual([HERO_TOPICS[0]]);
        act(() => void vi.advanceTimersByTime(10_000));
        expect(active()).toEqual([HERO_TOPICS[0]]);
    });

    it("clears its timers when it unmounts", () => {
        vi.useFakeTimers();
        const { unmount } = render(<HomeContent />);
        const pending = vi.getTimerCount();
        unmount();
        expect(vi.getTimerCount()).toBeLessThanOrEqual(pending - HERO_TOPICS.length);
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

    it("keeps the decorative icons out of the accessibility tree", () => {
        render(<HomeContent />);
        for (const link of links()) expect(link.querySelectorAll("svg:not([aria-hidden='true'])")).toHaveLength(0);
    });

    it("nests no interactive control inside another", () => {
        const { container } = render(<HomeContent />);
        expect(container.querySelectorAll(NESTED_INTERACTIVE)).toHaveLength(0);
    });
});

describe("access", () => {
    it("says what is free and what is planned, with no purchase action", () => {
        render(<HomeContent />);
        const access = screen.getByRole("region", { name: PREMIUM.heading });
        expect(within(access).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/tracks"]);
        expect(within(access).queryByRole("button")).toBeNull();
        expect(within(access).getByText(PREMIUM.note)).toBeInTheDocument();
    });

    it("shows the three approved planned prices, as informational text", () => {
        render(<HomeContent />);
        const access = screen.getByRole("region", { name: PREMIUM.heading });
        const prices = within(within(access).getByRole("list", { name: PRICING.label })).getAllByRole("listitem");
        expect(prices.map((item) => item.textContent)).toEqual(["$50/year", "$100/3 years", "$150/lifetime"]);
        for (const { amount, unit } of PRICING.plans) expect(within(access).getByText(amount).parentElement).toHaveTextContent(`${amount}${unit}`);
        for (const item of prices) expect(item.querySelector("a, button, input, form")).toBeNull();
    });

    it("labels the prices as planned and not yet available, without a heading of its own", () => {
        render(<HomeContent />);
        const access = screen.getByRole("region", { name: PREMIUM.heading });
        expect(within(access).getByText(PRICING.label)).toHaveTextContent(/planned/i);
        expect(within(access).getByText(PRICING.note)).toHaveTextContent(/not available yet/i);
        expect(within(access).queryByRole("heading", { name: PRICING.label })).toBeNull();
    });

    it("introduces no purchase or checkout action or form", () => {
        const { container } = render(<HomeContent />);
        const main = screen.getByRole("main");
        expect(main.querySelector("form, input, select, textarea")).toBeNull();
        expect(within(main).queryByRole("button", { name: /buy|purchase|checkout|subscribe|upgrade|pay|get (full )?access/i })).toBeNull();
        expect(within(main).queryByRole("link", { name: /buy|purchase|checkout|subscribe|upgrade|pay|get (full )?access/i })).toBeNull();
        const hrefs = [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!);
        expect(hrefs.filter((href) => /checkout|billing|purchase|subscribe|stripe|payment|pricing/i.test(href))).toEqual([]);
    });
});

describe("FAQ", () => {
    const toggles = () => within(screen.getByRole("region", { name: FAQ.heading })).getAllByRole("button");

    it("starts collapsed, with one toggle per question", () => {
        render(<HomeContent />);
        expect(toggles()).toHaveLength(FAQ.items.length);
        for (const toggle of toggles()) expect(toggle).toHaveAttribute("aria-expanded", "false");
    });

    it("opens an answer with the keyboard-operable toggle and closes it again", () => {
        render(<HomeContent />);
        const [first] = toggles();
        fireEvent.click(first);
        expect(first).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("region", { name: FAQ.heading })).toHaveTextContent(FAQ.items[0].a);
        fireEvent.click(first);
        expect(first).toHaveAttribute("aria-expanded", "false");
    });
});

describe("catalog independence", () => {
    it("renders without a request and links to no catalog item", () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        const { container } = render(<HomePage />);

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
        for (const claim of [/5K\+/, /Offer Rate/i, /Testimonials/i, /Trusted by/i, /AI-powered/i, /guarantee/i]) {
            expect(screen.queryByText(claim)).toBeNull();
        }
    });

    it("adds no pricing terms beyond the three approved prices", () => {
        render(<HomeContent />);
        const main = screen.getByRole("main");
        expect(main.textContent?.match(/\$\d+(?:[.,]\d+)?/g)).toEqual(["$50", "$100", "$150"]);
        for (const claim of [/discount|% off|save \d|on sale/i, /limited[- ]time|early[- ]bird/i, /refund|money-back|cancel anytime/i, /free trial|trial/i, /\btax|\bvat\b/i]) {
            expect(within(main).queryByText(claim)).toBeNull();
        }
    });

    it("shows no counts of content", () => {
        render(<HomeContent />);
        expect(within(screen.getByRole("main")).queryByText(/\b\d+\s*(chapters?|tracks?|lessons?|problems?|hours?|h)\b/i)).toBeNull();
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
