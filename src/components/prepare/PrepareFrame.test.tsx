import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrepareFrame } from "./PrepareFrame";

describe("PrepareFrame", () => {
    it("is one main in Prepare's own scope, not the reader's, and links the three existing sections without prefetch", () => {
        const { container } = render(
            <PrepareFrame section="stories">
                <h1>Page</h1>
            </PrepareFrame>
        );
        expect(screen.getAllByRole("main")).toHaveLength(1);
        expect(container.querySelector("[data-prepare]")).not.toBeNull();
        expect(container.querySelector("[data-reader]")).toBeNull();
        const nav = screen.getByRole("navigation", { name: "Preparation sections" });
        const hrefs = within(nav).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]);
        expect(hrefs).toEqual([
            ["Your answers", "/prepare"],
            ["Story Bank", "/prepare/stories"],
            ["Your data", "/prepare/data"],
        ]);
        expect(screen.getByRole("heading", { level: 1, name: "Page" })).toBeInTheDocument();
    });

    it.each([
        ["answers", "Your answers"],
        ["stories", "Story Bank"],
        ["data", "Your data"],
    ] as const)("marks only %s as the current page", (section, label) => {
        render(
            <PrepareFrame section={section}>
                <p>body</p>
            </PrepareFrame>
        );
        const current = within(screen.getByRole("navigation", { name: "Preparation sections" })).getAllByRole("link", { current: "page" });
        expect(current.map((link) => link.textContent)).toEqual([label]);
    });
});
