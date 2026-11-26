/**
 * What the browser may show, from the backend's `capability` answer alone (spec §9, §11). Fail closed: practice is
 * available only when the API answered 200 and said `practice_available: true`. A disabled flag, a caller outside the
 * rollout, a missing route, a network error and a malformed answer all mean "unavailable"; nothing here reads a flag.
 */

import type { PracticeResult } from "./client";
import type { CapabilityOut } from "./types";

export type Availability =
   | { state: "available"; capability: CapabilityOut }
   | { state: "signed_out" }
   | { state: "unavailable"; reason: "disabled" | "not_ready" | "error" };

export function availabilityOf(result: PracticeResult<CapabilityOut>): Availability {
   switch (result.status) {
      case "ok":
         return result.data.practice_available === true ? { state: "available", capability: result.data } : { state: "unavailable", reason: "not_ready" };
      case "unauthenticated":
         return { state: "signed_out" };
      case "disabled":
      case "notFound":
         return { state: "unavailable", reason: "disabled" };
      default:
         return { state: "unavailable", reason: "error" };
   }
}
