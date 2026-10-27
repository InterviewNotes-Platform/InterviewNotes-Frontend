import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Textarea } from "./textarea";

describe("Textarea", () => {
   it("is a native multi-line textbox that takes a name from aria-label", () => {
      render(<Textarea aria-label="Answer" rows={6} />);
      const box = screen.getByRole("textbox", { name: "Answer" });
      expect(box.tagName).toBe("TEXTAREA");
      expect(box).toHaveAttribute("rows", "6");
      expect(box).toHaveAttribute("data-slot", "textarea");
   });

   it("reports typed text to a controlled owner and shows the value it is given", () => {
      const onChange = vi.fn();
      const { rerender } = render(<Textarea aria-label="Answer" value="first" onChange={onChange} />);
      const box = screen.getByRole("textbox");
      expect(box).toHaveValue("first");
      fireEvent.change(box, { target: { value: "second" } });
      expect(onChange).toHaveBeenCalledTimes(1);
      rerender(<Textarea aria-label="Answer" value="second" onChange={onChange} />);
      expect(box).toHaveValue("second");
   });

   it("takes part in a form like any textarea", () => {
      render(
         <form data-testid="f">
            <Textarea aria-label="Answer" name="answer" defaultValue="kept" />
         </form>
      );
      expect(new FormData(screen.getByTestId("f") as HTMLFormElement).get("answer")).toBe("kept");
   });

   it("when disabled, cannot be focused or typed in, and is left out of the form data", () => {
      render(
         <form data-testid="f">
            <Textarea aria-label="Answer" name="answer" defaultValue="x" disabled />
         </form>
      );
      const box = screen.getByRole("textbox");
      expect(box).toBeDisabled();
      box.focus();
      expect(box).not.toHaveFocus();
      expect(new FormData(screen.getByTestId("f") as HTMLFormElement).has("answer")).toBe(false);
   });

   it("when read-only, can still be focused and read, and is still submitted", () => {
      render(
         <form data-testid="f">
            <Textarea aria-label="Answer" name="answer" defaultValue="locked" readOnly />
         </form>
      );
      const box = screen.getByRole("textbox");
      expect(box).toHaveAttribute("readonly");
      expect(box).not.toBeDisabled();
      box.focus();
      expect(box).toHaveFocus();
      expect(new FormData(screen.getByTestId("f") as HTMLFormElement).get("answer")).toBe("locked");
   });

   it("passes aria-invalid and a ref through, and lets a caller className win over its own height", () => {
      const ref = createRef<HTMLTextAreaElement>();
      render(<Textarea ref={ref} aria-label="Answer" aria-invalid className="min-h-40" />);
      const box = screen.getByRole("textbox");
      expect(box).toBeInvalid();
      expect(ref.current).toBe(box);
      expect(box).toHaveClass("min-h-40");
      expect(box).not.toHaveClass("min-h-24");
   });
});
