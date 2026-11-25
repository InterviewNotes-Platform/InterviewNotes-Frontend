import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakePracticeApi } from "@/lib/practice-workspace/fakeApi";
import { installFakeAttempts } from "@/lib/practice-workspace/fakeAttempts";
import { PRACTICE_TERMS_HREF, PRACTICE_TERMS_VERSION } from "@/lib/practice-terms";

// P9-T15: the privacy access flag opens the terms page and its link alone; the frontend practice flag still closes the rest.
const mocks = vi.hoisted(() => ({
   notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
   }),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/practice-privacy/PracticeDataAccess", () => ({ PracticeDataAccess: () => <p>withdrawal control</p> }));
vi.mock("@/components/practice-workspace/PracticeDataPrivacyControls", () => ({
   PracticeDataPrivacyControls: () => <p>export and delete controls</p>,
}));

import PracticeAttemptsLayout from "@/app/practice/attempts/layout";
import PracticeHistoryLayout from "@/app/practice/history/layout";
import PrivacyPage from "@/app/privacy/page";
import { PracticeEntry } from "@/components/practice-workspace/PracticeEntry";
import PracticeTermsPage from "./page";

afterEach(() => {
   cleanup();
   vi.unstubAllEnvs();
   vi.clearAllMocks();
});

function setFlags(practice: string | undefined, privacy: string | undefined) {
   vi.stubEnv("NEXT_PUBLIC_PRACTICE_ENABLED", practice);
   vi.stubEnv("NEXT_PUBLIC_PRACTICE_PRIVACY_ACCESS", privacy);
}

function termsPageOpens() {
   try {
      render(<PracticeTermsPage />);
   } catch (error) {
      if ((error as Error).message === "NEXT_NOT_FOUND") return false;
      throw error;
   }
   return true;
}

const routeOpens = (Layout: typeof PracticeAttemptsLayout) => {
   try {
      Layout({ children: null });
      return true;
   } catch {
      return false;
   }
};

async function entryShown() {
   const api = createFakePracticeApi();
   installFakeAttempts(api, { consent: { requiredVersion: PRACTICE_TERMS_VERSION, accepted: false } });
   const token = api.signIn("ada");
   render(
      <PracticeEntry contentId="problem.llm-attribute-extraction-pipeline" apiUrl="https://api.example.test" seniorities={["senior"]} owner="ada" getAccessToken={async () => token} fetch={api.fetch} />,
   );
   const shown = await screen.findByRole("button", { name: "Practise this Problem" }).then(
      () => true,
      () => false,
   );
   return { shown, requests: api.requests.length };
}

describe.each([
   { name: "practice on", practice: "true", privacy: undefined, terms: true, practiceRoutes: true },
   { name: "practice on, privacy access on", practice: "true", privacy: "true", terms: true, practiceRoutes: true },
   { name: "practice off, privacy access on", practice: undefined, privacy: "true", terms: true, practiceRoutes: false },
   { name: "both flags off", practice: undefined, privacy: undefined, terms: false, practiceRoutes: false },
   { name: "privacy access set to a value other than exactly true", practice: "false", privacy: "TRUE", terms: false, practiceRoutes: false },
])("$name", ({ practice, privacy, terms, practiceRoutes }) => {
   it(terms ? "opens the practice data terms page with its data controls" : "keeps the practice data terms page not found", () => {
      setFlags(practice, privacy);
      expect(termsPageOpens()).toBe(terms);
      if (terms) {
         expect(screen.getByText("withdrawal control")).toBeInTheDocument();
         expect(screen.getByText("export and delete controls")).toBeInTheDocument();
      }
   });

   it(terms ? "links the terms from the Privacy page" : "shows no terms link on the Privacy page", () => {
      setFlags(practice, privacy);
      render(<PrivacyPage />);
      const link = screen.queryByRole("link", { name: "Practice data terms" });
      if (terms) expect(link).toHaveAttribute("href", PRACTICE_TERMS_HREF);
      else expect(link).not.toBeInTheDocument();
   });

   it(practiceRoutes ? "opens the attempt and history routes" : "keeps the attempt and history routes not found", () => {
      setFlags(practice, privacy);
      expect(routeOpens(PracticeAttemptsLayout)).toBe(practiceRoutes);
      expect(routeOpens(PracticeHistoryLayout)).toBe(practiceRoutes);
   });

   it(practiceRoutes ? "shows the practice entry" : "shows no practice entry and asks the API nothing", async () => {
      setFlags(practice, privacy);
      const { shown, requests } = await entryShown();
      expect(shown).toBe(practiceRoutes);
      if (!practiceRoutes) expect(requests).toBe(0);
   });
});
