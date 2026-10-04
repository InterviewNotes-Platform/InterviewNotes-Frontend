import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageContainer, ReadingColumn } from "./PageContainer";

describe("PageContainer", () => {
   it("is a centred, page-width box with responsive gutters", () => {
      render(<PageContainer data-testid="box">content</PageContainer>);
      const box = screen.getByTestId("box");
      expect(box.tagName).toBe("DIV");
      expect(box).toHaveClass("mx-auto", "w-full", "max-w-page", "px-4", "md:px-6", "lg:px-8");
   });

   it("can be the page's main landmark and accepts caller classes and attributes", () => {
      render(<PageContainer as="main" className="py-12" aria-label="Lesson">content</PageContainer>);
      const main = screen.getByRole("main", { name: "Lesson" });
      expect(main).toHaveClass("max-w-page", "py-12");
   });

   it("lets a caller replace the width instead of stacking two", () => {
      render(<PageContainer className="max-w-reading" data-testid="box" />);
      const box = screen.getByTestId("box");
      expect(box).toHaveClass("max-w-reading");
      expect(box).not.toHaveClass("max-w-page");
   });
});

describe("ReadingColumn", () => {
   it("is a centred column at the reading measure", () => {
      render(<ReadingColumn data-testid="column">prose</ReadingColumn>);
      const column = screen.getByTestId("column");
      expect(column).toHaveClass("mx-auto", "w-full", "max-w-reading");
      expect(column).toHaveTextContent("prose");
   });

   it("nests inside a PageContainer without changing either width", () => {
      render(
         <PageContainer data-testid="page">
            <ReadingColumn data-testid="column" />
         </PageContainer>
      );
      expect(screen.getByTestId("page")).toHaveClass("max-w-page");
      expect(screen.getByTestId("column")).toHaveClass("max-w-reading");
   });
});
