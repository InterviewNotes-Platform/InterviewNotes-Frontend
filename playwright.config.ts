import { defineConfig, devices } from "@playwright/test";
import { FAKE_API_ORIGIN, FAKE_API_PORT, FAKE_AUTH_ORIGIN, FAKE_AUTH_PORT } from "./tests/e2e/catalog/harness";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
    testDir: "./tests/e2e",
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? "github" : "list",
    use: {
        baseURL,
        trace: "on-first-retry",
        screenshot: "only-on-failure",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: [
        {
            // Synthetic catalog/content API and Supabase Auth, so no test reaches a real service.
            command: `node tests/e2e/catalog/fake-api.mjs ${FAKE_API_PORT} ${FAKE_AUTH_PORT}`,
            url: `${FAKE_API_ORIGIN}/health`,
            reuseExistingServer: !process.env.CI,
        },
        {
            // A production build: Next disables Link prefetching in dev, and leak checks must see what users get.
            // The data cache outlives builds, so it is cleared to keep each run independent of the last.
            command: `rm -rf .next/cache/fetch-cache && npx next build && npx next start -p ${PORT}`,
            url: `${baseURL}/login`,
            reuseExistingServer: !process.env.CI,
            timeout: 300_000,
            env: {
                API_URL: FAKE_API_ORIGIN,
                NEXT_PUBLIC_SUPABASE_URL: FAKE_AUTH_ORIGIN,
                NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key",
                NEXT_TELEMETRY_DISABLED: "1",
            },
        },
    ],
});
