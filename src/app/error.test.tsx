import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorBoundaryHandler } from "next/dist/client/components/error-boundary";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RouteError from "./error";

let broken = true;
function Page() {
   if (broken) throw new Error("secret internal detail");
   return <p>The page rendered.</p>;
}

// The real boundary supplies the real props, so this fails if Next changes what `error.tsx` receives.
function renderInBoundary(refresh: () => void) {
   const router = { refresh } as unknown as NonNullable<ComponentProps<typeof AppRouterContext.Provider>["value"]>;
   return render(
      <AppRouterContext.Provider value={router}>
         <ErrorBoundaryHandler pathname="/" errorComponent={RouteError}>
            <Page />
         </ErrorBoundaryHandler>
      </AppRouterContext.Provider>
   );
}

afterEach(() => {
   broken = true;
   vi.restoreAllMocks();
});

describe("the app-wide route error page inside Next's own error boundary", () => {
   it("announces the failure with no error detail and links to real destinations", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      renderInBoundary(vi.fn());
      expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong on our side");
      expect(document.body.textContent).not.toMatch(/secret internal detail/);
      expect(screen.getByRole("link", { name: "Go to the homepage" })).toHaveAttribute("href", "/");
      expect(screen.getByRole("link", { name: "Browse Tracks" })).toHaveAttribute("href", "/tracks");
   });

   it("Try again calls the framework's retry, which refreshes the route and brings the page back", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const refresh = vi.fn(() => {
         broken = false;
      });
      renderInBoundary(refresh);
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(screen.getByText("The page rendered.")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
   });
});
