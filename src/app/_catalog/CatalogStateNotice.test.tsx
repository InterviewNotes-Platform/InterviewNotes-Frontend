import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogStateNotice } from "./CatalogStateNotice";

afterEach(() => vi.unstubAllEnvs());

describe("CatalogStateNotice, locked Premium content (P8-PREM-05)", () => {
   it("signed out, purchase off: says it is Premium, offers sign-in and states purchase is unavailable", () => {
      render(<CatalogStateNotice state="unauthenticated" signInPath="/lessons/x" />);
      const notice = screen.getByRole("status");
      expect(notice).toHaveTextContent("Sign in to read this content.");
      expect(notice).toHaveTextContent("This is Premium content.");
      expect(notice).toHaveTextContent("Paid access is not available yet.");
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?redirect=%2Flessons%2Fx");
      expect(screen.queryByRole("link", { name: /plans/i })).not.toBeInTheDocument();
   });

   it("signed in without Premium, purchase off: keeps the existing sentence, says Premium, no link", () => {
      render(<CatalogStateNotice state="unentitled" />);
      const notice = screen.getByRole("status");
      expect(notice).toHaveTextContent("Paid access is not available yet.");
      expect(notice).toHaveTextContent("This is Premium content.");
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
   });

   it("purchase on: links to /pricing and never states unavailability", () => {
      vi.stubEnv("NEXT_PUBLIC_PURCHASE_ENABLED", "true");
      const { rerender } = render(<CatalogStateNotice state="unentitled" />);
      expect(screen.getByRole("status")).toHaveTextContent("Your account does not include Premium.");
      expect(screen.getByRole("link", { name: "See Premium plans and prices" })).toHaveAttribute("href", "/pricing");
      expect(screen.getByRole("status")).not.toHaveTextContent("not available");
      rerender(<CatalogStateNotice state="unauthenticated" />);
      expect(screen.getByRole("link", { name: "See Premium plans and prices" })).toHaveAttribute("href", "/pricing");
      expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
   });

   it("says nothing about Premium for a retired or unavailable item", () => {
      for (const state of ["retired", "unavailable"] as const) {
         const { unmount } = render(<CatalogStateNotice state={state} />);
         expect(screen.getByRole("status")).not.toHaveTextContent("Premium");
         expect(screen.queryByRole("link")).not.toBeInTheDocument();
         unmount();
      }
   });
});
