import { describe, expect, it } from "vitest";
import { PRACTICE_DATA_NOTICE, PRACTICE_DELETE_COPY, PRACTICE_EXPORT_COPY, PRACTICE_TERMS_DOCUMENT_ID, PRACTICE_TERMS_HREF, PRACTICE_TERMS_VERSION, PRACTICE_WITHDRAW_COPY } from "./practice-terms";
import { PRIVACY_DOCUMENT_ID, PRIVACY_HREF, PRIVACY_VERSION } from "./privacy";

describe("practice data terms: version isolation (P9-OD-15)", () => {
   it("leaves the P7 Privacy & AI Use document and version unchanged", () => {
      expect(PRIVACY_DOCUMENT_ID).toBe("privacy-and-ai-use");
      expect(PRIVACY_VERSION).toBe("2026-11-16");
      expect(PRIVACY_HREF).toBe("/privacy");
   });

   it("is its own document with its own version and page", () => {
      expect(PRACTICE_TERMS_DOCUMENT_ID).toBe("practice-data");
      expect(PRACTICE_TERMS_DOCUMENT_ID).not.toBe(PRIVACY_DOCUMENT_ID);
      expect(PRACTICE_TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(PRACTICE_TERMS_HREF).toBe("/privacy/practice");
      expect(PRACTICE_TERMS_HREF).not.toBe(PRIVACY_HREF);
   });
});

describe("practice data copy", () => {
   const all = JSON.stringify([PRACTICE_DATA_NOTICE, PRACTICE_DELETE_COPY, PRACTICE_EXPORT_COPY, PRACTICE_WITHDRAW_COPY]);

   it("deletion confirmations name what is deleted, that it is permanent, and that an earlier copy can still hold it", () => {
      for (const copy of [PRACTICE_DELETE_COPY.attempt, PRACTICE_DELETE_COPY.all]) {
         expect(copy.body).toMatch(/permanently deletes/);
         expect(copy.body).toContain("It can't be undone.");
         expect(copy.body).toContain("We keep no automatic backups of practice data, but a manual copy of the database made before you delete it can still hold it until that copy is removed.");
         expect(copy.body).not.toMatch(/expire/);
      }
      expect(PRACTICE_DELETE_COPY.all.body).toContain("Your record of accepting the practice data terms is kept, because deleting your data does not withdraw it.");
   });

   it("withdrawal deletes nothing and blocks new attempts only", () => {
      expect(PRACTICE_WITHDRAW_COPY.body).toContain("You won't be able to start a new attempt until you accept again. This deletes nothing");
      expect(PRACTICE_WITHDRAW_COPY.body).toContain("you can still open, edit, export and delete them while practice is available");
   });

   it("never calls an export an exact copy and never promises immediate backup removal, a period, a region or zero retention", () => {
      expect(all).not.toMatch(/identical|exact copy|byte|immediately|\b\d+\s*(hours?|days?|months?)\b|region|zero (data )?retention|guarantee/i);
      expect(all).not.toMatch(/[–—]/);
   });
});
