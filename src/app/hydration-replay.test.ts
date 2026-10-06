import { createRequire } from "node:module";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

// The App Router never runs the `react` in package.json: Next aliases it to the build compiled into Next.
const load = createRequire(import.meta.url);
const React = load("next/dist/compiled/react") as typeof import("react");
const { hydrateRoot } = load("next/dist/compiled/react-dom/client") as typeof import("react-dom/client");

describe("the React build the App Router serves", () => {
   // react/react#37584, fixed by react/react#35494: replaying a host element whose lazy child (how Flight streams
   // large RSC payloads) resolved between render slices compared it with its own first child, failing with #418.
   it("hydrates a host element whose lazy child resumes between render slices", async () => {
      const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
      const wasActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = false; // the real scheduler must yield, so microtasks run between slices

      const lazyText = React.lazy(() => Promise.resolve({ default: "value" }) as never) as unknown as ReactNode;
      let committed!: () => void;
      const commit = new Promise<void>((done) => (committed = done));
      function Committed({ children }: { children: ReactNode }) {
         React.useEffect(committed, []);
         return children;
      }

      const container = document.createElement("div");
      container.innerHTML = "<label>value</label>";
      const serverLabel = container.firstChild;
      const errors: unknown[] = [];

      React.startTransition(() => {
         hydrateRoot(container, React.createElement(Committed, null, React.createElement("label", null, lazyText)), {
            onRecoverableError: (error) => errors.push(error),
         });
      });
      await commit;
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = wasActEnvironment;

      expect(errors).toEqual([]);
      expect(container.innerHTML).toBe("<label>value</label>");
      expect(container.firstChild, "the server-rendered node was hydrated, not replaced").toBe(serverLabel);
   });
});
