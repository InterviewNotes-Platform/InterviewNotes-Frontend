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

   it("says that an AI result can be wrong or add details the reader did not write", () => {
      const { container } = renderPage();
      expect(container).toHaveTextContent(/AI can be wrong, and it can add details you did not write, so read each result against what you know is true before you apply it/);
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
      expect(text).toContain("We don't keep backups of the live service's database");
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

   it("states no live-service backup, the beta test copies and how they are kept, and nothing about copies held by Supabase", () => {
      renderPage();
      const section = screen.getByRole("heading", { name: "Where your data is kept, and backups" }).parentElement!;
      const paragraphs = Array.from(section.querySelectorAll("p")).map((p) => p.textContent?.replace(/\s+/g, " ").trim());
      expect(paragraphs.slice(1)).toEqual([
         "We don't keep backups of the live service's database, so we can't restore lost data from it. None of Supabase's " +
            "replica, pipeline or log export features is set up for it. We don't claim anything about copies Supabase may " +
            "keep itself.",
         "For our separate beta environment we keep encrypted backup copies of its database, made to test that restoring " +
            "works. A copy holds everything in the beta database when it was made, including account records and saved " +
            "stories, answers and notes. Copies are encrypted and stored on a computer controlled by the operator, and are " +
            "not uploaded to another service or location. We make them occasionally, keep only the three most recent, and " +
            "a new copy deletes the oldest.",
         "If you use Delete all on the beta environment, your data leaves the beta database but not the copies made before " +
            "you did. It stays in them until newer copies replace them, and we can't say when that will be. If we start " +
            "keeping backups of the live service's database, this page will say so first.",
      ]);
      const text = document.body.textContent ?? "";
      for (const claim of [/remains? with supabase/i, /supabase[^.]*(deletes|removes|erases)/i, /off-?site/i, /each database/i, /once a month/i, /monthly/i, /backups? of (both|each|every)/i]) {
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
