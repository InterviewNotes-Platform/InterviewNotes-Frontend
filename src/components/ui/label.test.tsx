import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Label } from "./label";

describe("Label", () => {
   it("is a native label, so it names the control it points at", () => {
      render(
         <>
            <Label htmlFor="q">Question</Label>
            <input id="q" />
         </>
      );
      expect(screen.getByText("Question").tagName).toBe("LABEL");
      expect(screen.getByRole("textbox", { name: "Question" })).toHaveAttribute("id", "q");
   });

   it("names a control it wraps, with no htmlFor", () => {
      render(
         <Label>
            Notes
            <textarea />
         </Label>
      );
      expect(screen.getByRole("textbox", { name: "Notes" })).toBeInTheDocument();
   });

   // jsdom forwards a label click to the control but does not move focus; focus is checked in a real browser.
   it("forwards a click on its text to the control it points at", () => {
      let clicks = 0;
      render(
         <>
            <Label htmlFor="q">Question</Label>
            <textarea id="q" onClick={() => clicks++} />
         </>
      );
      fireEvent.click(screen.getByText("Question"));
      expect(clicks).toBe(1);
   });

   it("is not a tab stop of its own, and keeps the caller's className and props", () => {
      render(
         <Label htmlFor="q" className="extra" data-testid="l">
            Question
         </Label>
      );
      const label = screen.getByTestId("l");
      expect(label).not.toHaveAttribute("tabindex");
      expect(label).toHaveClass("extra", "font-medium");
      expect(label).toHaveAttribute("data-slot", "label");
   });
});
