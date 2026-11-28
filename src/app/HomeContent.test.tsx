import { createHash } from "node:crypto";
import type { ComponentProps } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeContent } from "./HomeContent";
import { FREE_CHAPTER_LESSON_SLUG, HOME_READ_BUDGET_MS } from "@/lib/catalog/home";
import { explorerHref, parseGroup } from "@/lib/catalog/knowledge";
import { TRACKS_ENTRY } from "@/lib/primary-navigation";
import { CLOSING, FAQ, HERO, HERO_AREAS, HERO_TOPICS, KNOWLEDGE, PRICING, STAGE, STATS, STATS_DISCLOSURE, TESTIMONIALS, TESTIMONIALS_SECTION, TRACKS } from "./home-copy";
import HomePage, * as homeModule from "./page";
import { TOPIC_STEP_MS } from "./RotatingTopic";

const { listCatalogTracks, getCatalogItemMeta, listCatalogItems, publicReadsAreCached } = vi.hoisted(() => ({ listCatalogTracks: vi.fn(), getCatalogItemMeta: vi.fn(), listCatalogItems: vi.fn(), publicReadsAreCached: vi.fn(() => true) }));
vi.mock("@/lib/catalog/client", () => ({ listCatalogTracks, getCatalogItemMeta, listCatalogItems, publicReadsAreCached }));
// The page reads the request's user agent (a crawler is given the whole page) and reports late reads for the function log.
const request = vi.hoisted(() => ({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", secFetchMode: "navigate" as string | null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": request.userAgent, ...(request.secFetchMode ? { "sec-fetch-mode": request.secFetchMode } : {}) }) }));
const { reportHomeLate } = vi.hoisted(() => ({ reportHomeLate: vi.fn() }));
vi.mock("@/lib/perf/hotpath", () => ({ reportRender: vi.fn(), reportHomeLate }));
vi.mock("@/lib/courses", () => {
    throw new Error("the homepage must not import the course loader");
});
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => router }));
const linkStatus = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", async () => {
    const { createElement } = await import("react");
    return { useLinkStatus: () => linkStatus, default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
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

beforeEach(() => {
    linkStatus.pending = false;
    stubMotion(false);
});
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
        for (const topic of HERO_TOPICS) expect(within(h1).getByText(topic, { selector: "[aria-hidden='true'] > span" })).toBeInTheDocument();
        expect(within(h1).getByText(HERO.subject, { selector: ".sr-only" })).toBeInTheDocument();
    });

    it("offers Browse Tracks to the /tracks page, and a free chapter that opens its Lesson", () => {
        renderHome();
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        expect(HERO.primaryAction.label).toBe("Browse Tracks");
        expect(within(hero).getByRole("link", { name: HERO.primaryAction.label })).toHaveAttribute("href", "/tracks");
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
        expect(stage?.textContent).toContain(STAGE.track.title);
        expect(within(hero).queryByText(/\b(free|pro|premium)\b/i, { ignore: "[aria-hidden='true'] *, a[href^='/lessons/']" })).toBeNull(); // the free-chapter action is the one place the hero's own text says free
    });

    it("hides the floating cards around the headline from assistive technology too", () => {
        renderHome();
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        for (const text of [STAGE.chooseTrack.title, KNOWLEDGE.groups[0].title]) {
            for (const node of within(hero).getAllByText(text)) expect(node.closest("[aria-hidden='true']"), text).not.toBeNull();
        }
        expect(hero.querySelector("h2, h3, [role='img']")).toBeNull();
    });
});

describe("hero grid", () => {
    it("is one decorative hairline grid inside the hero, first so it sits behind the copy, and nowhere else", () => {
        const { container } = renderHome();
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        const grids = container.querySelectorAll("[data-hero-grid]");
        expect(grids).toHaveLength(1);
        const grid = grids[0];
        expect(hero.contains(grid)).toBe(true);
        expect(grid).toHaveAttribute("aria-hidden", "true");
        expect(grid.className).toContain("pointer-events-none");
        expect(grid.parentElement!.firstElementChild).toBe(grid);
        expect(grid.innerHTML).toContain("linear-gradient");
        expect(grid.innerHTML).toContain("mask-image");
        expect(grid.querySelector("a, button, [tabindex]")).toBeNull();
        expect(grid.className + grid.innerHTML).not.toMatch(/animate|transition/);
    });
});

describe("hero stage content", () => {
    const stage = (container: HTMLElement) => container.querySelector("[data-hero-stage]")!.parentElement!;
    const STALE = [
        "Mock round",
        "Interviewer",
        "Round clock",
        "Chapter complete",
        "Next up",
        "Saved to notes",
        "Deep dive",
        "Clarify",
        "Follow-ups",
        "Gen AI Native Design",
        "Docs · 50M",
        "18 · ~8h",
        "50M",
        "RAG",
        "PRO",
        "FREE",
        "27:40",
    ];

    it("shows the GenAI System Design Track, its Lessons, a Problem and Knowledge entries, in cards pinned to the stage and around the headline", () => {
        const { container } = renderHome();
        const text = stage(container).textContent!;
        const { track, problem, note } = STAGE;
        for (const expected of [track.title, track.summary, ...STAGE.lessons, problem.title, problem.summary, ...STAGE.knowledge.map((k) => k.title), STAGE.knowledgeStrip, note.title, KNOWLEDGE.groups[0].title]) {
            expect(text, expected).toContain(expected);
        }
        expect(text).toContain(STAGE.chooseTrack.title);
        for (const step of STAGE.path) expect(text).toContain(step);
    });

    it("carries no interview-simulation text, chapter data, PRO or FREE tag, timer or invented quantity", () => {
        const { container } = renderHome();
        const text = stage(container).textContent!;
        for (const stale of STALE) expect(text, stale).not.toContain(stale);
        expect(text).not.toMatch(/\d+\s*(m|min|h|hours?|chapters?)\b|\b\d{2}:\d{2}\b/i);
    });

    it("never takes the pointer: no card enables pointer events", () => {
        const { container } = renderHome();
        expect(container.querySelector("[data-hero-stage] .pointer-events-auto, [data-hero-stage] .home-pop-card.pointer-events-auto")).toBeNull();
        expect(stage(container).querySelectorAll(".pointer-events-auto")).toHaveLength(0);
    });

    it("is fixed GenAI copy: the listed Tracks never reach it, and nothing in it is about Behavioral (P6-D-50)", () => {
        const behavioral = { id: "track.behavioral-interview-preparation", title: "Behavioral Interview Preparation", summary: "Behavioral summary.", href: "/tracks/behavioral-interview-preparation" };
        for (const tracks of [{ status: "ok", cards: [behavioral, ...CARDS] }, { status: "unavailable" }, { status: "empty" }] as const) {
            const view = renderHome({ tracks: tracks.status === "ok" ? { status: "ok", cards: [...tracks.cards] } : tracks });
            const text = stage(view.container).textContent!;
            expect(text).toContain(STAGE.track.title);
            expect(text).toContain(STAGE.problem.title);
            expect(text).not.toMatch(/behaviou?ral|STAR\b/i);
            for (const card of CARDS) expect(text).not.toContain(card.title);
            view.unmount();
        }
    });
});

describe("hero motion", () => {
    const pause = () => screen.getByRole("button", { name: /animation$/ });
    const shown = () => within(screen.getByRole("heading", { level: 1 })).getAllByText(/./, { selector: "[aria-hidden='true'] > span" }).filter((s) => s.className.includes("opacity-100")).map((s) => s.textContent);

    it("pauses and resumes the headline rotation and the ambient loops with one control", () => {
        vi.useFakeTimers();
        renderHome();
        expect(shown()).toEqual([HERO_TOPICS[0]]);
        act(() => void vi.advanceTimersByTime(TOPIC_STEP_MS));
        expect(shown()).toEqual([HERO_TOPICS[1]]);
        fireEvent.click(pause());
        expect(pause()).toHaveTextContent("Play animation");
        expect(pause().closest("[data-paused]")).toHaveAttribute("data-paused", "true");
        act(() => void vi.advanceTimersByTime(TOPIC_STEP_MS * 4));
        expect(shown(), "paused: the headline holds still").toEqual([HERO_TOPICS[1]]);
        fireEvent.click(pause());
        expect(pause()).toHaveTextContent("Pause animation");
        act(() => void vi.advanceTimersByTime(TOPIC_STEP_MS));
        expect(shown()).toEqual([HERO_TOPICS[2]]);
    });

    it("names what the control stops in its description, and keeps one control", () => {
        renderHome();
        expect(pause()).toHaveAccessibleDescription(/rotating headline.*motion/i);
        expect(screen.getAllByRole("button", { name: /animation$/ })).toHaveLength(1);
        fireEvent.click(pause());
        expect(pause()).toHaveAccessibleDescription(/resumes the rotating headline/i);
    });

    it("has no round clock left to tick", () => {
        renderHome();
        expect(screen.queryByText(/^\d\d:\d\d$/)).toBeNull();
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
            expect(within(band).getByText(value).closest("li")).toHaveTextContent(label);
        }
        expect(STATS).toHaveLength(4);
    });

    it("counts the digits up with CSS only: each figure's final value is stable text for assistive technology and the animated part is hidden", () => {
        renderHome();
        const band = screen.getByText(STATS[0].value).closest("ul")!;
        for (const { value } of STATS) {
            const figure = within(band).getByText(value);
            expect(figure).toHaveClass("sr-only");
            const visual = figure.nextElementSibling!;
            expect(visual).toHaveAttribute("aria-hidden", "true");
            const [, prefix, digits, suffix] = /^(\D*)(\d+)(.*)$/.exec(value)!;
            expect(visual.textContent).toBe(prefix + suffix); // the digits are CSS-generated, so no intermediate frame is ever text
            expect(visual.querySelector<HTMLElement>(".home-count")!.style.getPropertyValue("--to")).toBe(digits);
        }
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
        HERO_TOPICS.filter((topic) => within(screen.getByRole("heading", { level: 1 })).getByText(topic, { selector: "[aria-hidden='true'] > span" }).className.includes("opacity-100"));

    it("includes ML and AI engineering, with every phrase fitting the sentence and one capitalisation style", () => {
        expect(HERO_TOPICS).toContain("ML and AI engineering");
        expect(HERO_TOPICS[0]).toBe(HERO.subject);
        expect(new Set(HERO_TOPICS).size).toBe(HERO_TOPICS.length);
        for (const topic of HERO_TOPICS) expect(topic, "words after the first are lower case, acronyms aside").toMatch(/^[A-Z][A-Za-z]*( ([A-Z]{2,}|[a-z]+))+$/);
    });

    it("steps through every topic in order and wraps from the last back to the first, for more than two full rotations", () => {
        vi.useFakeTimers();
        renderHome();
        expect(active()).toEqual([HERO_TOPICS[0]]);
        for (let step = 1; step <= HERO_TOPICS.length * 2 + 2; step++) {
            act(() => void vi.advanceTimersByTime(TOPIC_STEP_MS));
            expect(active(), `step ${step}`).toEqual([HERO_TOPICS[step % HERO_TOPICS.length]]);
        }
    });

    it("keeps one heading name throughout: the animated phrases are hidden from assistive technology", () => {
        vi.useFakeTimers();
        renderHome();
        const h1 = screen.getByRole("heading", { level: 1 });
        for (let step = 0; step < HERO_TOPICS.length + 1; step++) {
            expect(h1).toHaveAccessibleName(`${HERO.lead} ${HERO.subject} ${HERO.tail}`);
            act(() => void vi.advanceTimersByTime(TOPIC_STEP_MS));
        }
        expect(h1.querySelector("[aria-live]")).toBeNull();
    });

    it("stays on the first topic when the reader prefers reduced motion", () => {
        stubMotion(true);
        vi.useFakeTimers();
        renderHome();
        act(() => void vi.advanceTimersByTime(TOPIC_STEP_MS));
        expect(active()).toEqual([HERO_TOPICS[0]]);
        act(() => void vi.advanceTimersByTime(60_000));
        expect(active()).toEqual([HERO_TOPICS[0]]);
    });

    it("clears its interval when it unmounts", () => {
        vi.useFakeTimers();
        const { unmount } = renderHome();
        const pending = vi.getTimerCount();
        unmount();
        expect(vi.getTimerCount()).toBeLessThan(pending);
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

    it("names exactly the published Tracks in answer 1, including Behavioral, by their catalog titles", () => {
        // Titles as published in the catalog (track.genai-system-design, track.behavioral-interview-preparation).
        const answer = FAQ.items[0].a;
        expect(answer).toContain("GenAI System Design");
        expect(answer).toContain("Behavioral Interview Preparation");
        expect(answer).toMatch(/SDE-1, SDE-2, SDE-3 and first-line engineering manager/);
        expect(answer).not.toMatch(/ML system design|LLM platform|MLOps/i);
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
        expect(TRACKS_ENTRY).toBe("/tracks");
    });

    it("sends the hero, the pricing path and the closing action to the same /tracks page", () => {
        renderHome();
        const hero = screen.getByRole("region", { name: new RegExp(HERO.tail) });
        const targets = [
            within(hero).getByRole("link", { name: HERO.primaryAction.label }),
            within(pricing()).getByRole("link", { name: PRICING.free.action.label }),
            within(section(CLOSING.heading)).getByRole("link", { name: CLOSING.action.label }),
        ];
        expect(targets.map((a) => a.getAttribute("href"))).toEqual(["/tracks", "/tracks", "/tracks"]);
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
        listCatalogItems.mockResolvedValue({ status: "ok", data: { items: [], next_cursor: null } });
    });
    afterEach(() => vi.unstubAllEnvs());

    it("makes exactly the three public metadata reads, with no argument that could carry a session or a branch, and no Problem read (P6-D-50)", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        await page();
        expect(listCatalogTracks).toHaveBeenCalledTimes(1);
        expect(listCatalogTracks).toHaveBeenCalledWith();
        expect(getCatalogItemMeta).toHaveBeenCalledTimes(1);
        expect(getCatalogItemMeta).toHaveBeenCalledWith("lesson", "anatomy-of-a-model-request");
        expect(listCatalogItems).toHaveBeenCalledTimes(1);
        expect(listCatalogItems).toHaveBeenCalledWith({ limit: 100 });
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

    it("offers a retry beside Knowledge when the Track list failed, and still shows no card", async () => {
        listCatalogTracks.mockResolvedValue({ status: "unavailable", cause: "upstream" });
        await page();
        expect(within(tracks()).getByRole("button", { name: TRACKS.retry })).toBeInTheDocument();
        expect(within(tracks()).getByRole("link", { name: KNOWLEDGE.action.label })).toBeInTheDocument();
        expect(tracks().querySelector("[data-tracks-pending]")).toBeNull();
        expect(within(tracks()).getByRole("status"), "the live region that announces a failed retry starts empty").toBeEmptyDOMElement();
    });

    it("never reports a read as late, and never shows a pending state, when both answer inside the budget", async () => {
        await page();
        expect(reportHomeLate).not.toHaveBeenCalled();
        expect(tracks().querySelector("[data-tracks-pending], [data-free-chapter-pending]")).toBeNull();
    });
});

// P8 hot path: a sleeping free-tier API must not hold the hero. The page waits `HOME_READ_BUDGET_MS`, then renders what it has.
describe("a slow API", () => {
    const FREE_META = { id: `lesson.${FREE_CHAPTER_LESSON_SLUG}`, type: "lesson", slug: FREE_CHAPTER_LESSON_SLUG, title: "Free", summary: "s", tags: [], category: null, difficulty: null, level: null, access: "free" };
    const LIST = { tracks: [{ id: "track.alpha", slug: "alpha", title: "Alpha Track", summary: "Alpha summary." }] };
    const later = <T,>(value: T, ms: number) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
    const heroLinks = () => within(screen.getByRole("region", { name: new RegExp(HERO.tail) })).getAllByRole("link").map((a) => a.getAttribute("href"));

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        request.userAgent = "Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36";
        request.secFetchMode = "navigate";
        publicReadsAreCached.mockReturnValue(true);
        listCatalogTracks.mockResolvedValue({ status: "ok", data: LIST });
        getCatalogItemMeta.mockResolvedValue({ status: "ok", data: FREE_META });
        listCatalogItems.mockResolvedValue({ status: "ok", data: { items: [], next_cursor: null } });
    });

    /** Start the page, let the budget pass, and render what it returned. */
    async function renderAfterBudget() {
        const rendering = HomePage();
        await vi.advanceTimersByTimeAsync(HOME_READ_BUDGET_MS);
        return render(await rendering);
    }

    it("renders the hero and a pending Tracks section at the budget, with no card, count or title, and keeps the read going", async () => {
        const tracksRead = later({ status: "ok", data: LIST }, 30_000);
        listCatalogTracks.mockReturnValue(tracksRead);
        await renderAfterBudget();

        expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
        expect(heroLinks()).toEqual([TRACKS_ENTRY, FREE_HREF]);
        const section = tracks();
        expect(within(section).getByRole("status")).toHaveTextContent(TRACKS.pending);
        expect(within(section).queryAllByRole("link")).toHaveLength(0);
        expect(section.textContent).not.toContain("Alpha");
        expect(section.querySelector("[data-tracks-skeleton]")).toHaveAttribute("aria-hidden", "true");
        expect(reportHomeLate).toHaveBeenCalledTimes(1);
        expect(reportHomeLate.mock.calls[0][0]).toEqual(["tracks"]);
        // The outstanding read is handed over to be awaited, so the request outlives the response and fills the cache.
        expect(reportHomeLate.mock.calls[0][1]).toBeInstanceOf(Promise);
        expect(listCatalogTracks).toHaveBeenCalledTimes(1);
    });

    it("holds the free-chapter slot, invisibly and out of the accessibility tree, while that read is outstanding", async () => {
        getCatalogItemMeta.mockReturnValue(later({ status: "ok", data: FREE_META }, 30_000));
        await renderAfterBudget();

        expect(heroLinks()).toEqual([TRACKS_ENTRY]);
        const slot = document.querySelector("[data-free-chapter-pending]")!;
        expect(slot).toHaveAttribute("aria-hidden", "true");
        expect(slot).toHaveClass("invisible");
        expect(slot.tagName).toBe("SPAN");
        expect(within(tracks()).getByRole("link", { name: /^Alpha Track\b/ })).toBeInTheDocument();
        expect(reportHomeLate.mock.calls[0][0]).toEqual(["free"]);
    });

    it("says nothing is pending when the answers arrive just inside the budget", async () => {
        listCatalogTracks.mockReturnValue(later({ status: "ok", data: LIST }, HOME_READ_BUDGET_MS - 100));
        await renderAfterBudget();
        expect(within(tracks()).getByRole("link", { name: /^Alpha Track\b/ })).toBeInTheDocument();
        expect(reportHomeLate).not.toHaveBeenCalled();
    });

    it("gives a crawler the whole page: it waits for a slow read and never renders a pending state for it", async () => {
        request.userAgent = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
        listCatalogTracks.mockReturnValue(later({ status: "ok", data: LIST }, 25_000));
        const rendering = HomePage();
        await vi.advanceTimersByTimeAsync(HOME_READ_BUDGET_MS * 2);
        let settled = false;
        void rendering.then(() => (settled = true));
        await vi.advanceTimersByTimeAsync(0);
        expect(settled, "the page returned before the crawler's read did").toBe(false);
        await vi.advanceTimersByTimeAsync(25_000);
        render(await rendering);
        expect(within(tracks()).getByRole("link", { name: /^Alpha Track\b/ })).toBeInTheDocument();
        expect(reportHomeLate).not.toHaveBeenCalled();
        expect(document.querySelector("[data-tracks-pending]")).toBeNull();
    });

    it("gives every client that is not a browser the whole page: no navigation header (crawlers, curl, monitors), or no user agent", async () => {
        for (const [agent, mode] of [["Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", null], ["curl/8.4.0", null], ["Datadog/Synthetics", null], ["", "navigate"]] as const) {
            request.userAgent = agent;
            request.secFetchMode = mode;
            listCatalogTracks.mockReturnValue(later({ status: "ok", data: LIST }, 25_000));
            const rendering = HomePage();
            await vi.advanceTimersByTimeAsync(HOME_READ_BUDGET_MS * 2);
            let settled = false;
            void rendering.then(() => (settled = true));
            await vi.advanceTimersByTimeAsync(0);
            expect(settled, `the page returned before the read did for "${agent}" / ${mode}`).toBe(false);
            await vi.advanceTimersByTimeAsync(25_000);
            const { unmount } = render(await rendering);
            expect(within(tracks()).getByRole("link", { name: /^Alpha Track\b/ })).toBeInTheDocument();
            unmount();
        }
        expect(reportHomeLate).not.toHaveBeenCalled();
    });

    it("waits as it always did where public reads are not cached (a preview), so a steady slow answer is shown rather than given up on", async () => {
        publicReadsAreCached.mockReturnValue(false);
        listCatalogTracks.mockReturnValue(later({ status: "ok", data: LIST }, 1500));
        const rendering = HomePage();
        await vi.advanceTimersByTimeAsync(HOME_READ_BUDGET_MS * 3);
        render(await rendering);
        expect(within(tracks()).getByRole("link", { name: /^Alpha Track\b/ })).toBeInTheDocument();
        expect(document.querySelector("[data-tracks-pending]")).toBeNull();
        expect(reportHomeLate).not.toHaveBeenCalled();
    });

    it("applies the budget where reads are not cached when HOME_READ_BUDGET_MS asks for it (the e2e fault deployment does)", async () => {
        publicReadsAreCached.mockReturnValue(false);
        vi.stubEnv("HOME_READ_BUDGET_MS", "800");
        listCatalogTracks.mockReturnValue(later({ status: "ok", data: LIST }, 30_000));
        await renderAfterBudget();
        expect(within(tracks()).getByRole("status")).toHaveTextContent(TRACKS.pending);
        vi.unstubAllEnvs();
    });

    it("retries a late free-chapter read on its own when the Tracks have arrived, with the same bounded refresh and no skeleton", async () => {
        getCatalogItemMeta.mockReturnValue(later({ status: "ok", data: FREE_META }, 30_000));
        await renderAfterBudget();
        expect(document.querySelector("[data-tracks-pending]")).toBeNull();
        router.refresh.mockClear();
        await act(() => vi.advanceTimersByTimeAsync(6000));
        expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("runs one retry sequence, not two, when both reads are late", async () => {
        listCatalogTracks.mockReturnValue(later({ status: "ok", data: LIST }, 30_000));
        getCatalogItemMeta.mockReturnValue(later({ status: "ok", data: FREE_META }, 30_000));
        await renderAfterBudget();
        router.refresh.mockClear();
        await act(() => vi.advanceTimersByTimeAsync(6000));
        expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("shows an answer that arrives inside the budget as it always did: a 404, 401 or 410 is unavailable, never pending", async () => {
        for (const answer of [{ status: "notFound" }, { status: "unauthenticated" }, { status: "retired" }]) {
            listCatalogTracks.mockResolvedValue(answer);
            const { unmount } = await renderAfterBudget();
            expect(within(tracks()).getByText(TRACKS.unavailable)).toBeInTheDocument();
            expect(document.querySelector("[data-tracks-pending]")).toBeNull();
            unmount();
        }
    });
});

describe("footer", () => {
    it("sits outside the main landmark and sends Tracks to /tracks, never into /learn", () => {
        renderHome();
        const footer = screen.getByRole("contentinfo");
        expect(within(footer).getByRole("link", { name: "Tracks" })).toHaveAttribute("href", "/tracks");
        for (const a of footer.querySelectorAll("a")) expect(a.getAttribute("href")).not.toMatch(/^\/learn/);
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

// P8-RSP-02 follow-up: the homepage's catalog links acknowledge a click at once (Home to Track, Tracks, Knowledge, Pricing).
describe("pending-link feedback", () => {
    const hint = (link: HTMLElement) => link.querySelector('[data-nav-pending="link"]');
    const internalLinks = () => screen.getAllByRole("link").filter((link) => (link.getAttribute("href") ?? "").startsWith("/") && !link.getAttribute("href")!.startsWith("//"));

    it("shows the decorative hint in every internal homepage link while its navigation is pending, and only then", () => {
        renderHome();
        const links = internalLinks();
        expect(links.length).toBeGreaterThan(8);
        const missing = (scope: HTMLElement[]) => scope.filter((link) => link.closest("[data-site-header], footer") === null && !link.querySelector("span[aria-hidden='true'].pointer-events-none"));
        expect(missing(links).map((link) => link.getAttribute("href"))).toEqual([]);
        for (const link of links) expect(hint(link)).toBeNull(); // idle: the hint element is there but not shown
    });

    it("covers the hero actions, the Track cards, the Knowledge cards and actions, Pricing and the closing action", () => {
        linkStatus.pending = true;
        renderHome();
        const hero = screen.getByRole("heading", { level: 1 }).closest("section")!;
        for (const link of within(hero).getAllByRole("link")) expect(hint(link)).not.toBeNull();
        for (const link of within(tracks()).getAllByRole("link")) {
            expect(hint(link)).not.toBeNull();
            expect(link).toHaveClass("relative");
        }
        for (const link of within(knowledge()).getAllByRole("link")) expect(hint(link)).not.toBeNull();
        expect(hint(within(pricing()).getByRole("link", { name: PRICING.free.action.label }))).not.toBeNull();
        expect(hint(within(section(CLOSING.heading)).getByRole("link", { name: CLOSING.action.label }))).not.toBeNull();
    });

    it("keeps every link a real anchor with the same prefetch rule as before: the cards and the free Lesson never prefetch", () => {
        renderHome();
        for (const link of within(tracks()).getAllByRole("link")) {
            expect(link.tagName).toBe("A");
            expect(link).toHaveAttribute("data-prefetch", "false");
        }
        expect(within(screen.getByRole("heading", { level: 1 }).closest("section")!).getByRole("link", { name: HERO.freeChapterLabel })).toHaveAttribute("data-prefetch", "false");
        expect(within(section(CLOSING.heading)).getByRole("link", { name: CLOSING.action.label })).toHaveAttribute("data-prefetch", "false"); // PREFETCH_PRIMARY, unchanged
    });

    it("adds no nested interactive element and no accessible name to the links", () => {
        renderHome();
        expect(document.querySelectorAll(NESTED_INTERACTIVE)).toHaveLength(0);
        for (const link of within(tracks()).getAllByRole("link")) expect(link).not.toHaveAccessibleName(/pending|loading/i);
    });
});
