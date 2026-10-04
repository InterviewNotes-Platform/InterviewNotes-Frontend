import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("lets later Tailwind classes override conflicting earlier ones", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("keeps a P2 type-scale size beside a text colour, and still resolves size conflicts", () => {
    expect(cn("text-body font-medium", "text-primary")).toBe("text-body font-medium text-primary");
    expect(cn("text-title", "text-section")).toBe("text-section");
    expect(cn("max-w-page", "max-w-reading")).toBe("max-w-reading");
  });

  it("drops falsy conditional classes", () => {
    expect(cn("a", false && "b", undefined, { c: true, d: false })).toBe("a c");
  });
});
