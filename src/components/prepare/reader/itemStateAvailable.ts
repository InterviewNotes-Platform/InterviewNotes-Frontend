import type { PrepClient } from "@/lib/prep/client";

const known = new Map<string, Promise<boolean>>();

/**
 * Whether M2 item state is on, asked of `GET /me/prep/features` once per page load and API origin (api-contract §15.9).
 * Only the server's setting is kept, in memory; an error, a 401 or a signed-out reader (no request is sent) is not
 * remembered, so the next reader page asks again. Anything but a clear `true` is false: M2 fails closed.
 */
export function itemStateAvailable(apiUrl: string, client: PrepClient): Promise<boolean> {
   let answer = known.get(apiUrl);
   if (!answer) {
      answer = client.getFeatures().then((result) => {
         if (result.status !== "ok" && result.status !== "notFound") known.delete(apiUrl);
         return result.status === "ok" && result.data.item_state_available;
      });
      known.set(apiUrl, answer);
   }
   return answer;
}

/** Test seam: forget what was learned. */
export function forgetItemStateAvailability(): void {
   known.clear();
}
