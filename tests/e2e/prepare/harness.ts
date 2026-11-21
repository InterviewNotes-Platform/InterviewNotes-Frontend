import type { Page, Route } from "@playwright/test";
import { createFakePrepApi } from "../../../src/lib/prep/fakeApi";
import { ITEM_API_ORIGIN } from "../catalog/harness";
import { PREPARE_ORIGIN } from "./ports";

/**
 * The browser's Prepare API for one test: the repository's contract-faithful in-memory API (versions, 409, validation), answered
 * from inside the test through `page.route`, so each test has its own data and no double outside it keeps a log. The reader build's
 * browser calls `NEXT_PUBLIC_API_URL`, which is the item-state double's origin; those calls never reach it here.
 *
 * The session's token is the fixture identity's; the fake sees `token` instead, and a token it does not know is a 401, which is how
 * a test ends the session.
 */
export function prepApi() {
   const api = createFakePrepApi({ continuity: false });
   const user = api.signIn("ada");
   const state = { token: user as string };
   const cors = {
      "access-control-allow-origin": PREPARE_ORIGIN,
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
   };

   async function answer(route: Route) {
      const request = route.request();
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const contentType = request.headers()["content-type"];
      const response = await api.fetch(request.url(), {
         method: request.method(),
         headers: { Authorization: `Bearer ${state.token}`, ...(contentType ? { "Content-Type": contentType } : {}) },
         body: request.postData() ?? undefined,
      });
      return route.fulfill({ status: response.status, headers: { ...cors, "content-type": response.headers.get("content-type") ?? "application/json" }, body: await response.text() });
   }

   const call = (method: string, path: string, body?: unknown) =>
      api.fetch(`${ITEM_API_ORIGIN}/me/prep${path}`, { method, headers: { Authorization: `Bearer ${user}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

   return {
      api,
      /** Routes the page's Prepare calls to this API. */
      attach: (page: Page) => page.route(`${ITEM_API_ORIGIN}/me/prep/**`, answer),
      /** From now on the browser's token is one the API does not know: every call is a 401, as after a sign-out elsewhere. */
      endSession() {
         state.token = "token-ended";
      },
      /** Another way the workspace can be lost: the API answers 404 to everything. */
      withdraw: () => api.setEnabled(false),
      /** A custom answer written straight into the API, as the signed-in user, in the order called. */
      async seed(question: string, status: "draft" | "in_progress" | "ready" = "draft") {
         const created = (await (await call("POST", "/answers", { source: "custom", question_snapshot: question, framework: "star" })).json()) as { id: string; version: number };
         if (status !== "draft") await call("PATCH", `/answers/${created.id}`, { version: created.version, status });
         return created.id;
      },
      async answers() {
         return ((await (await call("GET", "/answers?limit=100")).json()) as { items: { id: string; question_snapshot: string; status: string; fields?: Record<string, string>; content_id?: string; question_id?: string }[] }).items;
      },
      /** Requests the browser made, as `METHOD path`, in order. */
      requests: () => api.requests.map(({ method, path }) => `${method} ${path}`),
   };
}

export type PrepApi = ReturnType<typeof prepApi>;
