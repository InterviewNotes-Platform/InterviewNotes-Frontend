import { expect, test } from "@playwright/test";

// `/` and `/learn` need the backend API at render time, so smoke covers the static public routes.

test("login page shows the sign-in card", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Welcome Back")).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeEnabled();
});

test("signup links through to login", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByText("Create Account")).toBeVisible();

    await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Welcome Back")).toBeVisible();
});

test("demo page renders article content", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByRole("heading", { name: "Ticketmaster" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Section 2: Solution Comparisons" })).toBeVisible();
});
