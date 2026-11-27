import "server-only";

import { headers } from "next/headers";
import { userAgent } from "next/server";
import { cache } from "react";
import { type Bounded, wantsWholePage, withinBudget } from "./home";

/**
 * How long a browser's Lesson, Problem, Knowledge or Track page waits for the API before it renders the pending state
 * instead. A warm API answers well inside it; a free-tier API that is starting does not, and the visitor is told so rather
 * than shown a blank tab for up to a minute. `ITEM_READ_BUDGET_MS` overrides it (`off` waits as long as the read takes).
 */
export const ITEM_READ_BUDGET_MS = 5000;
const MIN_BUDGET_MS = 100;

export function itemReadBudgetMs(setting: string | undefined = process.env.ITEM_READ_BUDGET_MS): number | null {
   const value = setting?.trim().toLowerCase();
   if (value === "off") return null;
   if (value) {
      const ms = Number(value);
      if (Number.isFinite(ms) && ms >= MIN_BUDGET_MS) return ms;
   }
   return ITEM_READ_BUDGET_MS;
}

/**
 * One deadline per request, shared by the metadata, the route guard and the page, so together they wait at most one budget.
 * Only a browser's document navigation has one: it would otherwise be a blank tab. A refresh or client-side navigation
 * (`Sec-Fetch-Mode: cors`) keeps the current screen, so it waits for the answer however slow, which is how a pending page
 * arrives even when every read outlasts the budget. Crawlers, monitors and browsers too old to say what they are get no
 * deadline: the whole page, its status and its metadata, as before. Outside a request (a unit test) there is none either.
 */
const requestDeadline = cache(async (): Promise<number | null> => {
   const budget = itemReadBudgetMs();
   if (budget === null) return null;
   let requestHeaders: Headers;
   try {
      requestHeaders = await headers();
   } catch {
      return null;
   }
   const mode = requestHeaders.get("sec-fetch-mode");
   if (mode !== "navigate" || wantsWholePage(requestHeaders.get("user-agent"), userAgent({ headers: requestHeaders }).isBot, mode)) return null;
   return Date.now() + budget;
});

/**
 * `read`'s answer, or `{ settled: false }` once this request's deadline has passed. The read is never cancelled. Nothing is
 * decided without an answer: a missing, retired or locked item is only reported once the API has said so.
 */
export async function withinItemBudget<T>(read: Promise<T>): Promise<Bounded<T>> {
   const deadline = await requestDeadline();
   return withinBudget(read, deadline === null ? null : Math.max(0, deadline - Date.now()));
}
