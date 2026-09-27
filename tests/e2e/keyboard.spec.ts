import { expect, test } from "@playwright/test";

test("plain links show a visible keyboard focus outline", async ({ page }) => {
    await page.goto("/login");
    await page.keyboard.press("Tab");

    const logo = page.getByRole("banner").getByRole("link", { name: "InterviewNotes" });
    await expect(logo).toBeFocused();
    await expect(logo).not.toHaveCSS("outline-style", "none");
});

test.describe("mobile menu", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("opens, closes and restores focus from the keyboard", async ({ page }) => {
        await page.goto("/login");
        const trigger = page.getByRole("button", { name: "Menu" });

        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        await expect(trigger).toBeFocused();
        await expect(trigger).toHaveAttribute("aria-expanded", "false");

        await page.keyboard.press("Enter");
        await expect(trigger).toHaveAttribute("aria-expanded", "true");

        await page.keyboard.press("Tab");
        await expect(page.getByRole("banner").getByRole("link", { name: "ML System Design" })).toBeFocused();

        await page.keyboard.press("Escape");
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        await expect(trigger).toBeFocused();
    });
});
