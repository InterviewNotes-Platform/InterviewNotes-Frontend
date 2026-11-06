import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});

import { TrackCard } from "./TrackCard";

describe("TrackCard", () => {
   const card = (summary = "A summary.") =>
      render(<TrackCard track={{ id: "track.x", slug: "x", title: "X Track", summary }} href="/tracks/x" />);

   it("shows the title, the summary and an open cue, linking once to the Track", () => {
      card();
      expect(screen.getByRole("link", { name: "X Track" })).toHaveAttribute("href", "/tracks/x");
      expect(screen.getByRole("link")).toHaveAttribute("data-prefetch", "false");
      expect(screen.getAllByRole("link")).toHaveLength(1);
      expect(screen.getByText("A summary.")).toBeInTheDocument();
      expect(screen.getByText("Open Track")).toHaveAttribute("aria-hidden", "true");
   });

   it("omits a missing summary instead of inventing one", () => {
      card("");
      expect(document.querySelectorAll("p")).toHaveLength(0);
   });

   it("invents no counts, outcomes, ratings or hours, since the list response has none", () => {
      card();
      expect(document.body.textContent).not.toMatch(/\d/);
   });

   it("has no nested interactive element and no button", () => {
      card();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(document.querySelectorAll("a a, a button, button a")).toHaveLength(0);
   });

   it("shows focus on the card, not on a clipped title", () => {
      card();
      expect(screen.getByRole("link").className).toContain("outline-none");
      expect(document.querySelector("article")?.className).toContain("has-[a:focus-visible]:outline-2");
   });
});
