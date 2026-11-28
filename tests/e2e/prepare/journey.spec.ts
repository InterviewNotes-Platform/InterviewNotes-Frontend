import { test as plain, type Page } from "@playwright/test";
import { expect, sessionCookie, test as base } from "../catalog/harness";
import { prepApi, type PrepApi } from "./harness";
import { PREPARE_ORIGIN } from "./ports";

/*
 * Prepare on the reader build (Prepare flag on), through the real UI and the real Lesson questions (P8-PREP-UX-03, the Shelf). The browser's
 * Prepare API is the repository's in-memory fake, answered inside each test, so a test owns its data and fails alone.
 */

const test = base.extend<{ prep: PrepApi }>({
   prep: async ({ page }, provide) => {
      const prep = prepApi();
      await prep.attach(page);
      await provide(prep);
   },
});
test.use({ baseURL: PREPARE_ORIGIN });

const questions = (page: Page) => page.getByRole("group", { name: "Question", exact: true });
const first = (page: Page) => questions(page).locator("label").first();
/** The open principle's sheet: a modal dialog titled with the principle. */
const stage = (page: Page, name: string) => page.getByRole("dialog").getByRole("heading", { level: 2, name });
/** A contents tile is a button named by its title and question count. */
const tile = (page: Page, name: RegExp) => page.getByRole("button", { name });
const grid = (page: Page) => page.getByRole("heading", { level: 2, name: "Amazon Leadership Principles" });
const start = (page: Page) => page.getByRole("button", { name: "Start answer" });
const search = (page: Page) => page.getByRole("searchbox", { name: "Find a question in Amazon Leadership Principles" });
const home = (page: Page) => page.getByRole("link", { name: "Your answers" }).first();

test.describe("signed out", () => {
   test.use({ identity: "signed-out" });

   test("Prepare and the picker send the reader to sign in, and back to the same place", async ({ page }) => {
      await page.goto("/prepare");
      await expect(page).toHaveURL(/\/login\?redirect=%2Fprepare$/);
      await page.goto("/prepare/new?collection=amazon");
      await expect(page).toHaveURL(/\/login\?redirect=%2Fprepare%2Fnew%3Fcollection%3Damazon$/);
   });
});

test.describe("signed in", () => {
   test.use({ identity: "unentitled" });

   test("choose a collection, search it, start an answer, write, leave, resume and mark it Ready", async ({ page, prep }) => {
      await page.goto("/prepare");
      await expect(page.getByRole("heading", { level: 1, name: "Prepare" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Start here" })).toBeVisible();

      // Choose a volume from the Library: one Lesson read on the server, and every principle on screen as a tile.
      await page.getByRole("region", { name: "Library" }).getByRole("link", { name: /Amazon Leadership Principles/ }).click();
      await expect(page).toHaveURL(/\/prepare\/new\?collection=amazon$/);
      await expect(grid(page)).toBeVisible();
      await expect(tile(page, /, \d+ questions?$/)).toHaveCount(16);
      await expect(page.getByRole("dialog")).toHaveCount(0);

      // Browse: opening a principle is a view position in the address and no request of any kind.
      prep.api.requests.length = 0;
      await tile(page, /^Ownership,/).click();
      await expect(stage(page, "Ownership")).toBeVisible();
      await expect(page).toHaveURL(/group=2/);
      await expect(questions(page).getByRole("radio")).toHaveCount(3);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);

      // Search inside the collection: a filter over what is loaded, so nothing is requested, and Enter starts nothing.
      await search(page).fill("backbone");
      await expect(page.getByRole("status").filter({ hasText: /match/ })).toBeVisible();
      await search(page).press("Enter");
      await first(page).click();
      await expect(page.locator("form").getByText(/^Selected ·/)).toBeVisible();
      expect(prep.requests()).toEqual([]);

      // Closing the search opens the chosen question's own principle in its sheet, ready to start.
      await search(page).press("Escape");
      await expect(stage(page, "Have Backbone; Disagree and Commit")).toBeVisible();
      await expect(questions(page).getByRole("radio", { checked: true })).toHaveCount(1);

      // Create: a double click makes one answer, and the editor opens on it.
      await start(page).dblclick();
      await expect(page).toHaveURL(/\/prepare\/answers\/[0-9a-f-]+$/);
      await expect(page.getByRole("heading", { level: 1, name: "Your answer" })).toBeVisible();
      const [created] = await prep.answers();
      expect(await prep.answers()).toHaveLength(1);
      expect(created).toMatchObject({ content_id: "lesson.amazon-leadership-principles", status: "draft" });
      expect(created.question_id).toMatch(/^alp-have-backbone/);
      // A company question is related to its own Lesson: no "changed" notice, and the guidance link is there.
      await expect(page.getByRole("link", { name: /^Read the Lesson guidance/ })).toBeVisible();
      await expect(page.getByText("The question changed in the Lesson.", { exact: false })).toHaveCount(0);

      // Edit: it saves on its own.
      await page.getByLabel("Situation").fill("A teammate and I disagreed about the retry policy.");
      await expect(page.getByText("Saved", { exact: true })).toBeVisible();
      expect((await prep.answers())[0].fields?.situation).toContain("retry policy");

      // Leave and resume: Continue offers the answer, and the text is back.
      await home(page).click();
      await expect(page).toHaveURL(/\/prepare$/);
      const resume = page.getByRole("link", { name: /^Continue writing/ });
      await expect(resume).toBeVisible();
      await expect(resume).toHaveAttribute("aria-label", `Continue writing: ${created.question_snapshot}`);
      await resume.click();
      await expect(page.getByLabel("Situation")).toHaveValue(/retry policy/);

      // Change the status: it saves, and the answer moves to the Ready lane.
      await page.getByLabel("Status").selectOption("ready");
      await expect(page.getByText("Saved", { exact: true })).toBeVisible();
      await home(page).click();
      await expect(page.getByText(/Everything you started is Ready/)).toBeVisible();
      await expect(page.getByRole("link", { name: /^Continue writing/ })).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Your answers" }).getByRole("link", { name: created.question_snapshot })).toBeVisible();
      expect((await prep.answers())).toHaveLength(1);
   });

   test("never starts a question that is not on screen, and starts it again once its principle is open", async ({ page, prep }) => {
      await page.goto("/prepare/new?collection=amazon");
      await expect(grid(page)).toBeVisible();
      await tile(page, /^Customer Obsession,/).click();
      await expect(stage(page, "Customer Obsession")).toBeVisible();
      await first(page).click();
      await expect(page.getByRole("dialog").getByText(/^Selected ·/)).toBeVisible();
      await expect(start(page)).toBeEnabled();

      // Step away: the choice is out of view, so the sheet asks for another and Start answer waits.
      await page.getByRole("button", { name: "Next principle" }).click();
      await expect(stage(page, "Ownership")).toBeVisible();
      await expect(page.getByText("Choose a question to start your answer.")).toBeVisible();
      await expect(start(page)).toBeDisabled();
      await expect(page.getByRole("dialog").getByText(/^Selected ·/)).toHaveCount(0);

      // The same from the grid, through a search that hides it, and through another tile.
      await page.keyboard.press("Escape");
      await expect(start(page)).toHaveCount(0);
      await search(page).fill("backbone");
      await expect(start(page)).toBeDisabled();
      await search(page).press("Escape");
      await tile(page, /^Earn Trust,/).click();
      await expect(start(page)).toBeDisabled();
      expect(prep.requests().filter((line) => line.startsWith("POST"))).toEqual([]);

      // Back where it was chosen it counts again, checked, and is what gets started.
      await page.keyboard.press("Escape");
      await tile(page, /^Customer Obsession,/).click();
      await expect(questions(page).getByRole("radio", { checked: true })).toHaveCount(1);
      await expect(start(page)).toBeEnabled();
      await start(page).click();
      await expect(page).toHaveURL(/\/prepare\/answers\//);
      expect((await prep.answers()).map(({ question_id }) => question_id)).toEqual(["alp-customer-obsession-01"]);
   });

   test("a question named by a Lesson link is on screen and ready to start", async ({ page, prep }) => {
      await page.goto("/prepare/new?content=lesson.amazon-leadership-principles&question=alp-earn-trust-01");
      await expect(stage(page, "Earn Trust")).toBeVisible();
      await expect(questions(page).getByRole("radio", { checked: true })).toHaveCount(1);
      await expect(start(page)).toBeEnabled();
      await start(page).click();
      await expect(page).toHaveURL(/\/prepare\/answers\//);
      expect((await prep.answers()).map(({ question_id }) => question_id)).toEqual(["alp-earn-trust-01"]);
   });

   test("a Lesson's Prepare your answer opens the editor in one click, and the same answer the next time", async ({ page, prep }) => {
      const href = "/prepare/new?content=lesson.amazon-leadership-principles&question=alp-earn-trust-01&start=1";
      await page.goto(href);
      await expect(page).toHaveURL(/\/prepare\/answers\//);
      const first = page.url();
      expect((await prep.answers()).map(({ question_id }) => question_id)).toEqual(["alp-earn-trust-01"]);
      await page.goto(href);
      await expect(page).toHaveURL(first);
      expect(await prep.answers(), "a second visit reopens the answer instead of starting another").toHaveLength(1);
   });

   test("the workspace scrolls natively: no smooth-scrolling instance, across its client navigations", async ({ page, prep }) => {
      const instances = () => page.evaluate(() => document.querySelectorAll("html.lenis").length);
      await page.goto("/prepare");
      await expect(page.getByRole("heading", { level: 1, name: "Prepare" })).toBeVisible();
      await expect.poll(instances).toBe(0);
      await page.getByRole("region", { name: "Library" }).getByRole("link", { name: /Amazon Leadership Principles/ }).click();
      await expect(page).toHaveURL(/\/prepare\/new\?collection=amazon$/);
      await expect(grid(page)).toBeVisible();
      await expect.poll(instances).toBe(0);
      expect(await prep.answers(), "browsing the workspace starts no answer").toEqual([]);
   });
});

/*
 * The page's own Prepare read is answered 401 or 404 here, which the browser logs as a console error. The catalog harness fails a
 * test on any console error, so these tests use a plain test that signs in the same way and asserts that the one expected message
 * is the only one.
 */
const ended = plain.extend<{ prep: PrepApi; consoleErrors: string[] }>({
   context: async ({ context, baseURL }, provide) => {
      await context.addCookies([sessionCookie("unentitled", baseURL!)]);
      await provide(context);
   },
   prep: async ({ page }, provide) => {
      const prep = prepApi();
      await prep.attach(page);
      await provide(prep);
   },
   consoleErrors: async ({ page }, provide) => {
      const errors: string[] = [];
      page.on("console", (message) => void (message.type() === "error" && errors.push(message.text())));
      page.on("pageerror", (error) => void errors.push(error.message));
      await provide(errors);
   },
});
ended.use({ baseURL: PREPARE_ORIGIN });

ended.describe("when the session ends while the page is open", () => {
   const PRIVATE = "Ada's private question about a production outage";

   async function openWithAnswer(page: Page, prep: PrepApi) {
      await prep.seed(PRIVATE, "in_progress");
      await page.goto("/prepare");
      await expect(page.getByRole("link", { name: `Continue writing: ${PRIVATE}` })).toBeVisible();
   }
   const nothingOfAda = async (page: Page) => {
      await expect(page.getByText(PRIVATE)).toHaveCount(0);
      await expect(page.getByRole("link", { name: /^Continue writing/ })).toHaveCount(0);
   };
   const searchAnswers = async (page: Page, text: string) => {
      await page.getByRole("searchbox", { name: "Search answers" }).fill(text);
      await page.getByRole("button", { name: "Search" }).click();
   };

   ended("the next read finds it ended: the question, the Continue link and the list are gone, and only Sign in is left", async ({ page, prep, consoleErrors }) => {
      await openWithAnswer(page, prep);
      prep.endSession();
      await searchAnswers(page, "outage");
      await expect(page.getByText("Your session has ended. Sign in again to open your workspace.")).toHaveCount(1);
      await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?redirect=%2Fprepare");
      await nothingOfAda(page);
      expect(consoleErrors).toEqual(["Failed to load resource: the server responded with a status of 401 (Unauthorized)"]);
   });

   ended("the workspace is no longer available to this user: nothing of the last read stays on screen", async ({ page, prep, consoleErrors }) => {
      await openWithAnswer(page, prep);
      prep.withdraw();
      await searchAnswers(page, "outage");
      await expect(page.getByText("The preparation workspace is not available right now.")).toBeVisible();
      await nothingOfAda(page);
      expect(consoleErrors).toEqual(["Failed to load resource: the server responded with a status of 404 (Not Found)"]);
   });
});
