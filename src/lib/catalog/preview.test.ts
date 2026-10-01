import { afterEach, describe, expect, it, vi } from "vitest";
import { isPreview, previewDelivery } from "./preview";

const TOKEN = "unit-synthetic-preview-token-0123456789abcdef";
const API = "https://api.test";

afterEach(() => {
   vi.unstubAllEnvs();
});

describe("production (no preview credential)", () => {
   it.each([undefined, ""])("is not a preview when the credential is %j", (value) => {
      if (value !== undefined) vi.stubEnv("CATALOG_PREVIEW_TOKEN", value);
      expect(isPreview()).toBe(false);
      expect(previewDelivery(API)).toEqual({ headers: {}, shareable: true });
   });

   it("sends nothing even over a plain-http API", () => {
      expect(previewDelivery("http://api.internal")).toEqual({ headers: {}, shareable: true });
   });
});

describe("preview (credential held)", () => {
   it("sends exactly X-Preview-Token and marks answers unshareable", () => {
      vi.stubEnv("CATALOG_PREVIEW_TOKEN", TOKEN);
      expect(isPreview()).toBe(true);
      expect(previewDelivery(API)).toEqual({ headers: { "X-Preview-Token": TOKEN }, shareable: false });
   });

   it.each(["https://api.test", "http://localhost:8000", "http://127.0.0.1:8000", "http://[::1]:8000"])(
      "may send it to %s",
      (base) => {
         vi.stubEnv("CATALOG_PREVIEW_TOKEN", TOKEN);
         expect(previewDelivery(base)?.headers).toEqual({ "X-Preview-Token": TOKEN });
      }
   );

   it.each(["http://api.internal", "http://10.0.0.5:8000", "ftp://api.test", "not a url"])(
      "refuses to send it to %s",
      (base) => {
         vi.stubEnv("CATALOG_PREVIEW_TOKEN", TOKEN);
         expect(previewDelivery(base)).toBeNull();
      }
   );

   it.each([
      ["too short", "short-token"],
      ["whitespace only", " ".repeat(40)],
      ["trailing newline", `${TOKEN}\n`],
      ["inner space", `${TOKEN} x`],
      ["non-ASCII", `${TOKEN}é`],
   ])("is still a preview but unusable when the credential is %s", (_label, value) => {
      vi.stubEnv("CATALOG_PREVIEW_TOKEN", value);
      expect(isPreview()).toBe(true);
      expect(previewDelivery(API)).toBeNull();
   });
});
