import { afterEach, describe, expect, it, vi } from "vitest";
import { FREE_CHAPTER_LESSON_SLUG, HOME_READ_BUDGET_MS, freeChapterHref, homeReadBudgetMs, homeTracks, wantsWholePage, withinBudget } from "./home";
import type { CatalogMeta, CatalogResult, CatalogTrackList } from "./types";

const track = (slug: string, title = `${slug} title`, summary = `${slug} summary`) => ({ id: `track.${slug}`, slug, title, summary });
const list = (...tracks: CatalogTrackList["tracks"]): CatalogResult<CatalogTrackList> => ({ status: "ok", data: { tracks } });

describe("homeTracks", () => {
   it("maps each Track to its title, summary and canonical route, in the API's order", () => {
      expect(homeTracks(list(track("zeta"), track("alpha")))).toEqual({
         status: "ok",
         cards: [
            { id: "track.zeta", title: "zeta title", summary: "zeta summary", href: "/tracks/zeta" },
            { id: "track.alpha", title: "alpha title", summary: "alpha summary", href: "/tracks/alpha" },
         ],
      });
   });

   it("takes no card count from anywhere: one Track gives one card, many give many", () => {
      const many = Array.from({ length: 12 }, (_, i) => track(`t${i}`));
      expect(homeTracks(list(track("only")))).toMatchObject({ cards: [{ href: "/tracks/only" }] });
      expect(homeTracks(list(...many))).toMatchObject({ cards: expect.arrayContaining([expect.objectContaining({ href: "/tracks/t11" })]) });
   });

   it("keeps a Track with a blank summary, without inventing one", () => {
      expect(homeTracks(list(track("quiet", "Quiet Track", "   ")))).toMatchObject({ cards: [{ title: "Quiet Track", summary: "" }] });
   });

   it("reports an empty list as empty", () => {
      expect(homeTracks(list())).toEqual({ status: "empty" });
   });

   it.each<CatalogResult<CatalogTrackList>>([
      { status: "unavailable", cause: "transport" },
      { status: "unavailable", cause: "upstream" },
      { status: "unavailable", cause: "malformed" },
      { status: "notFound" },
      { status: "unauthenticated" },
      { status: "unentitled" },
      { status: "retired" },
   ])("reports %j as unavailable", (result) => {
      expect(homeTracks(result)).toEqual({ status: "unavailable" });
   });

   it("drops an entry that does not agree with its own route and one with no title, and links the rest", () => {
      const result = list(
         { id: "track.other", slug: "mismatch", title: "Wrong id", summary: "x" },
         { id: "track.bad slug", slug: "bad slug", title: "Unsafe slug", summary: "x" },
         { id: "track.untitled", slug: "untitled", title: "  ", summary: "x" },
         track("good"),
      );
      expect(homeTracks(result)).toEqual({ status: "ok", cards: [{ id: "track.good", title: "good title", summary: "good summary", href: "/tracks/good" }] });
   });

   it("is unavailable, not empty, when Tracks were listed but none can be shown", () => {
      expect(homeTracks(list({ id: "track.other", slug: "mismatch", title: "Wrong id", summary: "x" }))).toEqual({ status: "unavailable" });
   });
});

describe("freeChapterHref", () => {
   const lesson = (overrides: Partial<CatalogMeta> = {}): CatalogResult<CatalogMeta> => ({
      status: "ok",
      data: {
         id: `lesson.${FREE_CHAPTER_LESSON_SLUG}`,
         type: "lesson",
         slug: FREE_CHAPTER_LESSON_SLUG,
         title: "Anatomy of a model request",
         summary: "s",
         tags: [],
         category: null,
         difficulty: null,
         level: null,
         access: "free",
         ...overrides,
      },
   });

   it("names the first free Lesson of genai-system-design", () => {
      expect(FREE_CHAPTER_LESSON_SLUG).toBe("anatomy-of-a-model-request");
   });

   it("links the Lesson only when the API says it is free", () => {
      expect(freeChapterHref(lesson())).toBe("/lessons/anatomy-of-a-model-request");
   });

   it("is absent for a premium Lesson", () => {
      expect(freeChapterHref(lesson({ access: "premium" }))).toBeNull();
   });

   it.each<CatalogResult<CatalogMeta>>([
      { status: "notFound" },
      { status: "retired" },
      { status: "unauthenticated" },
      { status: "unentitled" },
      { status: "unavailable", cause: "transport" },
      { status: "unavailable", cause: "upstream" },
      { status: "unavailable", cause: "malformed" },
   ])("is absent for %j", (result) => {
      expect(freeChapterHref(result)).toBeNull();
   });

   it("is absent when the answer is not that Lesson or its id disagrees with its slug", () => {
      expect(freeChapterHref(lesson({ slug: "something-else", id: "lesson.something-else" }))).toBeNull();
      expect(freeChapterHref(lesson({ type: "knowledge", id: `knowledge.${FREE_CHAPTER_LESSON_SLUG}` }))).toBeNull();
      expect(freeChapterHref(lesson({ id: "lesson.another" }))).toBeNull();
   });
});

describe("withinBudget", () => {
   afterEach(() => vi.useRealTimers());

   it("returns the answer, and clears its timer, when the read answers inside the budget", async () => {
      vi.useFakeTimers();
      const answered = withinBudget(Promise.resolve("answer"), 800);
      await expect(answered).resolves.toEqual({ settled: true, value: "answer" });
      expect(vi.getTimerCount()).toBe(0);
   });

   it("gives up waiting at the budget but leaves the read running to its own end", async () => {
      vi.useFakeTimers();
      let finish!: (value: string) => void;
      const read = new Promise<string>((resolve) => (finish = resolve));
      const bounded = withinBudget(read, 800);
      await vi.advanceTimersByTimeAsync(799);
      let outcome: unknown = "waiting";
      void bounded.then((value) => (outcome = value));
      await vi.advanceTimersByTimeAsync(0);
      expect(outcome).toBe("waiting");
      await vi.advanceTimersByTimeAsync(1);
      expect(outcome).toEqual({ settled: false });
      finish("late");
      await expect(read).resolves.toBe("late");
   });

   it("waits as long as the read takes for a null budget", async () => {
      vi.useFakeTimers();
      const read = new Promise<string>((resolve) => setTimeout(() => resolve("slow"), 60_000));
      const bounded = withinBudget(read, null);
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(bounded).resolves.toEqual({ settled: true, value: "slow" });
   });

   it("passes a rejection on rather than reporting it as pending", async () => {
      await expect(withinBudget(Promise.reject(new Error("boom")), 800)).rejects.toThrow("boom");
   });
});

describe("homeReadBudgetMs", () => {
   it("gives cached reads (production) their budget and uncached ones (a preview) none, because an abandoned uncached read is lost", () => {
      expect(homeReadBudgetMs(true, undefined)).toBe(HOME_READ_BUDGET_MS);
      expect(homeReadBudgetMs(false, undefined)).toBeNull();
   });

   it("lets HOME_READ_BUDGET_MS set a number of milliseconds for either, or turn the budget off", () => {
      expect(homeReadBudgetMs(false, "800")).toBe(800);
      expect(homeReadBudgetMs(true, "1500")).toBe(1500);
      expect(homeReadBudgetMs(true, "off")).toBeNull();
      expect(homeReadBudgetMs(true, " OFF ")).toBeNull();
   });

   it("ignores a value that is not a number of milliseconds, or is below the floor a Data Cache answer could not beat", () => {
      for (const bad of ["", "soon", "-5", "NaN", "0", "99"]) expect(homeReadBudgetMs(true, bad), bad).toBe(HOME_READ_BUDGET_MS);
      expect(homeReadBudgetMs(true, "100")).toBe(100);
   });
});

describe("wantsWholePage", () => {
   const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

   it("gives a person with a browser the budgeted page: a user agent, a navigation header, and no bot verdict", () => {
      expect(wantsWholePage(BROWSER, false, "navigate")).toBe(false);
      expect(wantsWholePage("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1", false, "cors")).toBe(false);
      // A phone whose model name happens to contain "bot" is still a browser.
      expect(wantsWholePage("Mozilla/5.0 (Linux; Android 11; Cubot X30) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36", false, "navigate")).toBe(false);
   });

   it("gives the whole page to what the framework calls a bot, even one that sends the header", () => {
      expect(wantsWholePage(BROWSER, true, "navigate")).toBe(true);
   });

   it("gives the whole page to everything that is not a browser: crawlers, link checkers and monitors send no Sec-Fetch-Mode", () => {
      for (const agent of ["Mozilla/5.0 (compatible; ClaudeBot/1.0)", "curl/8.4.0", "python-requests/2.31", "Go-http-client/2.0", "Datadog/Synthetics", "StatusCake", BROWSER]) {
         expect(wantsWholePage(agent, false, null), agent).toBe(true);
         expect(wantsWholePage(agent, false, undefined), agent).toBe(true);
         expect(wantsWholePage(agent, false, "  "), agent).toBe(true);
      }
   });

   it("gives the whole page to a client that says nothing about itself", () => {
      for (const missing of [undefined, null, "", "   "]) expect(wantsWholePage(missing, false, "navigate")).toBe(true);
   });
});
