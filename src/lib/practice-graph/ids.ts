/**
 * Client-generated element IDs (`P9-C-GRF-01`): a prefix (`n_` node, `e_` edge, `b_` boundary) and a 26-character Crockford ULID.
 * An ID is minted once, when an element is created, and never because its label, type or position changed.
 */

export type IdPrefix = "n" | "e" | "b";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ID_PATTERN = /^(n|e|b)_[0-9A-HJKMNP-TV-Z]{26}$/;

function encodeTime(ms: number): string {
   let value = Math.max(0, Math.min(Math.floor(ms), 2 ** 48 - 1));
   let out = "";
   for (let i = 0; i < 10; i++) {
      out = CROCKFORD[value % 32] + out;
      value = Math.floor(value / 32);
   }
   return out;
}

function encodeRandom(bytes: Uint8Array): string {
   let out = "";
   for (let i = 0; i < 16; i++) out += CROCKFORD[bytes[i] % 32];
   return out;
}

export function newId(prefix: IdPrefix, now: number = Date.now()): string {
   const bytes = new Uint8Array(16);
   globalThis.crypto.getRandomValues(bytes);
   return `${prefix}_${encodeTime(now)}${encodeRandom(bytes)}`;
}

export function isElementId(value: unknown, prefix?: IdPrefix): value is string {
   if (typeof value !== "string" || !ID_PATTERN.test(value)) return false;
   return prefix === undefined || value[0] === prefix;
}
