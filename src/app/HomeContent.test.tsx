import { createHash } from "node:crypto";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeContent } from "./HomeContent";
import { FAQ, HERO, HERO_TOPICS, KNOWLEDGE, PRICING, STATS, TESTIMONIALS, TESTIMONIALS_SECTION, TRACKS } from "./home-copy";
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

const section = (name: string | RegExp) => screen.getByRole("region", { name });
const tracks = () => section(TRACKS.heading);
const knowledge = () => section(KNOWLEDGE.heading);
const testimonials = () => section(TESTIMONIALS_SECTION.heading);
const pricing = () => section(PRICING.heading);

beforeEach(() => stubMotion(false));
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("structure", () => {
    it("has one h1 and a heading outline that runs hero, Tracks, Knowledge, testimonials, pricing, FAQ", () => {
        render(<HomeContent />);
        const headings = within(screen.getByRole("main")).getAllByRole("heading");
        expect(headings.map((h) => h.tagName)).toEqual([1, 2, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 2, 2, 3, 2, 3, 3, 3, 3, 3].map(H));
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1); // page-wide, footer included
        expect(headings.filter((h) => h.tagName === "H2").map((h) => h.textContent)).toEqual([
            TRACKS.heading,
            KNOWLEDGE.heading,
            TESTIMONIALS_SECTION.heading,
            PRICING.heading,
            FAQ.heading,
        ]);
        expect(headings.slice(-FAQ.items.length).map((h) => h.textContent)).toEqual(FAQ.items.map((item) => item.q));
    });

    it("places the sections in order inside a single main landmark, Tracks first", () => {
        render(<HomeContent />);
        const regions = within(screen.getByRole("main")).getAllByRole("region");
        expect(regions).toHaveLength(6);
        const [hero, tracksSection, knowledgeSection, testimonialsSection, pricingSection, faq] = regions;
        expect(hero).toHaveAccessibleName(`${HERO.lead} ${HERO.subject} ${HERO.tail}`);
        expect(tracksSection).toHaveAccessibleName(TRACKS.heading);
        expect(knowledgeSection).toHaveAccessibleName(KNOWLEDGE.heading);
        expect(testimonialsSection).toHaveAccessibleName(TESTIMONIALS_SECTION.heading);
        expect(pricingSection).toHaveAccessibleName(PRICING.heading);
        expect(faq).toHaveAccessibleName(FAQ.heading);
        regions.slice(1).forEach((s, i) => expect(regions[i].compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
    });

    it("marks the page for the pre-P0 palette scope", () => {
        render(<HomeContent />);
        expect(screen.getByRole("main")).toHaveAttribute("data-home");
    });

    it("renders no learner-state area or placeholder", () => {
        const { container } = render(<HomeContent />);
        expect(screen.queryByText(/continue learning|your progress|recently viewed/i)).toBeNull();
        expect(screen.queryByRole("progressbar")).toBeNull();
        expect(container.querySelector("[disabled], [aria-busy='true'], .animate-pulse")).toBeNull();
        for (const s of within(screen.getByRole("main")).getAllByRole("region")) {
            expect(s.textContent?.trim(), "an empty section would be a visible reserved area").not.toBe("");
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

    it("offers two calls to action: the course index that has content today, and the pricing section on this page", () => {
        render(<HomeContent />);
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        expect(within(hero).getByRole("link", { name: HERO.primaryAction.label })).toHaveAttribute("href", "/learn");
        expect(within(hero).getByRole("link", { name: HERO.secondaryAction.label })).toHaveAttribute("href", "#pricing");
        expect(document.getElementById("pricing")).toBe(pricing());
    });

    it("keeps the gold accent on the primary action", () => {
        render(<HomeContent />);
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        expect(within(hero).getByRole("link", { name: HERO.primaryAction.label }).className).toMatch(/\bbg-gold\b/);
    });

    it("lists the subject areas and the restored stats as plain items, not controls", () => {
        render(<HomeContent />);
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        const items = within(hero).getAllByRole("listitem");
        expect(items.length).toBeGreaterThan(STATS.length);
        for (const item of items) expect(item.querySelector("a, button")).toBeNull();
    });

    it("shows the restored pre-P0 stats exactly as they were", () => {
        render(<HomeContent />);
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        for (const [value, label] of [["80+", "Design Modules"], ["5K+", "Engineers"], ["90%", "Offer Rate"], ["6", "Tracks"]]) {
            expect(within(hero).getByText(value).nextElementSibling).toHaveTextContent(label);
        }
        expect(STATS).toHaveLength(4);
    });
});

describe("historical provenance", () => {
    // The pre-P0 source is 51b99f3:src/app/HomeContent.tsx. This hash is of its eight testimonials as written there.
    it("keeps all eight testimonials word for word as in the pre-P0 source", () => {
        const fields = TESTIMONIALS.map(({ name, role, company, quote, initials }) => ({ name, role, company, quote, initials }));
        expect(fields).toHaveLength(8);
        expect(createHash("sha256").update(JSON.stringify(fields)).digest("hex")).toBe("e4e9271f3ddb6e701868b51dabbc4fcdf548c532c97d279bc13e3f2eebeb9ce6");
    });

    it("keeps the four stats and the section wording as in the pre-P0 source", () => {
        expect(STATS.map(({ value, label }) => `${value} ${label}`)).toEqual(["80+ Design Modules", "5K+ Engineers", "90% Offer Rate", "6 Tracks"]);
        expect(TESTIMONIALS_SECTION).toEqual({
            label: "Testimonials",
            heading: "Engineers Who Landed Offers",
            lead: "Trusted by engineers at Google, Meta, Amazon, Netflix, Apple & Microsoft.",
        });
        expect(HERO.eyebrow).toBe("Your complete interview prep");
        expect(`${HERO.intro.before}${HERO.intro.emphasis}${HERO.intro.after}`).toBe(
            "One platform for ML System Design, LLM Platforms & GenAI interviews. Everything you need to land your dream ML/AI offer.",
        );
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

describe("tracks", () => {
    it("leads the product: the first section after the hero, with one card per track and one primary action", () => {
        render(<HomeContent />);
        const cards = within(tracks()).getAllByRole("heading", { level: 3 });
        expect(cards.map((h) => h.textContent)).toEqual(TRACKS.items.map((item) => item.title));
        expect(document.getElementById("tracks")).toBe(tracks());
    });

    it("opens each card on its live course and the action on the course index, never on a catalog item", () => {
        render(<HomeContent />);
        const links = within(tracks()).getAllByRole("link");
        expect(links.map((link) => link.getAttribute("href"))).toEqual([
            "/learn/gen-ai-native-design",
            "/learn/ml-system-design",
            "/learn/llm-platform-design",
            "/learn/ml-platform-design",
            "/learn/gen-ai-foundations",
            "/learn",
        ]);
        expect(within(tracks()).getByRole("link", { name: new RegExp(TRACKS.action.label) })).toHaveAttribute("href", "/learn");
    });

    it("names each card by its title and tagline, with the Explore cue inside the same link", () => {
        render(<HomeContent />);
        for (const { title, tagline } of TRACKS.items) {
            const link = within(tracks()).getByRole("link", { name: new RegExp(`^${title}\\b`) });
            expect(link).toHaveTextContent(tagline);
            expect(link).toHaveTextContent(TRACKS.cardAction);
        }
    });

    it("explains the path as Tracks, then modules, then content, in order", () => {
        render(<HomeContent />);
        const steps = within(tracks()).getAllByRole("listitem").slice(0, TRACKS.steps.length);
        expect(steps.map((li) => li.textContent?.replace(/^\d/, ""))).toEqual([...TRACKS.steps]);
    });

    it("shows no per-track counts or durations, which the static page cannot know", () => {
        render(<HomeContent />);
        expect(within(tracks()).queryByText(/\b\d+\s*(chapters?|lessons?|modules?|problems?|hours?|h)\b/i)).toBeNull();
    });

    it("nests no interactive control inside another anywhere on the page", () => {
        const { container } = render(<HomeContent />);
        expect(container.querySelectorAll(NESTED_INTERACTIVE)).toHaveLength(0);
    });

    it("keeps the decorative icons out of the accessibility tree", () => {
        render(<HomeContent />);
        for (const link of within(tracks()).getAllByRole("link")) expect(link.querySelectorAll("svg:not([aria-hidden='true'])")).toHaveLength(0);
    });
});

describe("knowledge", () => {
    it("presents the four editorial groups and one link into the explorer", () => {
        render(<HomeContent />);
        expect(within(knowledge()).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
            "Core Concepts",
            "Technologies & Research",
            "Patterns",
            "Quick References",
        ]);
        const links = within(knowledge()).getAllByRole("link");
        expect(links.map((l) => l.getAttribute("href"))).toEqual(["/knowledge"]);
        expect(links[0]).toHaveAccessibleName(KNOWLEDGE.action.label);
        expect(document.getElementById("knowledge")).toBe(knowledge());
    });

    it("is positioned as supporting the Tracks, after them", () => {
        render(<HomeContent />);
        expect(tracks().compareDocumentPosition(knowledge()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(KNOWLEDGE.lead).toMatch(/every track/i);
    });
});

describe("testimonials", () => {
    it("restores all eight pre-P0 testimonials once for assistive technology, in two rows", () => {
        render(<HomeContent />);
        expect(TESTIMONIALS).toHaveLength(8);
        const rows = within(testimonials()).getAllByRole("list");
        expect(rows.map((row) => within(row).getAllByRole("figure").length)).toEqual([4, 4]);
        const figures = within(testimonials()).getAllByRole("figure"); // the aria-hidden loop copies are not exposed
        expect(figures).toHaveLength(TESTIMONIALS.length);
        TESTIMONIALS.forEach(({ name, quote, role, company }, i) => {
            expect(figures[i]).toHaveTextContent(quote);
            expect(figures[i]).toHaveTextContent(`${name}${role} at ${company}`);
        });
        expect(within(testimonials()).getByText(TESTIMONIALS_SECTION.lead)).toBeInTheDocument();
    });

    it("duplicates each row for a seamless loop, hidden from assistive technology", () => {
        const { container } = render(<HomeContent />);
        const hidden = container.querySelectorAll("section li[aria-hidden='true']");
        expect(hidden).toHaveLength(TESTIMONIALS.length);
        for (const copy of hidden) expect(copy.querySelector("a, button")).toBeNull();
    });

    it("pauses and resumes the drift from a labelled button", () => {
        render(<HomeContent />);
        const button = within(testimonials()).getByRole("button", { name: "Pause testimonials" });
        fireEvent.click(button);
        expect(testimonials()).toHaveAttribute("data-paused", "true");
        fireEvent.click(within(testimonials()).getByRole("button", { name: "Play testimonials" }));
        expect(testimonials()).toHaveAttribute("data-paused", "false");
    });

    it("drifts in opposite directions", () => {
        const { container } = render(<HomeContent />);
        expect(container.querySelectorAll(".testimonial-scroll-left")).toHaveLength(1);
        expect(container.querySelectorAll(".testimonial-scroll-right")).toHaveLength(1);
    });
});

describe("pricing", () => {
    it("shows the three approved planned prices as parallel, informational plans", () => {
        render(<HomeContent />);
        const plans = within(within(pricing()).getByRole("list", { name: PRICING.listLabel })).getAllByRole("listitem");
        expect(plans.map((item) => item.textContent)).toEqual(["Annual$50/yearPlanned", "3-year$100/3 yearsPlanned", "Lifetime$150/lifetimePlanned"]);
        for (const item of plans) expect(item.querySelector("a, button, input, form")).toBeNull();
    });

    it("says the plans are planned and not yet available, with a free path into the courses", () => {
        render(<HomeContent />);
        expect(within(pricing()).getByText(PRICING.lead)).toHaveTextContent(/not available yet/i);
        expect(within(pricing()).getByText(PRICING.note)).toHaveTextContent(/not available yet/i);
        expect(within(pricing()).getAllByText(PRICING.badge)).toHaveLength(PRICING.plans.length);
        expect(within(pricing()).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/learn"]);
        expect(within(pricing()).queryByRole("button")).toBeNull();
    });

    it("introduces no purchase or checkout action or form, and restores neither $40 nor Most Popular", () => {
        const { container } = render(<HomeContent />);
        const main = screen.getByRole("main");
        expect(main.querySelector("form, input, select, textarea")).toBeNull();
        expect(within(main).queryByRole("button", { name: /buy|purchase|checkout|subscribe|upgrade|pay|get (full )?(access|premium)/i })).toBeNull();
        expect(within(main).queryByRole("link", { name: /buy|purchase|checkout|subscribe|upgrade|pay|get (full )?(access|premium)/i })).toBeNull();
        const hrefs = [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!);
        expect(hrefs.filter((href) => /checkout|billing|purchase|subscribe|stripe|payment/i.test(href))).toEqual([]);
        expect(main.textContent).not.toMatch(/\$40|most popular/i);
    });
});

describe("FAQ", () => {
    const toggles = () => within(section(FAQ.heading)).getAllByRole("button");

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
        expect(section(FAQ.heading)).toHaveTextContent(FAQ.items[0].a);
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

describe("product positioning", () => {
    it("offers Tracks and Knowledge only: no standalone Practice product or unbuilt AI practice capability", () => {
        const { container } = render(<HomeContent />);
        const main = screen.getByRole("main");
        const hrefs = [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!);
        expect(hrefs.filter((href) => href.startsWith("/practice") || href.startsWith("/problems"))).toEqual([]);
        expect(within(main).queryByRole("heading", { name: /^practice$/i })).toBeNull();
        expect(main.textContent).not.toMatch(/mock interview|AI interviewer|whiteboard|AI scoring|voice practice|AI-powered/i);
    });

    it("keeps Explore inside the Tracks, not as a product of its own", () => {
        render(<HomeContent />);
        expect(within(tracks()).getAllByText(TRACKS.cardAction)).toHaveLength(TRACKS.items.length);
        expect(within(screen.getByRole("main")).queryByRole("heading", { name: /^explore$/i })).toBeNull();
    });
});

describe("public claims", () => {
    it("adds no pricing terms beyond the three approved prices", () => {
        render(<HomeContent />);
        const main = screen.getByRole("main");
        expect(main.textContent?.match(/\$\d+(?:[.,]\d+)?/g)).toEqual(["$50", "$100", "$150"]);
        for (const claim of [/discount|% off|save \d|on sale/i, /limited[- ]time|early[- ]bird/i, /refund|money-back|cancel anytime/i, /free trial|trial/i, /\btax|\bvat\b/i, /guarantee/i]) {
            expect(within(main).queryByText(claim)).toBeNull();
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
