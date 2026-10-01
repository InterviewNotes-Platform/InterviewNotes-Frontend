import { CANARY, expect, exposures, legacyCourse, test } from "./catalog/harness";

// Legacy `/learn/*` must be unchanged by the catalog routes: same pages, same reader, same gate.
const [freeChapter, premiumChapter] = legacyCourse.chapters;

test("/learn index, course and chapter pages still render the legacy reader", async ({ page, traffic }) => {
   await page.goto("/learn");
   await expect(page.getByRole("heading", { level: 1 })).toHaveText("Interview Paths");

   await page.getByRole("link", { name: legacyCourse.title }).click();
   await expect(page).toHaveURL(`/learn/${legacyCourse.slug}`);

   await page.getByRole("link", { name: freeChapter.title }).click();
   await expect(page).toHaveURL(`/learn/${legacyCourse.slug}/${freeChapter.slug}`);
   await expect(page.getByText("Legacy free chapter marker.")).toBeVisible();

   await expect(page.getByRole("navigation", { name: "Track context" })).toHaveCount(0);
   await expect(page.getByRole("region", { name: "Related content" })).toHaveCount(0);
   expect(await exposures(page, await traffic.responses(), CANARY)).toEqual([]);
});

test("a legacy premium chapter keeps its legacy sign-in gate", async ({ page }) => {
   const path = `/learn/${legacyCourse.slug}/${premiumChapter.slug}`;
   await page.goto(path);
   await expect(page.getByRole("heading", { name: "Premium Content" })).toBeVisible();
   await expect(page.getByText("Sign in to read this chapter.")).toBeVisible();
   await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute(
      "href",
      `/login?redirect=${path}`
   );
   await expect(page.getByText("Legacy premium chapter marker.")).toHaveCount(0);
});
