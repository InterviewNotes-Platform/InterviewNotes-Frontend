import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyCode } from "./CopyCode";

const writeText = vi.fn();
beforeEach(() => {
   writeText.mockReset().mockResolvedValue(undefined);
   Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(() => {
   vi.useRealTimers();
   vi.restoreAllMocks();
});

const press = (name = /^Copy/) => act(async () => fireEvent.click(screen.getByRole("button", { name })));

describe("CopyCode", () => {
   it("is one always-visible button named for its language, or plain Copy code", () => {
      const { rerender } = render(<CopyCode source="x" label="Python" />);
      expect(screen.getAllByRole("button")).toHaveLength(1);
      expect(screen.getByRole("button", { name: "Copy Python code" })).toHaveTextContent("Copy");
      rerender(<CopyCode source="x" label={null} />);
      expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument();
   });

   it("copies exactly the source it was given, newlines and all", async () => {
      const source = "def f():\n\n    return 1\n  \n";
      render(<CopyCode source={source} label="Python" />);
      await press();
      expect(writeText).toHaveBeenCalledExactlyOnceWith(source);
   });

   it("shows Copied and announces it politely, keeping the button's name", async () => {
      vi.useFakeTimers();
      render(<CopyCode source="x" label="Python" />);
      expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
      expect(screen.getByRole("status")).toBeEmptyDOMElement();

      await press();
      expect(screen.getByRole("button", { name: "Copy Python code" })).toHaveTextContent("Copied");
      expect(screen.getByRole("status")).toHaveTextContent("Copied");

      await act(async () => vi.advanceTimersByTime(2000));
      expect(screen.getByRole("button", { name: "Copy Python code" })).toHaveTextContent(/^Copy$/);
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
   });

   it("announces a failure, and leaves the button as Copy, when the clipboard rejects", async () => {
      writeText.mockRejectedValue(new Error("denied"));
      render(<CopyCode source="x" label={null} />);
      await press();
      expect(screen.getByRole("status")).toHaveTextContent("Copy failed — select the code to copy it");
      expect(screen.getByRole("button")).toHaveTextContent(/^Copy$/);
   });

   it("announces a failure when there is no Clipboard API", async () => {
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
      render(<CopyCode source="x" label={null} />);
      await press();
      expect(screen.getByRole("status")).toHaveTextContent("Copy failed — select the code to copy it");
   });

   it("announces each press afresh, and persists nothing", async () => {
      const store = vi.spyOn(Storage.prototype, "setItem");
      render(<CopyCode source="x" label={null} />);
      await press();
      await press();
      expect(writeText).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("status")).toHaveTextContent("Copied");
      expect(store).not.toHaveBeenCalled();
      expect(document.cookie).toBe("");
   });
});
