import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("lets later Tailwind classes override conflicting earlier ones", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("drops falsy conditional classes", () => {
    expect(cn("a", false && "b", undefined, { c: true, d: false })).toBe("a c");
  });
});
