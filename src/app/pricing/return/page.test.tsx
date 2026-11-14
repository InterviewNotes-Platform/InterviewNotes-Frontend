import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PricingReturnPage, { metadata } from "./page";

async function open(session_id?: string | string[]) {
   render(await PricingReturnPage({ searchParams: Promise.resolve({ session_id }) }));
}

describe("/pricing/return", () => {
   it("is not indexed, sends no referrer, and renders in the pricing scope", async () => {
      await open("cs_test_abc");
      expect(metadata.robots).toEqual({ index: false, follow: false });
      expect(metadata.referrer).toBe("no-referrer");
      expect(document.querySelector("[data-pricing]")).not.toBeNull();
      expect(document.querySelector("[data-reader]")).toBeNull();
      expect(screen.getAllByRole("main")).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
   });

   it("reads no success from the URL, whatever it carries", async () => {
      for (const value of ["cs_test_abc", ["cs_live_x", "cs_test_y"], "success", "<script>", undefined]) {
         document.body.innerHTML = "";
         await open(value);
         expect(document.body.textContent).not.toMatch(/premium is active/i);
      }
   });
});
