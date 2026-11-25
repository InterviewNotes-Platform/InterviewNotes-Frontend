/**
 * An in-memory `/me/practice` for tests: a `fetch` that answers as the T06 backend does, so T13 to T15 build against the
 * frozen contract without a server (the P7 pattern, `src/lib/prep/fakeApi.ts`). Test-only: production code never imports it.
 *
 * Order, as the backend's: flag off answers `practice_disabled` whatever the token; then the token (401); then the rollout
 * (`practice_disabled`); then a scripted answer, `capability`, or `not_found`, which is what an unimplemented route says.
 * Later tasks script the routes they build with `script(routeId, reply)`; nothing here invents a success.
 */

import { M1_ROUTES, PRACTICE_PREFIX, type PracticeErrorCode, type RouteId } from "./contract";
import type { CapabilityOut, Plan } from "./types";

export type FakeRequest = {
   method: string;
   path: string;
   query: Record<string, string>;
   token: string | null;
   headers: Record<string, string>;
   body: unknown;
   route: RouteId | null;
};

export type FakeReply = { status: number; body?: unknown };
type Handler = FakeReply | ((request: FakeRequest) => FakeReply);

export type FakePracticeOptions = {
   /** The master flag. Off: every route answers `practice_disabled`. */
   enabled?: boolean;
   /** The rollout: false answers `practice_disabled` to a signed-in caller. */
   admitted?: boolean;
   plan?: Plan;
   /** Overrides of the `capability` answer; the default says nothing is available, as T06's backend does. */
   capability?: Partial<CapabilityOut>;
};

const matchers = M1_ROUTES.map((route) => ({
   route,
   pattern: new RegExp(`^${PRACTICE_PREFIX}${route.path.replace(/\{\w+\}/g, "[^/]+")}$`),
}));

export function failure(code: PracticeErrorCode, status: number, members: Record<string, unknown> = {}): FakeReply {
   return { status, body: { detail: code, code, ...members } };
}

export function createFakePracticeApi(options: FakePracticeOptions = {}) {
   let enabled = options.enabled ?? true;
   let admitted = options.admitted ?? true;
   let plan: Plan = options.plan ?? "free";
   let capability: Partial<CapabilityOut> = options.capability ?? {};
   let next: "network" | "timeout" | number | null = null;
   const tokens = new Map<string, string>();
   const scripts = new Map<RouteId, Handler>();
   const requests: FakeRequest[] = [];

   function answer(request: FakeRequest): FakeReply {
      if (!enabled) return failure("practice_disabled", 403);
      if (!request.token || !tokens.has(request.token)) return failure("unauthenticated", 401);
      if (!admitted) return failure("practice_disabled", 403);
      const scripted = request.route ? scripts.get(request.route) : undefined;
      if (scripted) return typeof scripted === "function" ? scripted(request) : scripted;
      if (request.route === "capability") {
         const body: CapabilityOut = {
            practice_available: false,
            practice_ready: false,
            ai_available: false,
            voice_available: false,
            plan,
            consent: { practice_data: "required", practice_ai: "required" },
            limits: null,
            seniorities: [],
            ...capability,
         };
         return { status: 200, body };
      }
      return failure("not_found", 404);
   }

   const fetchFake: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://fake.test");
      const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
      const auth = headers.Authorization ?? "";
      const method = init?.method ?? "GET";
      const matched = matchers.find(({ route, pattern }) => route.method === method && pattern.test(url.pathname));
      const request: FakeRequest = {
         method,
         path: url.pathname,
         query: Object.fromEntries(url.searchParams),
         token: auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null,
         headers,
         body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
         route: matched?.route.id ?? null,
      };
      requests.push(request);
      if (next === "network") {
         next = null;
         throw new TypeError("Failed to fetch");
      }
      if (next === "timeout") {
         next = null;
         throw new DOMException("The operation was aborted.", "AbortError");
      }
      let reply: FakeReply;
      if (typeof next === "number") {
         reply = { status: next, body: { detail: "failure", code: "internal_error" } };
         next = null;
      } else {
         reply = answer(request);
      }
      const { status, body } = reply;
      return new Response(body === undefined || status === 204 ? null : JSON.stringify(body), {
         status,
         headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
      });
   };

   return {
      fetch: fetchFake,
      requests,
      /** A token the fake accepts for `userId`. */
      signIn(userId = "user-1"): string {
         const token = `fake-token-${userId}`;
         tokens.set(token, userId);
         return token;
      },
      setEnabled(value: boolean) {
         enabled = value;
      },
      setAdmitted(value: boolean) {
         admitted = value;
      },
      setPlan(value: Plan) {
         plan = value;
      },
      setCapability(value: Partial<CapabilityOut>) {
         capability = value;
      },
      /** The next request fails: a network error, an aborted (timed out) request, or that bare HTTP status. */
      failNext(kind: "network" | "timeout" | number) {
         next = kind;
      },
      /** Answer a route the way its owning task will, for tests of the screens that call it. */
      script(route: RouteId, handler: Handler) {
         scripts.set(route, handler);
      },
   };
}

export type FakePracticeApi = ReturnType<typeof createFakePracticeApi>;
