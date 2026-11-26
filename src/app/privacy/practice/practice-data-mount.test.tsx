import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// T17-INT-1 (done in T15 v2 by agreement with T17): the terms page mounts the T15 controls next to T17's withdrawal control.
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/components/practice-privacy/PracticeDataAccess", () => ({ PracticeDataAccess: () => <p>withdrawal control</p> }));
vi.mock("@/components/practice-workspace/PracticeDataPrivacyControls", () => ({
   PracticeDataPrivacyControls: ({ apiUrl }: { apiUrl: string | null }) => <p data-api={apiUrl ?? ""}>export and delete controls</p>,
}));

import PracticeTermsPage from "./page";

afterEach(() => vi.unstubAllEnvs());

describe("the practice data terms page's data section", () => {
   it("holds the withdrawal control and the one export and delete implementation, bound to the public API", () => {
      vi.stubEnv("NEXT_PUBLIC_PRACTICE_ENABLED", "true");
      vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
      render(<PracticeTermsPage />);
      const section = screen.getByRole("heading", { level: 2, name: "Your practice data" }).parentElement as HTMLElement;
      expect(within(section).getByText("withdrawal control")).toBeInTheDocument();
      expect(within(section).getByText("export and delete controls")).toHaveAttribute("data-api", "https://api.example.test");
      expect(screen.getAllByText("export and delete controls")).toHaveLength(1);
   });
});
