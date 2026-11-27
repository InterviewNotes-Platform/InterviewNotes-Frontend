<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Frontend design policy (permanent, owner-approved 2026-11-27)

Canonical source: `specs/agent-tooling/frontend-design-policy.md`. Summary:

- **Refero MCP first.** Before any visual decision (pages, components, visual fixes, navigation,
  forms, dialogs, React Flow practice UI, responsive layouts, loading/empty/error/success states,
  auth, onboarding, subscription), research real product interfaces with Refero MCP. Pick references
  that solve the UX problem, then adapt them to the existing InterviewNotes typography, spacing,
  colours and components. Never copy a reference wholesale.
  Refero runs in Devin cloud sessions via the organization's `refero` MCP plugin (no local key).
- **Reuse existing components** (`src/components/ui`, the shared shell) wherever possible.
- **Validate the rendered UI with Playwright MCP** at 390, 768 and 1440 px, light and dark, including
  keyboard navigation and accessibility. Fix findings before calling the task done.
- **Quality bar:** premium technical education platform, not a generic SaaS template. No unnecessary
  gradients, extra cards, decoration, inconsistent spacing, oversized headings or animation.
- **Non-visual changes** (API, state, logic-only fixes): brief Refero check, no unrelated UI edits.
- **Evidence for visual changes** in the PR: Refero references used (screen/flow IDs or URLs) and what
  was adapted; Playwright screenshots per viewport and theme; a11y and keyboard findings.
- **Never claim Refero was used if the MCP was unavailable.** Report the blocker instead.
