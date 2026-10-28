import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRIVACY_HREF, PRIVACY_VERSION, SUPPORT_EMAIL } from "@/lib/privacy";
import PrivacyPage from "./page";

afterEach(() => vi.unstubAllEnvs());

function renderPage(ai?: string) {
   vi.stubEnv("NEXT_PUBLIC_AI_ENABLED", ai);
   return render(<PrivacyPage />);
}

describe("Privacy & AI Use page", () => {
   it("puts the TL;DR before the full details", () => {
      renderPage();
      const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Privacy & AI Use");
      expect(headings[0]).toBe("TL;DR");
      expect(headings.slice(1)).toEqual([
         "Who runs InterviewNotes",
         "What InterviewNotes stores",
         "Where your data is kept, and backups",
         "AI features",
         "Your controls",
         "Changes to this page",
      ]);
   });

   it("shows the consent document version the API must require", () => {
      renderPage();
      expect(screen.getByText(`Version ${PRIVACY_VERSION}`)).toBeInTheDocument();
   });

   it.each([undefined, "", "false", "TRUE"])("says AI is not available when the setting is %j", (value) => {
      const { container } = renderPage(value);
      expect(container).toHaveTextContent("AI features are not available yet");
      expect(container).not.toHaveTextContent("AI features are available in this environment");
   });

   it("says AI is available only when the build setting is exactly true", () => {
      const { container } = renderPage("true");
      expect(container).toHaveTextContent("AI features are available in this environment");
      expect(container).not.toHaveTextContent("not available yet");
   });

   it("names the provider for each plan", () => {
      renderPage();
      const rows = within(screen.getByRole("table", { name: "AI provider by plan" })).getAllByRole("row");
      expect(rows.slice(1).map((row) => row.textContent)).toEqual(["FreeGroq", "PremiumOpenAI"]);
   });

   it("makes no unverified retention, backup or third-party promise", () => {
      const text = renderPage().container.textContent ?? "";
      expect(text).toContain("don't claim one");
      expect(text).toContain("don't currently keep backups");
      for (const claim of [/zero data retention is (enabled|active|on)/i, /no third part/i, /never (stored|retained)/i, /restored? from (a )?backup/i, /lawful basis/i]) {
         expect(text).not.toMatch(claim);
      }
   });

   it("makes no account-level privacy or isolation promise", () => {
      const text = renderPage().container.textContent ?? "";
      expect(text).toContain("We don't sell it.");
      for (const claim of [/private to your account/i, /only to you/i, /make it public/i, /nothing you save is sent/i]) {
         expect(text).not.toMatch(claim);
      }
   });

   it("dates the region of each environment's database and names no other region", () => {
      renderPage();
      const section = screen.getByRole("heading", { name: "Where your data is kept, and backups" }).parentElement!;
      expect(within(section).getByText(/^Your account and preparation content/).textContent?.replace(/\s+/g, " ").trim()).toBe(
         "Your account and preparation content are stored with Supabase. As of 27 October 2026, the database the live " +
            "service uses is in Supabase's East US (Ohio) region, and the one our separate beta environment uses is in South " +
            "Asia (Mumbai). That may be outside the country where you live.",
      );
      expect(document.body.textContent?.match(/\(Ohio\)|\(Mumbai\)/g)).toEqual(["(Ohio)", "(Mumbai)"]);
   });

   it("states only the backups we set up, and nothing about copies held by Supabase", () => {
      renderPage();
      const section = screen.getByRole("heading", { name: "Where your data is kept, and backups" }).parentElement!;
      const backups = within(section).getByText(/we haven.t set up backups/);
      expect(backups.textContent?.replace(/\s+/g, " ").trim()).toBe(
         "As of 27 October 2026, we haven't set up backups for either database, the live service's or beta's, so we can't " +
            "restore lost data. None of Supabase's replica, pipeline or log export features is set up for them either. If we " +
            "start keeping backups, this page will say so first.",
      );
      const text = document.body.textContent ?? "";
      for (const claim of [/remains? with supabase/i, /no (backup )?cop(y|ies)/i, /cop(y|ies)[^.]*(remain|kept|deleted)/i, /deleted[^.]*backups?/i]) {
         expect(text).not.toMatch(claim);
      }
   });

   it("uses no em or en dashes in its prose", () => {
      expect(renderPage().container.textContent).not.toMatch(/[–—]/);
   });

   it("gives the support address and links itself from the footer", () => {
      renderPage();
      expect(screen.getAllByRole("link", { name: SUPPORT_EMAIL })[0]).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
      expect(screen.getByRole("link", { name: "Privacy & AI Use" })).toHaveAttribute("href", PRIVACY_HREF);
   });
});
