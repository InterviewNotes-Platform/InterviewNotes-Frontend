import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "./field";
import { Input } from "./input";
import { Textarea } from "./textarea";

describe("Field", () => {
   it("names its control with the label, through a real htmlFor and id pair", () => {
      render(
         <Field label="Your answer">
            <Textarea />
         </Field>
      );
      const box = screen.getByRole("textbox", { name: "Your answer" });
      const label = screen.getByText("Your answer");
      expect(label).toHaveAttribute("for", box.id);
      expect(box.id).not.toBe("");
   });

   // jsdom forwards a label click to the control but does not move focus; focus is checked in a real browser.
   it("forwards a click on the label to the control", () => {
      let clicks = 0;
      render(
         <Field label="Your answer">
            <Textarea onClick={() => clicks++} />
         </Field>
      );
      fireEvent.click(screen.getByText("Your answer"));
      expect(clicks).toBe(1);
   });

   it("describes the control with its description, and keeps the name free of it", () => {
      render(
         <Field label="Your answer" description="Plain text. Aim for two minutes aloud.">
            <Textarea />
         </Field>
      );
      const box = screen.getByRole("textbox", { name: "Your answer" });
      expect(box).toHaveAccessibleDescription("Plain text. Aim for two minutes aloud.");
      expect(box).not.toHaveAttribute("aria-invalid");
   });

   it("with an error: marks the control invalid and describes it by the message, after the description", () => {
      render(
         <Field label="Your answer" description="Plain text." error="Write at least one sentence.">
            <Textarea />
         </Field>
      );
      const box = screen.getByRole("textbox", { name: "Your answer" });
      expect(box).toBeInvalid();
      expect(box).toHaveAccessibleDescription("Plain text. Write at least one sentence.");
      const ids = box.getAttribute("aria-describedby")!.split(" ");
      expect(ids).toHaveLength(2);
      for (const id of ids) expect(document.getElementById(id)).toBeInTheDocument();
   });

   it("says what is wrong in words, not only in colour: the message is text beside an icon the reader skips", () => {
      render(
         <Field label="Your answer" error="Write at least one sentence.">
            <Textarea />
         </Field>
      );
      const error = screen.getByText("Write at least one sentence.");
      expect(error.closest("[data-slot=field-error]")?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(screen.getByRole("textbox")).toHaveAccessibleDescription("Write at least one sentence.");
   });

   it("references no id that is not on the page when it has neither description nor error", () => {
      render(
         <Field label="Your answer">
            <Textarea />
         </Field>
      );
      expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-describedby");
   });

   it("drops the error link and the invalid state once the error clears", () => {
      const { rerender } = render(
         <Field label="Your answer" description="Plain text." error="Too short.">
            <Textarea />
         </Field>
      );
      rerender(
         <Field label="Your answer" description="Plain text.">
            <Textarea />
         </Field>
      );
      const box = screen.getByRole("textbox");
      expect(box).not.toHaveAttribute("aria-invalid");
      expect(box).toHaveAccessibleDescription("Plain text.");
      expect(screen.queryByText("Too short.")).not.toBeInTheDocument();
   });

   it("treats an empty error or description as absent", () => {
      render(
         <Field label="Your answer" description="" error={null}>
            <Textarea />
         </Field>
      );
      expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-describedby");
      expect(document.querySelector("[data-slot=field-error]")).toBeNull();
      expect(document.querySelector("[data-slot=field-description]")).toBeNull();
   });

   it("when required: sets aria-required and shows an asterisk that is not part of the name", () => {
      render(
         <Field label="Question" required>
            <Input />
         </Field>
      );
      const input = screen.getByRole("textbox", { name: "Question" });
      expect(input).toHaveAttribute("aria-required", "true");
      expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
   });

   it("gives each field its own ids, so two on a page never share a label or description", () => {
      render(
         <>
            <Field label="First" description="One.">
               <Textarea />
            </Field>
            <Field label="Second" description="Two.">
               <Textarea />
            </Field>
         </>
      );
      const first = screen.getByRole("textbox", { name: "First" });
      const second = screen.getByRole("textbox", { name: "Second" });
      expect(first.id).not.toBe(second.id);
      expect(first).toHaveAccessibleDescription("One.");
      expect(second).toHaveAccessibleDescription("Two.");
   });

   it("uses a caller's controlId, and keeps its own className and props on the wrapper", () => {
      render(
         <Field label="Question" controlId="custom" className="extra" data-testid="wrap" description="d">
            <Input />
         </Field>
      );
      const input = screen.getByRole("textbox");
      expect(input).toHaveAttribute("id", "custom");
      expect(input.getAttribute("aria-describedby")).toBe("custom-description");
      expect(screen.getByTestId("wrap")).toHaveClass("extra", "grid");
   });

   it("leaves the control's own props, such as rows and a ref-bearing textarea, intact", () => {
      render(
         <Field label="Your answer">
            <Textarea rows={8} placeholder="Start here" />
         </Field>
      );
      const box = screen.getByRole("textbox");
      expect(box).toHaveAttribute("rows", "8");
      expect(box).toHaveAttribute("placeholder", "Start here");
      expect(box).toHaveAttribute("data-slot", "textarea");
   });
});
