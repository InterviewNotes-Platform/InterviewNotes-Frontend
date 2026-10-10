import type { Locator, Page } from "@playwright/test";
import { canonical, expect, item, test } from "./harness";

// P4-T16 links in presentation (S-DEC, S-FUP, S-ALT, S-LNK-13, S-AX-7) on the synthetic P4 Problems: SD carries decisions, deep
// dives, a follow-up with a branch, probes lines and alternatives; the premium Problems carry links to withheld targets.
const SD = item("problem.p4-sd-complete");
const FOLLOW_UPS = item("problem.p4-premium-followups");
const UNITS = item("problem.p4-premium-units");
const sd = canonical(SD.id);

const BRANCHES = "Then, depending on the answer";
const GENERIC = "Linked to material included with full access";
const main = (page: Page) => page.getByRole("main");
const band = (page: Page, name: string) => main(page).getByRole("region", { name, exact: true });
const control = (scope: Locator, name: string) => scope.locator("summary").filter({ hasText: name });
const textOf = (id: string, section: string) => item(id).sections!.find((candidate) => candidate.id === section)!.text;
const titleOf = (id: string, section: string) => item(id).sections!.find((candidate) => candidate.id === section)!.title!;
const unit = (page: Page, id: string) => main(page).locator(`#${id}`).locator("..");
const headings = (scope: Locator, level: number) => scope.getByRole("heading", { level }).allTextContents();

test.describe("Depth & Trade-offs and the Reference Solution: every unit separately revealable (AC-8)", () => {
   test.use({ viewport: { width: 1440, height: 900 } });

   test("decisions and deep dives are listed in authored order, and each opens alone", async ({ page }) => {
      await page.goto(sd);
      const depth = band(page, "Depth & Trade-offs");
      await control(depth, "Compare with the topics").click();
      expect(await headings(depth, 3)).toEqual(["Delivery guarantees", "Ordering", "Queue or direct send?", "How are retries bounded?"]);

      await control(depth, "Show reference: Queue or direct send?").click();
      await expect(main(page).getByText(textOf(SD.id, "decision-queue"))).toBeVisible();
      for (const other of ["deep-dive-delivery", "deep-dive-ordering", "decision-retry"]) await expect(main(page).getByText(textOf(SD.id, other)), other).toBeHidden();
      await control(depth, "Show reference: Ordering").click();
      await expect(main(page).getByText(textOf(SD.id, "deep-dive-ordering"))).toBeVisible();
      await expect(main(page).getByText(textOf(SD.id, "decision-retry"))).toBeHidden();
   });

   test("the Reference Solution says what it is, opens the design with the alternatives listed after it, and each alternative opens alone", async ({ page }) => {
      await page.goto(sd);
      const solution = band(page, "Reference Solution");
      await expect(solution.getByText("Other designs can be just as strong", { exact: false })).toBeVisible();
      await expect(solution.locator("summary").first()).toHaveText("Show the reference solution");
      await expect(main(page).getByText(textOf(SD.id, "reference-design"))).toBeHidden();

      await control(solution, "Show the reference solution").click();
      await expect(main(page).getByText(textOf(SD.id, "reference-design"))).toBeVisible();
      expect(await headings(solution, 4)).toEqual(["Direct send", "Event log"]);
      await expect(solution.getByText("Alternative to: Queue or direct send?")).toBeVisible();
      await expect(solution.getByText("Alternative to: the reference solution")).toBeVisible();
      for (const alternative of ["alt-direct", "alt-whole"]) await expect(main(page).getByText(textOf(SD.id, alternative)), alternative).toBeHidden();

      await control(solution, "Show reference: Direct send").click();
      await expect(main(page).getByText(textOf(SD.id, "alt-direct"))).toBeVisible();
      await expect(main(page).getByText(textOf(SD.id, "alt-whole"))).toBeHidden();
   });
});

test.describe("Follow-ups: probes, dimension, branches under their parent, two levels (AC-10)", () => {
   test.use({ viewport: { width: 1440, height: 900 } });

   test("each top-level follow-up says what it probes, in authored order, with a quiet dimension label", async ({ page }) => {
      await page.goto(sd);
      const followUps = band(page, "Follow-ups");
      await control(followUps, "Show the follow-up questions").click();
      expect(await headings(followUps, 3)).toEqual([
         titleOf(SD.id, "follow-up-lag"),
         titleOf(SD.id, "follow-up-ordering"),
         titleOf(SD.id, "follow-up-plain"),
      ]);
      const lag = unit(page, "follow-up-lag");
      await expect(lag.getByText("Probes: Delivery guarantees")).toBeVisible();
      await expect(lag.getByText("Reliability and operations")).toBeVisible();
      await expect(unit(page, "follow-up-ordering").getByText("Probes: Ordering")).toBeVisible();
      await expect(unit(page, "follow-up-plain").getByText(/Probes:/)).toHaveCount(0);
      await expect(unit(page, "follow-up-ordering").getByText("Trade-off reasoning")).toHaveCount(0); // a label, not a filter or a score
      await expect(followUps.getByText(textOf(SD.id, "follow-up-lag"))).toBeHidden();
   });

   test("a branch sits under its open parent, closed, and nowhere else; no third level exists", async ({ page }) => {
      await page.goto(sd);
      const followUps = band(page, "Follow-ups");
      const branch = titleOf(SD.id, "follow-up-lag-branch");
      await control(followUps, "Show the follow-up questions").click();
      expect(await headings(followUps, 3)).not.toContain(branch); // not a top-level follow-up
      await expect(followUps.getByRole("heading", { name: branch })).toBeHidden(); // beneath a parent that is still closed
      await expect(followUps.getByText(BRANCHES)).toBeHidden();

      await control(followUps, "Show reference: " + titleOf(SD.id, "follow-up-lag")).click();
      await expect(followUps.getByText(textOf(SD.id, "follow-up-lag"))).toBeVisible();
      await expect(followUps.getByText(BRANCHES)).toBeVisible();
      await expect(followUps.getByRole("heading", { name: branch })).toBeVisible();
      await expect(followUps.getByText(textOf(SD.id, "follow-up-lag-branch"))).toBeHidden(); // a parent's body opens no branch
      await expect(followUps.getByText(textOf(SD.id, "hint-follow-up"))).toBeHidden(); // and no hint

      expect(await headings(followUps, 4)).toEqual([BRANCHES]);
      expect(await headings(followUps, 5)).toEqual([branch]);
      await expect(followUps.getByRole("heading", { level: 6 })).toHaveCount(0);
      await control(followUps, "Show reference: " + branch).click();
      await expect(followUps.getByText(textOf(SD.id, "follow-up-lag-branch"))).toBeVisible();
      const [parent, child] = await Promise.all([unit(page, "follow-up-lag").boundingBox(), unit(page, "follow-up-lag-branch").boundingBox()]);
      expect(child!.y).toBeGreaterThan(parent!.y);
      expect(child!.x).toBeGreaterThan(parent!.x); // indented under the parent
   });

   test("a fragment naming a branch opens its parent and the branch", async ({ page }) => {
      await page.goto(`${sd}#follow-up-lag-branch`);
      const followUps = band(page, "Follow-ups");
      await expect(followUps.getByText(textOf(SD.id, "follow-up-lag"))).toBeVisible();
      await expect(followUps.getByText(textOf(SD.id, "follow-up-lag-branch"))).toBeVisible();
      await expect(followUps.getByText(textOf(SD.id, "follow-up-ordering"))).toBeHidden();
   });
});

for (const identity of ["signed-out", "unentitled"] as const) {
   test.describe(`a released follow-up linked to withheld material, as ${identity} (S-FUP-6, S-AX-7, AC-13)`, () => {
      test.use({ identity, viewport: { width: 1440, height: 900 } });

      test("a follow-up linking to a withheld decision shows the generic line and the premium mark, and nothing of the decision", async ({ page }) => {
         await page.goto(canonical(UNITS.id));
         const followUps = band(page, "Follow-ups");
         await control(followUps, "Show the follow-up questions").click();
         const note = unit(page, "follow-up-released").locator("p").first();
         await expect(note).toHaveText(`Premium${GENERIC}`);
         await expect(note.getByText("Premium")).toBeVisible();

         for (const url of [canonical(UNITS.id)]) {
            const html = await (await page.request.get(url)).text();
            const rsc = await (await page.request.get(url, { headers: { RSC: "1" } })).text();
            for (const text of [html, rsc]) {
               for (const leak of ["decision-secret", "Hidden decision", "P4_SENTINEL_DECISION", textOf(UNITS.id, "decision-secret")]) expect(text).not.toContain(leak);
            }
         }
      });

      test("a follow-up under a withheld parent is a top-level follow-up with the same line, while a released parent keeps its branch", async ({ page }) => {
         await page.goto(canonical(FOLLOW_UPS.id));
         const followUps = band(page, "Follow-ups");
         await control(followUps, "Show the follow-up questions").click();
         expect(await headings(followUps, 3)).toEqual([
            titleOf(FOLLOW_UPS.id, "branch-of-withheld"),
            titleOf(FOLLOW_UPS.id, "follow-up-free"),
         ]);
         await expect(unit(page, "branch-of-withheld").locator("p").first()).toHaveText(`Premium${GENERIC}`);
         await expect(unit(page, "follow-up-free").getByText(BRANCHES)).toBeHidden();
         await control(followUps, "Show reference: " + titleOf(FOLLOW_UPS.id, "follow-up-free")).click();
         await expect(unit(page, "follow-up-free").getByText(BRANCHES)).toBeVisible();
         await expect(unit(page, "follow-up-free").getByRole("heading", { name: titleOf(FOLLOW_UPS.id, "branch-of-free") })).toBeVisible();

         const html = await (await page.request.get(canonical(FOLLOW_UPS.id))).text();
         const rsc = await (await page.request.get(canonical(FOLLOW_UPS.id), { headers: { RSC: "1" } })).text();
         for (const text of [html, rsc]) for (const leak of ["P4_SENTINEL_TARGET_ID", "P4_SENTINEL_TARGET_TITLE", "P4_SENTINEL_FOLLOW_UP"]) expect(text).not.toContain(leak);
      });
   });
}
