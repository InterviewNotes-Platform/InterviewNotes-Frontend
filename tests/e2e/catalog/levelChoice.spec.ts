import { canonical, expect, item, test, track } from "./harness";

// P6-T8 level-choice Track (A-9): four equal levels, no Start, no cross-level Next, Previous or End of Track.
const levels = track("behavioral-interview-preparation");
const ids = levels.modules[0].items;

test("the overview offers every level as an equal choice and no Start (S6-TRK-5)", async ({ page }) => {
   await page.goto(canonical(levels.id));
   const group = page.getByRole("region", { name: "Choose your level" });
   const links = group.getByRole("link");
   await expect(links).toHaveCount(ids.length);
   for (const [index, id] of ids.entries()) {
      await expect(links.nth(index)).toHaveAttribute("href", canonical(id));
      await expect(links.nth(index)).toContainText(item(id).title);
      await expect(links.nth(index)).toContainText(item(id).summary);
   }
   await expect(page.getByRole("link", { name: /^Start/ })).toHaveCount(0);
   await expect(page.getByRole("main")).not.toContainText(/recommended|start with/i);
   await expect(page.getByRole("navigation", { name: `${levels.title} outline` })).toBeVisible();
});

test("a level closes with Other levels and Back to Track, never Next, Previous or End of Track (S6-RDR-16)", async ({ page }) => {
   await page.goto(canonical(ids[1]));
   await expect(page.getByRole("navigation", { name: /^Next in / })).toHaveCount(0);
   await expect(page.getByRole("navigation", { name: /^End of / })).toHaveCount(0);
   await expect(page.getByRole("link", { name: /^(Next|Previous) lesson/ })).toHaveCount(0);
   const other = page.getByRole("navigation", { name: "Other levels" });
   const links = other.getByRole("link");
   await expect(links).toHaveCount(ids.length);
   await expect(links.nth(0)).toHaveAttribute("href", canonical(ids[0]));
   await expect(links.nth(1)).toHaveAttribute("href", canonical(ids[2]));
   await expect(links.nth(2)).toHaveAttribute("href", canonical(ids[3]));
   await expect(links.nth(3)).toHaveAttribute("href", canonical(levels.id));
   await expect(links.nth(3)).toContainText("Back to Track");
   await expect(page.getByText(`Module 1 of 1 · One of ${ids.length} levels`)).toBeVisible();
   await links.nth(2).click();
   await expect(page).toHaveURL(canonical(ids[3]));
});

test("the Track sidebar lists the levels in order and marks only the current one (S6-RDR-16)", async ({ page }) => {
   await page.setViewportSize({ width: 1280, height: 900 });
   await page.goto(canonical(ids[2]));
   const sidebar = page.getByRole("navigation", { name: "Track contents" });
   await expect(sidebar.getByRole("link").filter({ hasNotText: levels.title })).toHaveText(ids.map((id) => item(id).title));
   await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
   await expect(sidebar.getByRole("link", { name: item(ids[2]).title })).toHaveAttribute("aria-current", "page");
   await expect(page.getByText(`Full outline of ${levels.title}`)).toBeHidden();
});

test("below 1024px the outline keeps the levels in order and marks only the current one", async ({ page }) => {
   await page.setViewportSize({ width: 800, height: 900 });
   await page.goto(canonical(ids[2]));
   await page.getByText(`Full outline of ${levels.title}`).click();
   const outline = page.getByRole("navigation", { name: `${levels.title} outline` });
   await expect(outline.getByRole("link")).toHaveText(ids.map((id) => item(id).title));
   await expect(outline.locator('[aria-current="page"]')).toHaveCount(1);
   await expect(outline.getByRole("link", { name: item(ids[2]).title })).toHaveAttribute("aria-current", "page");
   await expect(outline.getByText("Current level")).toBeVisible();
});

test("an ordinary Track keeps Start, Next lesson and Previous lesson", async ({ page }) => {
   await page.goto(canonical("track.p3-sequence"));
   await expect(page.getByRole("link", { name: /^Start with / })).toHaveCount(1);
   await expect(page.getByRole("region", { name: "Choose your level" })).toHaveCount(0);
   await page.goto(canonical("lesson.p3-seq-two"));
   await expect(page.getByRole("navigation", { name: `Next in ${track("p3-sequence").title}` })).toBeVisible();
   await expect(page.getByRole("link", { name: /^Previous lesson/ })).toHaveCount(1);
   await expect(page.getByRole("navigation", { name: "Other levels" })).toHaveCount(0);
});
