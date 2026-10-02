import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => null }));

import { CatalogBody } from "./CatalogBody";

const PROD = "https://interviewnotes.io/lessons/foo";
const BETA = "https://dev.interviewnotes.io/problems/bar#step";
const OTHER = "https://example.com/lessons/foo";
const TEXT = `[prod](${PROD}) [beta](${BETA}) [other](${OTHER}) [ref](ref:lesson.baz) [anchor](#top)`;

function links(stayOnDeployment?: boolean) {
   render(<CatalogBody body={{ format: "markdown@1", text: TEXT }} stayOnDeployment={stayOnDeployment} />);
   return Object.fromEntries(screen.getAllByRole("link").map((link) => [link.textContent, link]));
}

describe("a preview's authored links", () => {
   it("keep first-party links on this deployment, in the same tab", () => {
      const { prod, beta } = links(true);
      expect(prod).toHaveAttribute("href", "/lessons/foo");
      expect(beta).toHaveAttribute("href", "/problems/bar#step");
      for (const link of [prod, beta]) {
         expect(link).not.toHaveAttribute("target");
         expect(link.getAttribute("href")).toMatch(/^\/(?!\/)/);
      }
   });

   it("leave other hosts external, and ref and anchor links as they were", () => {
      const { other, ref, anchor } = links(true);
      expect(other).toHaveAttribute("href", OTHER);
      expect(other).toHaveAttribute("target", "_blank");
      expect(other).toHaveAttribute("rel", "noopener noreferrer");
      expect(ref).toHaveAttribute("href", "/lessons/baz");
      expect(anchor).toHaveAttribute("href", "#top");
   });

   it("leave no link to another InterviewNotes deployment in the output", () => {
      const { container } = render(<CatalogBody body={{ format: "markdown@1", text: TEXT }} stayOnDeployment />);
      expect(container.innerHTML).not.toMatch(/href="https:\/\/(?:[\w-]+\.)*interviewnotes\.io/i);
   });
});

describe("production's authored links", () => {
   it.each([undefined, false])("are exactly as authored (flag %s)", (flag) => {
      const { prod, beta, other } = links(flag);
      expect(prod).toHaveAttribute("href", PROD);
      expect(beta).toHaveAttribute("href", BETA);
      for (const link of [prod, beta, other]) {
         expect(link).toHaveAttribute("target", "_blank");
         expect(link).toHaveAttribute("rel", "noopener noreferrer");
      }
   });
});
