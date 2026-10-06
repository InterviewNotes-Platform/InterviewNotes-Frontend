import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Disclosure } from "./disclosure";

describe("Disclosure, controlled", () => {
   it("follows `open` and reports what the reader asked for without changing itself", () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(
         <Disclosure title="Contents" open={false} onOpenChange={onOpenChange}>
            <a href="#x">X</a>
         </Disclosure>
      );
      const button = screen.getByRole("button", { name: "Contents" });
      fireEvent.click(button);
      expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
      expect(button).toHaveAttribute("aria-expanded", "false");

      rerender(
         <Disclosure title="Contents" open onOpenChange={onOpenChange}>
            <a href="#x">X</a>
         </Disclosure>
      );
      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(document.getElementById(button.getAttribute("aria-controls")!)).not.toHaveAttribute("inert");
      fireEvent.click(button);
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
   });

   it("still keeps its own state, and tells a listener, when not controlled", () => {
      const onOpenChange = vi.fn();
      render(
         <Disclosure title="Own" onOpenChange={onOpenChange}>
            <a href="#x">X</a>
         </Disclosure>
      );
      const button = screen.getByRole("button", { name: "Own" });
      fireEvent.click(button);
      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(onOpenChange).toHaveBeenCalledWith(true);
   });

   it("has a quieter compact title that the default keeps for sections", () => {
      render(
         <>
            <Disclosure title="Section">x</Disclosure>
            <Disclosure title="Quiet" compact>
               x
            </Disclosure>
         </>
      );
      expect(screen.getByText("Section")).toHaveClass("text-subsection");
      expect(screen.getByText("Quiet")).toHaveClass("text-body", "font-semibold");
      expect(screen.getByText("Quiet")).not.toHaveClass("text-subsection");
   });
});
