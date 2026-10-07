import { describe, expect, it } from "vitest";
import { MAIN_CONTENT_ID } from "@/components/layout/AppShell";
import { moduleFragmentId, moduleLocation, SHELL_IDS } from "./moduleLocation";
import type { CatalogTrack } from "./types";

const track = (over: Partial<CatalogTrack> = {}): CatalogTrack => ({ id: "track.home", slug: "home", title: "Home", summary: "", modules: [], ...over });

describe("moduleLocation", () => {
   it("is the Track URL with the Module key as its fragment, never a new route", () => {
      expect(moduleLocation(track(), { key: "applied-practice" })).toBe("/tracks/home#applied-practice");
   });

   it("falls back to the plain Track URL for a key that equals a shell id", () => {
      expect(moduleLocation(track(), { key: "main-content" })).toBe("/tracks/home");
      expect(moduleFragmentId({ key: "main-content" })).toBeNull();
      expect(moduleFragmentId({ key: "orientation" })).toBe("orientation");
   });

   it("covers the app shell's main-content id", () => {
      expect(SHELL_IDS).toContain(MAIN_CONTENT_ID);
   });

   it("is null when the Track has no canonical route, rather than inventing one", () => {
      expect(moduleLocation(track({ id: "track.other" }), { key: "a" })).toBeNull();
   });
});
