import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import { createFakeConsentApi } from "./fakeConsent";
import { WithdrawConsent } from "./WithdrawConsent";

const supabase = vi.hoisted(() => ({ token: "user-1-token" as string | null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getSession: async () => ({ data: { session: supabase.token ? { access_token: supabase.token } : null } }) } }) }));

const API = "https://api.example.test";
let consent: ReturnType<typeof createFakeConsentApi>;
let token: string | null;

const routed: typeof fetch = async (input, init) => consent.handle(String(input), init) ?? new Response("{}", { status: 404 });
const mount = () => render(<WithdrawConsent apiUrl={API} getAccessToken={async () => token} fetch={routed} />);
const control = () => screen.queryByRole("button", { name: "Withdraw AI consent" });

beforeEach(() => {
   consent = createFakeConsentApi();
   token = "user-1-token";
   supabase.token = token;
});
afterEach(() => vi.unstubAllEnvs());

describe("Withdraw AI consent control", () => {
   it("draws nothing for a signed-out visitor, a user who never accepted, or an environment without an API", async () => {
      token = null;
      const out = mount();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(control()).toBeNull();
      out.unmount();

      token = "user-1-token";
      mount().unmount();
      render(<WithdrawConsent apiUrl={null} />);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(control()).toBeNull();
      expect(consent.requests.map(({ method }) => method)).toEqual(["GET"]);
   });

   it("draws nothing when the consent on record is not for the current version", async () => {
      consent.grant("user-1-token");
      consent.version = "2027-01-15";
      mount();
      await waitFor(() => expect(consent.requests).toHaveLength(1));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(control()).toBeNull();
   });

   it("shows for a signed-in user whose consent is recorded, and withdrawing is recorded through the API", async () => {
      consent.grant("user-1-token");
      mount();
      fireEvent.click(await screen.findByRole("button", { name: "Withdraw AI consent" }));

      const done = await screen.findByText("Your AI consent is withdrawn. The next AI action will ask again.");
      expect(consent.requests.map(({ method, path }) => `${method} ${path}`)).toEqual(["GET ", "POST /withdraw"]);
      expect(consent.status("user-1-token")).toMatchObject({ accepted: false, withdrawn_at: expect.any(String) });
      expect(control()).toBeNull();
      expect(document.activeElement).toBe(done);
   });

   it("sends one withdrawal for repeated clicks", async () => {
      consent.grant("user-1-token");
      mount();
      const withdraw = await screen.findByRole("button", { name: "Withdraw AI consent" });
      fireEvent.click(withdraw);
      fireEvent.click(withdraw);
      await screen.findByText(/Your AI consent is withdrawn/);
      expect(consent.requests.filter(({ path }) => path === "/withdraw")).toHaveLength(1);
   });

   it("keeps the control and says so when the withdrawal could not be recorded", async () => {
      consent.grant("user-1-token");
      mount();
      const withdraw = await screen.findByRole("button", { name: "Withdraw AI consent" });
      consent.failNext = "withdraw";
      fireEvent.click(withdraw);
      expect(await screen.findByRole("alert")).toHaveTextContent("Your consent is unchanged");
      expect(control()).not.toBeNull();
      expect(consent.status("user-1-token").accepted).toBe(true);

      fireEvent.click(control()!);
      await screen.findByText(/Your AI consent is withdrawn/);
   });

   it("is mounted once, in the page's Your controls section, and does not change the page's headings", async () => {
      vi.stubEnv("NEXT_PUBLIC_API_URL", API);
      consent.grant("user-1-token");
      vi.stubGlobal("fetch", routed);
      render(<PrivacyPage />);
      const withdraw = await screen.findByRole("button", { name: "Withdraw AI consent" });
      const section = withdraw.closest("section");
      expect(section?.querySelector("h2")).toHaveTextContent("Your controls");
      expect(screen.getAllByRole("button", { name: "Withdraw AI consent" })).toHaveLength(1);
      vi.unstubAllGlobals();
   });
});
