import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
   notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
   }),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
// The access control is tested on its own; here it is a marker, so rendering the page reads no session.
vi.mock("@/components/practice-privacy/PracticeDataAccess", () => ({ PracticeDataAccess: () => <p>practice data controls</p> }));

import { PRACTICE_TERMS_VERSION } from "@/lib/practice-terms";
import { PRIVACY_HREF, PRIVACY_VERSION, SUPPORT_EMAIL } from "@/lib/privacy";
import PracticeTermsPage, * as pageModule from "./page";

afterEach(() => {
   vi.unstubAllEnvs();
   vi.clearAllMocks();
});

function renderPage() {
   vi.stubEnv("NEXT_PUBLIC_PRACTICE_ENABLED", "true");
   return render(<PracticeTermsPage />);
}

const squash = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
const sectionOf = (name: string) => screen.getByRole("heading", { level: 2, name }).parentElement as HTMLElement;

describe("Practice data terms page (P9-T17)", () => {
   it("is not found while the frontend practice flag is off", () => {
      expect(() => PracticeTermsPage()).toThrow("NEXT_NOT_FOUND");
   });

   it("is not indexed while it is a draft", () => {
      expect(pageModule.metadata.robots).toEqual({ index: false, follow: false });
   });

   it("is layered: a plain-language summary first, then the details", () => {
      renderPage();
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Practice data terms");
      expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
         "Summary",
         "What practice stores",
         "Why we store it",
         "Who can see it",
         "How long we keep it",
         "Exporting your data",
         "Deleting your data",
         "Backups and restoring them",
         "Withdrawing your acceptance",
         "Removing your account",
         "Logs and analytics",
         "What practice does not do yet",
         "Your practice data",
         "Changes to these terms",
      ]);
   });

   it("shows its own version, separate from the Privacy & AI Use version, and links that page", () => {
      renderPage();
      expect(screen.getByText(`Version ${PRACTICE_TERMS_VERSION}`)).toBeInTheDocument();
      expect(screen.queryByText(`Version ${PRIVACY_VERSION}`)).not.toBeInTheDocument();
      expect(within(screen.getByRole("main")).getAllByRole("link", { name: "Privacy & AI Use" })[0]).toHaveAttribute("href", PRIVACY_HREF);
      expect(document.body).toHaveTextContent("Accepting these terms does not change your consent on that page.");
   });

   it("states the retention rule in one plain sentence, with no timer and no cap (P9-AC-07.10, P9-OD-01, P9-OD-20)", () => {
      renderPage();
      const [first] = Array.from(sectionOf("How long we keep it").querySelectorAll("p")).map((p) => squash(p.textContent).split(". "));
      expect(first[0]).toBe("We keep your practice data until you delete it or your account is removed");
      expect(squash(sectionOf("How long we keep it").textContent)).toContain("Nothing deletes it on a timer, even if you stop signing in, and there is no limit on how many attempts you keep.");
   });

   it("lists the stored data classes of the inventory and says no files or audio are stored", () => {
      renderPage();
      const section = sectionOf("What practice stores");
      expect(within(section).getAllByRole("listitem").map((item) => squash(item.textContent))).toEqual([
         "the Problem, the level you chose and when you started, submitted or ended the attempt;",
         "your answer for each stage;",
         "your diagram: its parts, their labels and explanations, and where they sit on the canvas;",
         "a record of what you did in each stage, such as the hints and clarifications you opened and the assumptions you noted;",
         "snapshots of your answers and diagram taken when you submit, so your review compares against what you submitted;",
         "your self-review marks and notes.",
      ]);
      expect(squash(section.textContent)).toContain("Practice doesn't accept file uploads and doesn't record audio.");
      expect(squash(section.textContent)).toContain("a record of each version of these terms you accepted and when, and if you withdraw, when. That record holds none of your work.");
   });

   it("explains withdrawal: it blocks new attempts, deletes nothing, and is separate from deleting", () => {
      renderPage();
      const text = squash(sectionOf("Withdrawing your acceptance").textContent);
      expect(text).toContain("you can't start a new attempt until you accept again");
      expect(text).toContain("Withdrawing deletes nothing. Your saved attempts stay, and you can still open, edit, export and delete them while practice is available.");
      expect(text).toContain("Withdrawing is separate from deleting one attempt or all of your practice data");
   });

   it("explains export and deletion without claiming an exact copy, a backup expiry or immediate removal from copies", () => {
      renderPage();
      const exporting = squash(sectionOf("Exporting your data").textContent);
      expect(exporting).toContain("if that line is missing, the export did not finish");
      expect(exporting).toContain("export one attempt at a time");
      expect(exporting).not.toMatch(/identical|exact copy|byte/i);
      const deleting = squash(sectionOf("Deleting your data").textContent);
      expect(deleting).toContain("It keeps the record of which version of these terms you accepted, because deleting your data does not withdraw your acceptance.");
      expect(deleting).toContain("It removes the data from the live database at once. We keep no automatic backups of practice data. If we made our own copy of the database before you deleted, that copy still holds your data until it is removed, and we can't say when that will be.");
      expect(deleting).not.toMatch(/expire/);
      expect(deleting).toContain("This deletion log holds none of your work.");
   });

   it("keeps recovery, account-removal steps and analytics hosts pending instead of inventing facts", () => {
      renderPage();
      const notes = screen.getAllByRole("note").map((note) => squash(note.textContent));
      expect(notes).toHaveLength(3);
      expect(notes.every((note) => note.startsWith("Pending verification."))).toBe(true);
      const backups = squash(sectionOf("Backups and restoring them").textContent);
      expect(backups).toContain("We don't keep automatic backups of practice data, and our database host keeps none for us. If our database were lost, practice work stored in it could not be recovered unless we have a usable manual backup, so export anything you want to keep.");
      expect(backups).toContain("If we ever restored a copy made before you deleted something, that data could come back until it is deleted again.");
      expect(within(sectionOf("Backups and restoring them")).getByRole("note")).toHaveTextContent("Until then we make no promise about re-deleting data after a restore.");
      expect(within(sectionOf("Removing your account")).getByRole("note")).toBeInTheDocument();
      expect(within(sectionOf("Logs and analytics")).getByRole("note")).toBeInTheDocument();
   });

   it("makes no unverified region, retention period, zero-retention, guarantee or no-access promise", () => {
      const page = renderPage().container.textContent ?? "";
      expect(page).toContain("We don't claim that no one else can ever access it.");
      const text = page.replace("We don't claim that no one else can ever access it.", "");
      for (const claim of [
         /Ohio|Mumbai|region|United States|India/i,
         /\b\d+\s*(minutes?|hours?|days?|weeks?|months?|years?)\b/i,
         /zero (data )?retention/i,
         /guarantee/i,
         /no one (else )?(can|will)|never (be )?(accessed|seen|read)|only you can/i,
         /removed from (all )?backups (at once|immediately)|immediately (removed|deleted) from backups/i,
         /lawful basis|GDPR|compliant/i,
      ]) {
         expect(text).not.toMatch(claim);
      }
   });

   it("describes the supported account-removal path without an account deletion button", () => {
      renderPage();
      const text = squash(sectionOf("Removing your account").textContent);
      expect(text).toContain(`There is no account deletion button. To ask for your account to be removed, email ${SUPPORT_EMAIL}.`);
      expect(text).toContain("before removing your sign-in identity");
      expect(screen.queryByRole("button", { name: /delete (my )?account/i })).not.toBeInTheDocument();
   });

   it("states page-view analytics accurately and adds no practice analytics events", () => {
      renderPage();
      const text = squash(sectionOf("Logs and analytics").textContent);
      expect(text).toContain("Practice adds no analytics events of its own.");
      expect(text).toContain("Vercel Web Analytics and Speed Insights record page views and how fast pages load");
      expect(text).toContain("contains the attempt's random ID but none of its content");
   });

   it("does not say AI or voice practice is enabled", () => {
      renderPage();
      const text = squash(sectionOf("What practice does not do yet").textContent);
      expect(text).toContain("Self-guided practice gives no AI feedback and sends nothing to an AI provider.");
      expect(text).toContain("If we add AI-guided or voice practice, each will have its own terms and will ask you separately before it is used.");
      expect(document.body.textContent).not.toMatch(/Groq|OpenAI|microphone/);
   });

   it("renders the privacy-only access section and uses no em or en dashes", () => {
      const { container } = renderPage();
      expect(within(sectionOf("Your practice data")).getByText("practice data controls")).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/[–—]/);
   });
});
