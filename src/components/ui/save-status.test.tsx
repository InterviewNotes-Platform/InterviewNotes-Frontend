import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SaveStatus, type SaveState } from "./save-status";

const VISIBLE: [Exclude<SaveState, "idle">, string][] = [
   ["saving", "Saving…"],
   ["saved", "Saved"],
   ["unsaved", "Unsaved changes"],
   ["error", "Couldn't save"],
];

describe("SaveStatus", () => {
   it("is a polite, atomic live region", () => {
      render(<SaveStatus status="saved" />);
      const region = screen.getByRole("status");
      expect(region).toHaveAttribute("aria-live", "polite");
      expect(region).toHaveAttribute("aria-atomic", "true");
   });

   it("is on the page before it has anything to say, so the first announcement is not lost", () => {
      render(<SaveStatus status="idle" />);
      const region = screen.getByRole("status");
      expect(region).toBeInTheDocument();
      expect(region).toBeEmptyDOMElement();
      expect(region).toHaveAttribute("data-status", "idle");
   });

   it.each(VISIBLE)("%s says %s in words", (status, text) => {
      render(<SaveStatus status={status} />);
      expect(screen.getByRole("status")).toHaveTextContent(text);
      expect(screen.getByRole("status")).toHaveAttribute("data-status", status);
   });

   it("shows Saved only for the saved state", () => {
      for (const [status] of VISIBLE.filter(([s]) => s !== "saved")) {
         const { unmount } = render(<SaveStatus status={status} />);
         expect(screen.queryByText(/^Saved$/)).not.toBeInTheDocument();
         unmount();
      }
      render(<SaveStatus status="idle" />);
      expect(screen.queryByText(/Saved/)).not.toBeInTheDocument();
   });

   it("gives every state its own icon beside the words, hidden from assistive technology, so colour is never the only signal", () => {
      const shapes = new Set<string>();
      for (const [status] of VISIBLE) {
         const { unmount } = render(<SaveStatus status={status} />);
         const icon = screen.getByRole("status").querySelector("svg");
         expect(icon).toHaveAttribute("aria-hidden", "true");
         shapes.add(icon!.getAttribute("class")!.match(/lucide-[a-z-]+/)![0]);
         unmount();
      }
      expect(shapes.size).toBe(VISIBLE.length);
   });

   it("replaces the text of a state with a caller's message, and still has the icon", () => {
      render(<SaveStatus status="error" message="Couldn't save. Check your connection." />);
      const region = screen.getByRole("status");
      expect(region).toHaveTextContent("Couldn't save. Check your connection.");
      expect(region.querySelector("svg")).toBeInTheDocument();
   });

   it("changes the text of the one region when the state changes, rather than adding a second", () => {
      const { rerender } = render(<SaveStatus status="saving" />);
      const region = screen.getByRole("status");
      rerender(<SaveStatus status="saved" />);
      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(screen.getByRole("status")).toBe(region);
      expect(region).toHaveTextContent("Saved");
      expect(region).not.toHaveTextContent("Saving");
      rerender(<SaveStatus status="error" />);
      expect(region).toHaveTextContent("Couldn't save");
      expect(region).not.toHaveTextContent("Saved");
   });

   it("does not take focus or become a tab stop", () => {
      render(<SaveStatus status="saving" />);
      expect(screen.getByRole("status")).not.toHaveAttribute("tabindex");
   });

   it("lets a caller override the live-region politeness and add a className", () => {
      render(<SaveStatus status="unsaved" aria-live="off" className="ml-auto" />);
      const region = screen.getByRole("status");
      expect(region).toHaveAttribute("aria-live", "off");
      expect(region).toHaveClass("ml-auto", "text-sm");
   });
});
