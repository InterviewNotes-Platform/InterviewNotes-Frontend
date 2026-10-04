import { defineConfig, devices } from "@playwright/test";
import {
    FAKE_API_ORIGIN,
    FAKE_API_PORT,
    FAKE_AUTH_ORIGIN,
    FAKE_AUTH_PORT,
    ISOLATED_API_ORIGIN,
    ISOLATED_API_PORT,
    ISOLATED_ORIGIN,
    ISOLATED_PORT,
    PREVIEW_API_ORIGIN,
    PREVIEW_API_PORT,
    PREVIEW_DIST,
    PREVIEW_ORIGIN,
    PREVIEW_PORT,
    PREVIEW_TOKEN,
    REJECTED_ORIGIN,
    REJECTED_PORT,
    REJECTED_TOKEN,
} from "./tests/e2e/catalog/harness";

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
                // Production holds no preview credential, whatever the machine's shell or .env.local carries.
                CATALOG_PREVIEW_TOKEN: "",
                NEXT_PUBLIC_SUPABASE_URL: FAKE_AUTH_ORIGIN,
                NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key",
                NEXT_TELEMETRY_DISABLED: "1",
            },
        },
        {
            // A private API double: only home.spec.ts reads its /catalog log, so the log belongs to one test.
            command: `node tests/e2e/catalog/fake-api.mjs ${ISOLATED_API_PORT}`,
            url: `${ISOLATED_API_ORIGIN}/health`,
            reuseExistingServer: !process.env.CI,
        },
        {
            // The production build above, served again with `API_URL` pointing at that private double.
            command: `npx next start -p ${ISOLATED_PORT}`,
            url: `${ISOLATED_ORIGIN}/login`,
            reuseExistingServer: !process.env.CI,
            env: {
                API_URL: ISOLATED_API_ORIGIN,
                CATALOG_PREVIEW_TOKEN: "",
                NEXT_PUBLIC_SUPABASE_URL: FAKE_AUTH_ORIGIN,
                NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key",
                NEXT_TELEMETRY_DISABLED: "1",
            },
        },
        {
            // The preview API double: /catalog answers only the holder of the preview credential (backend D9).
            command: `node tests/e2e/catalog/fake-api.mjs ${PREVIEW_API_PORT}`,
            url: `${PREVIEW_API_ORIGIN}/health`,
            reuseExistingServer: !process.env.CI,
            env: { FAKE_API_PREVIEW_TOKEN: PREVIEW_TOKEN },
        },
        {
            // The preview deployment: its own build, with the synthetic credential present while it is built.
            command: `rm -rf ${PREVIEW_DIST}/cache/fetch-cache && npx next build && npx next start -p ${PREVIEW_PORT}`,
            url: `${PREVIEW_ORIGIN}/login`,
            reuseExistingServer: !process.env.CI,
            timeout: 300_000,
            env: {
                NEXT_DIST_DIR: PREVIEW_DIST,
                API_URL: PREVIEW_API_ORIGIN,
                CATALOG_PREVIEW_TOKEN: PREVIEW_TOKEN,
                NEXT_PUBLIC_SUPABASE_URL: FAKE_AUTH_ORIGIN,
                NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key",
                NEXT_TELEMETRY_DISABLED: "1",
            },
        },
        {
            // The preview build again, but holding a credential the preview API rejects.
            command: `npx next start -p ${REJECTED_PORT}`,
            url: `${REJECTED_ORIGIN}/login`,
            reuseExistingServer: !process.env.CI,
            env: {
                NEXT_DIST_DIR: PREVIEW_DIST,
                API_URL: PREVIEW_API_ORIGIN,
                CATALOG_PREVIEW_TOKEN: REJECTED_TOKEN,
                NEXT_PUBLIC_SUPABASE_URL: FAKE_AUTH_ORIGIN,
                NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key",
                NEXT_TELEMETRY_DISABLED: "1",
            },
        },
    ],
});
