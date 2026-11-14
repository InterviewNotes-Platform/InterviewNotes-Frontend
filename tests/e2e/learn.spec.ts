import { CANARY, expect, exposures, legacyCourse, test } from "./catalog/harness";

// The legacy `/learn/*` interface is retired (P6-T7): every path answers with a temporary redirect to `/tracks` (P8 spec §5).
const [freeChapter, premiumChapter] = legacyCourse.chapters;
const PATHS = [
   "/learn",
   `/learn/${legacyCourse.slug}`,
   `/learn/${legacyCourse.slug}/${freeChapter.slug}`,
   `/learn/${legacyCourse.slug}/${premiumChapter.slug}`,
   "/learn/behavioral-interviews/story-bank",
   "/learn/unknown-course/unknown-chapter",
];

test("each /learn path answers 307 with /tracks as its Location", async ({ request }) => {
   for (const path of PATHS) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(307);
      expect(response.headers().location, path).toBe("/tracks");
   }
});

test("a /learn redirect keeps the query string", async ({ request }) => {
   const response = await request.get("/learn/some-course?ref=newsletter&x=1", { maxRedirects: 0 });
   expect(response.status()).toBe(307);
   expect(response.headers().location).toBe("/tracks?ref=newsletter&x=1");
});

test("a browser ends on the /tracks page, not on a legacy page, a blank page or an error", async ({ page, traffic }) => {
   for (const path of PATHS) {
      await page.goto(path);
      await expect(page, path).toHaveURL("/tracks");
      await expect(page.getByRole("heading", { level: 1, name: "Learn in order, one Track at a time." }), path).toBeVisible();
      await expect(page.getByRole("heading", { name: "Interview Paths" }), path).toHaveCount(0);
      await expect(page.getByText("Sign in to read this chapter."), path).toHaveCount(0);
   }
   expect(await exposures(page, await traffic.responses(), CANARY)).toEqual([]);
});
