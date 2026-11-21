import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VercelInsights } from "./VercelInsights";

vi.mock("@vercel/analytics/next", () => ({ Analytics: () => <i data-testid="analytics" /> }));
vi.mock("@vercel/speed-insights/next", () => ({ SpeedInsights: () => <i data-testid="speed-insights" /> }));

afterEach(() => vi.unstubAllEnvs());

describe("VercelInsights", () => {
   it("renders nothing outside a Vercel build, so no host is asked for /_vercel scripts it does not serve", () => {
      vi.stubEnv("VERCEL", "");
      const { container } = render(<VercelInsights />);
      expect(container).toBeEmptyDOMElement();
   });

   it("renders Web Analytics and Speed Insights in a Vercel build", () => {
      vi.stubEnv("VERCEL", "1");
      const { getByTestId } = render(<VercelInsights />);
      expect(getByTestId("analytics")).toBeInTheDocument();
      expect(getByTestId("speed-insights")).toBeInTheDocument();
   });
});
