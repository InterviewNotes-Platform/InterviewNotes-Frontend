import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "./not-found";

describe("the app-wide not-found page", () => {
   it("has one h1 and recovery links to the homepage and the Tracks", () => {
      render(<NotFound />);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("link", { name: "Go to the homepage" })).toHaveAttribute("href", "/");
      expect(screen.getByRole("link", { name: "Browse Tracks" })).toHaveAttribute("href", "/tracks");
   });
});
