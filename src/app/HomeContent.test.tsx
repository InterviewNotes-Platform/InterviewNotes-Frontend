import { createHash } from "node:crypto";
import type { ComponentProps } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeContent } from "./HomeContent";
import { FREE_CHAPTER_LESSON_SLUG } from "@/lib/catalog/home";
import { explorerHref, parseGroup } from "@/lib/catalog/knowledge";
import { TRACKS_ENTRY } from "@/lib/primary-navigation";
import { CLOSING, FAQ, HERO, HERO_AREAS, HERO_TOPICS, KNOWLEDGE, PRICING, STATS, STATS_DISCLOSURE, TESTIMONIALS, TESTIMONIALS_SECTION, TRACKS } from "./home-copy";
import HomePage, * as homeModule from "./page";

const { listCatalogTracks, getCatalogItemMeta } = vi.hoisted(() => ({ listCatalogTracks: vi.fn(), getCatalogItemMeta: vi.fn() }));
vi.mock("@/lib/catalog/client", () => ({ listCatalogTracks, getCatalogItemMeta }));
vi.mock("@/lib/courses", () => {
    throw new Error("the homepage must not import the course loader");
});
vi.mock("next/link", async () => {
    const { createElement } = await import("react");
    return { default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});

const CARDS = [
    { id: "track.alpha", title: "Alpha Track", summary: "Alpha summary.", href: "/tracks/alpha" },
    { id: "track.beta", title: "Beta Track", summary: "Beta summary.", href: "/tracks/beta" },
    { id: "track.gamma", title: "Gamma Track", summary: "", href: "/tracks/gamma" },
];
const FREE_HREF = `/lessons/${FREE_CHAPTER_LESSON_SLUG}`;

function renderHome(props: Partial<ComponentProps<typeof HomeContent>> = {}) {
    return render(<HomeContent tracks={{ status: "ok", cards: CARDS }} freeChapterHref={FREE_HREF} {...props} />);
}

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
        renderHome();
        const headings = within(screen.getByRole("main")).getAllByRole("heading");
        expect(headings.map((h) => h.tagName)).toEqual([1, 2, 3, 3, 3, 2, 3, 3, 3, 3, 2, 2, 3, 2, 3, 3, 3, 3, 3, 2].map(H));
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1); // page-wide, footer included
        expect(headings.filter((h) => h.tagName === "H2").map((h) => h.textContent)).toEqual([
            TRACKS.heading,
            KNOWLEDGE.heading,
            TESTIMONIALS_SECTION.heading,
            PRICING.heading,
            FAQ.heading,
            CLOSING.heading,
        ]);
        expect(headings.slice(-FAQ.items.length - 1, -1).map((h) => h.textContent)).toEqual(FAQ.items.map((item) => item.q));
    });

    it("places the sections in order inside a single main landmark, Tracks first", () => {
        renderHome();
        const regions = within(screen.getByRole("main")).getAllByRole("region");
        expect(regions).toHaveLength(7);
        const [hero, tracksSection, knowledgeSection, testimonialsSection, pricingSection, faq, closing] = regions;
        expect(hero).toHaveAccessibleName(`${HERO.lead} ${HERO.subject} ${HERO.tail}`);
        expect(tracksSection).toHaveAccessibleName(TRACKS.heading);
        expect(knowledgeSection).toHaveAccessibleName(KNOWLEDGE.heading);
        expect(testimonialsSection).toHaveAccessibleName(TESTIMONIALS_SECTION.heading);
        expect(pricingSection).toHaveAccessibleName(PRICING.heading);
        expect(faq).toHaveAccessibleName(FAQ.heading);
        expect(closing).toHaveAccessibleName(CLOSING.heading);
        regions.slice(1).forEach((s, i) => expect(regions[i].compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
    });

    it("puts the Tracks directly after the hero, ahead of the statistics band, and Knowledge after the band", () => {
        renderHome();
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        const band = screen.getByText(STATS[0].value).closest("ul")!;
        expect(hero.nextElementSibling).toBe(tracks());
        expect(tracks().compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(band.compareDocumentPosition(knowledge()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(within(tracks()).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(CARDS.map(({ href }) => href));
    });

    it("marks the page for the pre-P0 palette scope", () => {
        renderHome();
        expect(screen.getByRole("main")).toHaveAttribute("data-home");
    });

    it("renders no learner-state area or placeholder", () => {
        const { container } = renderHome();
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
        renderHome();
        const h1 = screen.getByRole("heading", { level: 1 });
        expect(h1).toHaveAccessibleName(`${HERO.lead} ${HERO.subject} ${HERO.tail}`);
        for (const topic of HERO_TOPICS) expect(within(h1).getByText(topic).closest("[aria-hidden='true']")).not.toBeNull();
    });

    it("offers Browse Tracks to the Tracks section on this page, and a free chapter that opens its Lesson", () => {
        renderHome();
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        expect(HERO.primaryAction.label).toBe("Browse Tracks");
        expect(within(hero).getByRole("link", { name: HERO.primaryAction.label })).toHaveAttribute("href", "/#tracks");
        expect(within(hero).getByRole("link", { name: HERO.freeChapterLabel })).toHaveAttribute("href", FREE_HREF);
        expect(within(hero).getByRole("link", { name: HERO.freeChapterLabel })).toHaveAttribute("data-prefetch", "false");
        expect(within(hero).getAllByRole("link")).toHaveLength(2);
        expect(document.getElementById("tracks")).toBe(tracks());
    });

    it("offers no free-chapter action when the Lesson is not confirmed free", () => {
        renderHome({ freeChapterHref: null });
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        expect(within(hero).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([TRACKS_ENTRY]);
        expect(screen.queryByText(HERO.freeChapterLabel)).toBeNull();
    });

    it("styles Browse Tracks as the prototype's dark primary pill and the free chapter as its light pill", () => {
        renderHome();
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        expect(within(hero).getByRole("link", { name: HERO.primaryAction.label }).className).toMatch(/\bbg-foreground\b.*\btext-background\b/);
        expect(within(hero).getByRole("link", { name: HERO.freeChapterLabel }).className).toMatch(/\bbg-card\b/);
    });

    it("lists the subject areas as plain items, not controls", () => {
        renderHome();
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        const items = within(hero).getAllByRole("listitem");
        expect(items.map((item) => item.textContent)).toEqual([...HERO_AREAS]);
        for (const item of items) expect(item.querySelector("a, button")).toBeNull();
    });

    it("keeps the prototype's reader-window stage in the hero as decoration: hidden from assistive technology, with no link, control or figure", () => {
        renderHome();
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        const stage = hero.querySelector("[data-hero-stage][aria-hidden='true']");
        expect(stage).not.toBeNull();
        expect(stage?.querySelector("a, button, input, img, [tabindex]")).toBeNull();
        expect(stage?.textContent).toContain("Design a RAG system for 50M internal docs.");
        expect(within(hero).queryByText(/\b(free|pro|premium)\b/i, { ignore: "[aria-hidden='true'] *, a[href^='/lessons/']" })).toBeNull(); // the free-chapter action is the one place the hero's own text says free
    });

    it("hides the floating cards around the headline from assistive technology too", () => {
        renderHome();
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        for (const text of ["Chapter complete", "Next up · 06", "Saved to notes"]) {
            expect(within(hero).getByText(text).closest("[aria-hidden='true']"), text).not.toBeNull();
        }
        expect(hero.querySelector("h2, h3, [role='img']")).toBeNull();
    });
});

describe("hero motion", () => {
    const clocks = () => screen.getAllByText(/^\d\d:\d\d$/).map((el) => el.textContent);
    const pause = () => screen.getByRole("button", { name: /animation$/ });

    it("ticks the round clocks together, and the pause control stops and restarts them", () => {
        vi.useFakeTimers();
        renderHome();
        expect(clocks()).toEqual(["27:40", "27:40"]);
        act(() => void vi.advanceTimersByTime(3000));
        expect(clocks()).toEqual(["27:37", "27:37"]);
        fireEvent.click(pause());
        expect(pause()).toHaveTextContent("Play animation");
        expect(pause().closest("[data-paused]")).toHaveAttribute("data-paused", "true");
        act(() => void vi.advanceTimersByTime(5000));
        expect(clocks()).toEqual(["27:37", "27:37"]);
        fireEvent.click(pause());
        expect(pause()).toHaveTextContent("Pause animation");
        act(() => void vi.advanceTimersByTime(2000));
        expect(clocks()).toEqual(["27:35", "27:35"]);
    });

    it("keeps the clocks still when the reader prefers reduced motion", () => {
        stubMotion(true);
        vi.useFakeTimers();
        renderHome();
        act(() => void vi.advanceTimersByTime(5000));
        expect(clocks()).toEqual(["27:40", "27:40"]);
    });

    it("offers the pause control as the only button in the hero, after the two actions", () => {
        renderHome();
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        expect(within(hero).getAllByRole("button")).toEqual([pause()]);
        expect(within(hero).getAllByRole("link").at(-1)!.compareDocumentPosition(pause()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
});

describe("stats band", () => {
    it("follows the Tracks and comes before Knowledge, as a plain list outside the named sections", () => {
        renderHome();
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        const band = screen.getByText(STATS[0].value).closest("ul")!;
        expect(hero.contains(band)).toBe(false);
        expect(band.closest("[role='region'], section")).toBeNull();
        expect(hero.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(tracks().compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(band.compareDocumentPosition(knowledge()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        for (const item of within(band).getAllByRole("listitem")) expect(item.querySelector("a, button")).toBeNull();
    });

    it("shows the restored pre-P0 stats exactly as they were", () => {
        renderHome();
        const band = screen.getByText(STATS[0].value).closest("ul")!;
        for (const [value, label] of [["80+", "Design Modules"], ["5K+", "Engineers"], ["90%", "Offer Rate"], ["6", "Tracks"]]) {
            expect(within(band).getByText(value).nextElementSibling).toHaveTextContent(label);
        }
        expect(STATS).toHaveLength(4);
    });

    it("says in view of the figures that they are samples, not verified results", () => {
        renderHome();
        const band = screen.getByText(STATS[0].value).closest("ul")!;
        const note = screen.getByText(STATS_DISCLOSURE.text);
        expect(STATS_DISCLOSURE.text).toMatch(/sample statistics.*illustrative.*not verified results/i);
        expect(note.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(note).toHaveTextContent(STATS_DISCLOSURE.label);
        expect(note).toBe(band.previousElementSibling);
        expect(screen.getByRole("main").textContent).not.toMatch(/verified (results|outcomes)(?!\.)|independently (confirmed|verified)/i);
    });
});

describe("historical provenance", () => {
    // The pre-P0 source is 51b99f3:src/app/HomeContent.tsx. This hash is of its eight testimonials as written there.
    it("keeps all eight testimonials word for word as in the pre-P0 source", () => {
        const fields = TESTIMONIALS.map(({ name, role, company, quote, initials }) => ({ name, role, company, quote, initials }));
        expect(fields).toHaveLength(8);
        expect(createHash("sha256").update(JSON.stringify(fields)).digest("hex")).toBe("e4e9271f3ddb6e701868b51dabbc4fcdf548c532c97d279bc13e3f2eebeb9ce6");
    });

    it("keeps the four stats as in the pre-P0 source", () => {
        expect(STATS.map(({ value, label }) => `${value} ${label}`)).toEqual(["80+ Design Modules", "5K+ Engineers", "90% Offer Rate", "6 Tracks"]);
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
        renderHome();
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
        renderHome();
        act(() => void vi.advanceTimersByTime(1200));
        expect(active()).toEqual([HERO_TOPICS[0]]);
        act(() => void vi.advanceTimersByTime(10_000));
        expect(active()).toEqual([HERO_TOPICS[0]]);
    });

    it("clears its timers when it unmounts", () => {
        vi.useFakeTimers();
        const { unmount } = renderHome();
        const pending = vi.getTimerCount();
        unmount();
        expect(vi.getTimerCount()).toBeLessThanOrEqual(pending - HERO_TOPICS.length);
    });
});

describe("tracks", () => {
    const cards = () => within(tracks()).getAllByRole("heading", { level: 3 });

    it("leads the product: the first section after the hero, named by its heading and reachable at #tracks", () => {
        renderHome();
        expect(document.getElementById("tracks")).toBe(tracks());
        expect(tracks()).toHaveAccessibleName(TRACKS.heading);
    });

    it("shows one card per published Track, in the API's order, with its real title and summary", () => {
        renderHome();
        expect(cards().map((h) => h.textContent)).toEqual(CARDS.map((card) => card.title));
        const alpha = within(tracks()).getByRole("link", { name: /^Alpha Track\b/ });
        expect(alpha).toHaveTextContent("Alpha summary.");
        expect(alpha).toHaveTextContent(TRACKS.cardAction);
    });

    it("opens each card on its Track page without prefetching it, and links nothing else from the cards", () => {
        renderHome();
        const links = within(tracks()).getAllByRole("link");
        expect(links.map((link) => link.getAttribute("href"))).toEqual(["/tracks/alpha", "/tracks/beta", "/tracks/gamma"]);
        for (const link of links) expect(link).toHaveAttribute("data-prefetch", "false");
    });

    it("renders no card for a Track with no summary other than its title, and no empty summary", () => {
        renderHome();
        const gamma = within(tracks()).getByRole("link", { name: /^Gamma Track\b/ });
        expect(gamma.querySelectorAll("p")).toHaveLength(0);
    });

    it("renders as many cards as there are Tracks: one, or many", () => {
        const many = Array.from({ length: 9 }, (_, i) => ({ id: `track.t${i}`, title: `Track ${i}`, summary: `Summary ${i}.`, href: `/tracks/t${i}` }));
        const { unmount } = renderHome({ tracks: { status: "ok", cards: CARDS.slice(0, 1) } });
        expect(cards()).toHaveLength(1);
        unmount();
        renderHome({ tracks: { status: "ok", cards: many } });
        expect(cards()).toHaveLength(9);
    });

    it("says no Tracks are published when the list is empty, with no card and no fallback card", () => {
        renderHome({ tracks: { status: "empty" } });
        expect(within(tracks()).getByText("No Tracks are published yet.")).toBeInTheDocument();
        expect(within(tracks()).queryAllByRole("heading", { level: 3 })).toHaveLength(0);
        expect(within(tracks()).queryAllByRole("link")).toHaveLength(0);
    });

    it("says the Tracks could not be loaded, with the Knowledge link in place of the cards", () => {
        renderHome({ tracks: { status: "unavailable" } });
        expect(within(tracks()).getByText(TRACKS.unavailable)).toBeInTheDocument();
        expect(within(tracks()).queryByText(TRACKS.empty)).toBeNull();
        expect(within(tracks()).queryAllByRole("heading", { level: 3 })).toHaveLength(0);
        const links = within(tracks()).getAllByRole("link");
        expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([[KNOWLEDGE.action.label, "/knowledge"]]);
    });

    it("names the Tracks in its heading, so the list reads as the courses to browse", () => {
        renderHome();
        expect(TRACKS.heading).toBe("Choose Your Track");
        expect(within(tracks()).getByRole("heading", { level: 2 })).toHaveTextContent(/track/i);
        expect(tracks()).toHaveAttribute("id", "tracks");
    });

    it("explains the path as Tracks, then modules, then content, in order", () => {
        renderHome();
        const steps = within(tracks()).getAllByRole("listitem").slice(0, TRACKS.steps.length);
        expect(steps.map((li) => li.textContent?.replace(/^\d/, ""))).toEqual([...TRACKS.steps]);
    });

    it("shows no counts, durations, badges or access claims, which the Track list does not carry", () => {
        renderHome();
        expect(within(tracks()).queryByText(/\b\d+\s*(chapters?|lessons?|modules?|problems?|hours?|h)\b/i)).toBeNull();
        expect(within(tracks()).queryByText(/\b(free|premium|pro|popular|new)\b/i, { ignore: "[aria-hidden='true'] *" })).toBeNull();
    });

    it("has no separate Explore Tracks action: the section is the destination", () => {
        renderHome();
        expect(within(tracks()).queryByRole("link", { name: /explore tracks/i })).toBeNull();
        expect(within(tracks()).queryByRole("link", { name: TRACKS_ENTRY })).toBeNull();
    });

    it("nests no interactive control inside another anywhere on the page", () => {
        const { container } = renderHome();
        expect(container.querySelectorAll(NESTED_INTERACTIVE)).toHaveLength(0);
    });

    it("keeps the decorative icons out of the accessibility tree", () => {
        renderHome();
        for (const link of within(tracks()).getAllByRole("link")) expect(link.querySelectorAll("svg:not([aria-hidden='true'])")).toHaveLength(0);
    });
});

describe("knowledge", () => {
    it("presents the four editorial groups, each opening the explorer on its group, and one link into the explorer", () => {
        renderHome();
        expect(within(knowledge()).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
            "Core Concepts",
            "Technologies & Research",
            "Patterns",
            "Quick References",
        ]);
        const links = within(knowledge()).getAllByRole("link");
        expect(links.map((l) => l.getAttribute("href"))).toEqual([...KNOWLEDGE.groups.map((group) => group.href), "/knowledge"]);
        expect(links.at(-1)).toHaveAccessibleName(KNOWLEDGE.action.label);
        expect(document.getElementById("knowledge")).toBe(knowledge());
    });

    it("links each group to the id the explorer itself parses", () => {
        for (const { key, href } of KNOWLEDGE.groups) {
            const group = parseGroup(key);
            expect(group).not.toBeNull();
            expect(href).toBe(explorerHref({ group }));
        }
    });

    it("is positioned as supporting the Tracks, after them", () => {
        renderHome();
        expect(tracks().compareDocumentPosition(knowledge()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(KNOWLEDGE.lead).toMatch(/every track/i);
    });
});

describe("testimonials", () => {
    it("presents the quotes as labelled samples, never as customer endorsements", () => {
        renderHome();
        expect(TESTIMONIALS_SECTION.heading).toBe("Sample Testimonials");
        expect(TESTIMONIALS_SECTION.lead).toMatch(/not real customer testimonials/i);
        expect(`${TESTIMONIALS_SECTION.heading} ${TESTIMONIALS_SECTION.lead}`).not.toMatch(/trusted|landed offers/i);
        expect(within(testimonials()).getByText(TESTIMONIALS_SECTION.lead)).toBeInTheDocument();
        for (const figure of within(testimonials()).getAllByRole("figure")) expect(figure).toHaveTextContent(TESTIMONIALS_SECTION.cardLabel);
    });

    it("shows all eight testimonials word for word, Emily C. included, in two rows of four", () => {
        renderHome();
        expect(TESTIMONIALS).toHaveLength(8);
        const rows = within(testimonials()).getAllByRole("list");
        expect(rows.map((row) => within(row).getAllByRole("figure").length)).toEqual([4, 4]);
        const figures = within(testimonials()).getAllByRole("figure"); // the aria-hidden loop copies are not exposed
        expect(figures).toHaveLength(TESTIMONIALS.length);
        TESTIMONIALS.forEach(({ name, quote, role, company }, i) => {
            expect(figures[i]).toHaveTextContent(quote);
            expect(figures[i]).toHaveTextContent(`${name}${role} at ${company}`);
        });
        const emily = figures.find((figure) => figure.textContent?.includes("Emily C."))!;
        expect(emily).toHaveTextContent(TESTIMONIALS.find(({ name }) => name === "Emily C.")!.quote);
        expect(emily).toHaveTextContent(TESTIMONIALS_SECTION.cardLabel);
    });

    it("keeps every card visibly a sample and adds no logo or image implying an endorsement", () => {
        const { container } = renderHome();
        expect(TESTIMONIALS_SECTION.cardLabel).toMatch(/^Sample\b/);
        for (const li of container.querySelectorAll("section[aria-labelledby='home-testimonials-heading'] li")) {
            expect(li).toHaveTextContent(TESTIMONIALS_SECTION.cardLabel);
        }
        expect(testimonials().querySelector("img, svg:not([aria-hidden='true']), picture")).toBeNull();
        expect(testimonials().textContent).not.toMatch(/trusted by|landed offers|verified/i);
    });

    it("duplicates each row for a seamless loop, hidden from assistive technology", () => {
        const { container } = renderHome();
        const hidden = container.querySelectorAll("section li[aria-hidden='true']");
        expect(hidden).toHaveLength(TESTIMONIALS.length);
        for (const copy of hidden) expect(copy.querySelector("a, button")).toBeNull();
    });

    it("pauses and resumes the drift from a labelled button", () => {
        renderHome();
        const button = within(testimonials()).getByRole("button", { name: "Pause testimonials" });
        fireEvent.click(button);
        expect(testimonials()).toHaveAttribute("data-paused", "true");
        fireEvent.click(within(testimonials()).getByRole("button", { name: "Play testimonials" }));
        expect(testimonials()).toHaveAttribute("data-paused", "false");
    });

    it("hides the pause button and the looped copies when the reader prefers reduced motion", () => {
        stubMotion(true);
        const { container } = renderHome();
        expect(within(testimonials()).getByRole("button", { name: "Pause testimonials" }).parentElement).toHaveClass("motion-reduce:hidden");
        for (const copy of container.querySelectorAll("section li[aria-hidden='true']")) expect(copy).toHaveClass("motion-reduce:hidden");
        for (const row of within(testimonials()).getAllByRole("list")) expect(row.parentElement).toHaveClass("motion-reduce:overflow-x-auto");
    });

    it("lets the rows take keyboard focus so they can be scrolled by hand", () => {
        renderHome();
        for (const row of within(testimonials()).getAllByRole("list")) expect(row).toHaveAttribute("tabindex", "0");
    });

    it("drifts in opposite directions", () => {
        const { container } = renderHome();
        expect(container.querySelectorAll(".testimonial-scroll-left")).toHaveLength(1);
        expect(container.querySelectorAll(".testimonial-scroll-right")).toHaveLength(1);
    });
});

describe("pricing", () => {
    it("shows the three approved prices, exactly, as parallel informational plans with no Planned label", () => {
        renderHome();
        const plans = within(within(pricing()).getByRole("list", { name: PRICING.listLabel })).getAllByRole("listitem");
        expect(plans.map((item) => item.textContent)).toEqual(["Annual$50/year", "3-year$100/3 years", "Lifetime$150/lifetime"]);
        for (const item of plans) expect(item.querySelector("a, button, input, form")).toBeNull();
        expect(PRICING).not.toHaveProperty("badge");
        expect(PRICING.listLabel).not.toMatch(/planned/i);
        expect(PRICING.included.label).not.toMatch(/planned/i);
        expect(within(pricing()).queryByText(/^planned$/i)).toBeNull();
    });

    it("says paid access is not currently available and nothing is for sale, with a free path into the courses", () => {
        renderHome();
        expect(within(pricing()).getByText(PRICING.lead)).toHaveTextContent(/not available yet.*nothing is for sale/i);
        expect(within(pricing()).getByText(PRICING.note)).toHaveTextContent(/not currently available.*nothing is for sale/i);
        expect(pricing().textContent).not.toMatch(/\b(now available|available now|available today|sale now|start your plan|join now)\b/i);
        expect(within(pricing()).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([TRACKS_ENTRY]);
        expect(within(pricing()).queryByRole("button")).toBeNull();
    });

    it("introduces no purchase or checkout action or form, and restores neither $40 nor Most Popular", () => {
        const { container } = renderHome();
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
    const disclosures = () => [...section(FAQ.heading).querySelectorAll("details")];

    it("starts collapsed, with one native disclosure per question", () => {
        renderHome();
        expect(disclosures()).toHaveLength(FAQ.items.length);
        for (const details of disclosures()) expect(details).not.toHaveAttribute("open");
    });

    it("holds every answer in the markup, so it can be read and opened without JavaScript", () => {
        renderHome();
        disclosures().forEach((details, i) => {
            expect(details.querySelector("summary h3")).toHaveTextContent(FAQ.items[i].q);
            expect(details.querySelector("summary + p")).toHaveTextContent(FAQ.items[i].a);
        });
        expect(section(FAQ.heading).querySelector("button, [aria-expanded], [inert]")).toBeNull();
    });

    it("opens an answer from its keyboard-operable summary and closes it again", () => {
        renderHome();
        const [first] = disclosures();
        const summary = first.querySelector("summary")!;
        fireEvent.click(summary);
        expect(first).toHaveAttribute("open");
        fireEvent.click(summary);
        expect(first).not.toHaveAttribute("open");
    });

    it("keeps each summary at least 44px high through its minimum-height class", () => {
        renderHome();
        for (const details of disclosures()) expect(details.querySelector("summary")).toHaveClass("min-h-11");
    });

    it("says nothing that the product cannot yet support", () => {
        const answers = FAQ.items.map((item) => item.a).join(" ");
        expect(answers).not.toMatch(/everything you need|Staff AI\/ML|\$\d/i);
        expect(FAQ.items[3].a).toMatch(/planned, not available yet/i);
    });
});

describe("closing action", () => {
    it("offers Browse Tracks only, to the same destination as the hero, with no waitlist", () => {
        renderHome();
        const closing = section(CLOSING.heading);
        const links = within(closing).getAllByRole("link");
        expect(links.map((link) => link.getAttribute("href"))).toEqual([TRACKS_ENTRY]);
        expect(links[0]).toHaveAccessibleName(CLOSING.action.label);
        expect(within(closing).queryByRole("button")).toBeNull();
        expect(closing.textContent).not.toMatch(/waitlist|coming soon|notify/i);
    });
});

describe("link inventory", () => {
    it("has no placeholder href, and nothing in the main landmark sends Track discovery to Learn", () => {
        const { container } = renderHome();
        const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
        expect(hrefs.every((href) => href && href !== "#")).toBe(true);
        const inMain = [...screen.getByRole("main").querySelectorAll("a")].map((a) => a.getAttribute("href")!);
        expect(inMain.filter((href) => href.startsWith("/learn"))).toEqual([]);
        expect(TRACKS_ENTRY).toBe("/#tracks");
    });

    it("sends the hero, the pricing path and the closing action to the same Tracks section", () => {
        renderHome();
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        const targets = [
            within(hero).getByRole("link", { name: HERO.primaryAction.label }),
            within(pricing()).getByRole("link", { name: PRICING.free.action.label }),
            within(section(CLOSING.heading)).getByRole("link", { name: CLOSING.action.label }),
        ];
        expect(targets.map((a) => a.getAttribute("href"))).toEqual(["/#tracks", "/#tracks", "/#tracks"]);
    });
});

describe("catalog reads", () => {
    const TOKEN = "unit-synthetic-preview-token-0123456789abcdef";
    const FREE_META = { id: `lesson.${FREE_CHAPTER_LESSON_SLUG}`, type: "lesson", slug: FREE_CHAPTER_LESSON_SLUG, title: "Free", summary: "s", tags: [], category: null, difficulty: null, level: null, access: "free" };
    const LIST = { tracks: [{ id: "track.alpha", slug: "alpha", title: "Alpha Track", summary: "Alpha summary." }] };

    async function page() {
        return render(await HomePage());
    }
    const heroLinks = () => within(screen.getByRole("region", { name: new RegExp(HERO.tail) })).getAllByRole("link").map((a) => a.getAttribute("href"));

    beforeEach(() => {
        vi.clearAllMocks();
        listCatalogTracks.mockResolvedValue({ status: "ok", data: LIST });
        getCatalogItemMeta.mockResolvedValue({ status: "ok", data: FREE_META });
    });
    afterEach(() => vi.unstubAllEnvs());

    it("makes exactly the two public metadata reads, with no argument that could carry a session or a branch", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        await page();
        expect(listCatalogTracks).toHaveBeenCalledTimes(1);
        expect(listCatalogTracks).toHaveBeenCalledWith();
        expect(getCatalogItemMeta).toHaveBeenCalledTimes(1);
        expect(getCatalogItemMeta).toHaveBeenCalledWith("lesson", "anatomy-of-a-model-request");
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("shows the listed Tracks and the free-chapter action when both reads succeed", async () => {
        await page();
        expect(within(tracks()).getByRole("link", { name: /^Alpha Track\b/ })).toHaveAttribute("href", "/tracks/alpha");
        expect(heroLinks()).toEqual([TRACKS_ENTRY, FREE_HREF]);
    });

    it("loses only the free-chapter action when its read fails, answers 404 or says the Lesson is not free", async () => {
        for (const answer of [{ status: "unavailable", cause: "upstream" }, { status: "notFound" }, { status: "ok", data: { ...FREE_META, access: "premium" } }]) {
            getCatalogItemMeta.mockResolvedValue(answer);
            const { unmount } = await page();
            expect(heroLinks()).toEqual([TRACKS_ENTRY]);
            expect(within(tracks()).getAllByRole("link")).toHaveLength(1);
            unmount();
        }
    });

    it("loses only the cards when the Track list fails, and still offers the free chapter", async () => {
        listCatalogTracks.mockResolvedValue({ status: "unavailable", cause: "transport" });
        await page();
        expect(within(tracks()).getByText(TRACKS.unavailable)).toBeInTheDocument();
        expect(heroLinks()).toEqual([TRACKS_ENTRY, FREE_HREF]);
    });

    it("says no Tracks are published for an empty list", async () => {
        listCatalogTracks.mockResolvedValue({ status: "ok", data: { tracks: [] } });
        await page();
        expect(within(tracks()).getByText("No Tracks are published yet.")).toBeInTheDocument();
    });

    it("links no catalog item other than the Track cards and the free Lesson", async () => {
        const { container } = await page();
        const hrefs = [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!);
        expect(hrefs.filter((href) => /^\/(lessons|problems|knowledge|tracks)\/./.test(href) || href.includes("/catalog"))).toEqual(["/lessons/anatomy-of-a-model-request", "/tracks/alpha"]);
    });

    it("is not indexed and says so on a preview deployment, which shows preview data", async () => {
        vi.stubEnv("CATALOG_PREVIEW_TOKEN", TOKEN);
        await page();
        expect(screen.getByRole("complementary", { name: "Preview" })).toBeInTheDocument();
        expect(homeModule.generateMetadata().robots).toEqual({ index: false, follow: false });
    });

    it("carries no preview marker and no robots rule in production", async () => {
        vi.stubEnv("CATALOG_PREVIEW_TOKEN", "");
        await page();
        expect(screen.queryByRole("complementary", { name: "Preview" })).toBeNull();
        expect(homeModule.generateMetadata().robots).toBeUndefined();
    });

    it("is rendered per request, so a build cannot freeze an unavailable catalog into it", () => {
        expect(homeModule.dynamic).toBe("force-dynamic");
    });
});

describe("legacy courses", () => {
    it("stay reachable through the page footer, outside the main landmark", () => {
        renderHome();
        const footer = screen.getByRole("contentinfo");
        expect(within(footer).getByRole("link", { name: "All courses" })).toHaveAttribute("href", "/learn");
        expect(screen.getByRole("main")).not.toContainElement(footer);
    });
});

describe("product positioning", () => {
    it("offers Tracks and Knowledge only: no standalone Practice product or unbuilt AI practice capability", () => {
        const { container } = renderHome();
        const main = screen.getByRole("main");
        const hrefs = [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!);
        expect(hrefs.filter((href) => href.startsWith("/practice") || href.startsWith("/problems"))).toEqual([]);
        expect(within(main).queryByRole("heading", { name: /^practice$/i })).toBeNull();
        expect(main.textContent).not.toMatch(/mock interview|AI interviewer|whiteboard|AI scoring|voice practice|AI-powered/i);
    });

    it("keeps Explore inside the Tracks, not as a product of its own", () => {
        renderHome();
        expect(within(tracks()).getAllByText(TRACKS.cardAction)).toHaveLength(CARDS.length);
        expect(within(screen.getByRole("main")).queryByRole("heading", { name: /^explore$/i })).toBeNull();
    });
});

describe("public claims", () => {
    it("adds no pricing terms beyond the three approved prices", () => {
        renderHome();
        const main = screen.getByRole("main");
        expect(main.textContent?.match(/\$\d+(?:[.,]\d+)?/g)).toEqual(["$50", "$100", "$150"]);
        for (const claim of [/discount|% off|save \d|on sale/i, /limited[- ]time|early[- ]bird/i, /refund|money-back|cancel anytime/i, /free trial|trial/i, /\btax|\bvat\b/i, /guarantee/i]) {
            expect(within(main).queryByText(claim)).toBeNull();
        }
    });

    it("states that paid access is not available yet", () => {
        renderHome();
        expect(screen.getAllByText(/not available yet/i).length).toBeGreaterThan(0);
    });
});

describe("metadata", () => {
    it("describes the product without numbers, rankings or outcome promises", () => {
        const metadata = homeModule.generateMetadata();
        expect(metadata.title).toEqual(expect.stringContaining("InterviewNotes"));
        expect(typeof metadata.description).toBe("string");
        expect(metadata.description).not.toMatch(/\d|guarantee|best|#1|trusted|ranked/i);
    });
});
