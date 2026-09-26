import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TableOfContents } from "./TableOfContents";

const headings = [
  { id: "intro", text: "Intro", level: 2 },
  { id: "detail", text: "Detail", level: 3 },
];

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

describe("TableOfContents", () => {
  it("renders nothing when there are no headings", () => {
    const { container } = render(<TableOfContents headings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("links each heading and scrolls to it when clicked", () => {
    const target = document.createElement("h2");
    target.id = "detail";
    target.scrollIntoView = vi.fn();
    document.body.append(target);

    render(<TableOfContents headings={headings} />);
    const link = screen.getByRole("link", { name: "Detail" });
    expect(link).toHaveAttribute("href", "#detail");

    fireEvent.click(link);

    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(link).toHaveClass("text-primary");
    target.remove();
  });
});
