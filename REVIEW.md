# Review guidelines

Frontend reviews apply the permanent design policy in `AGENTS.md` (canonical source:
`specs/agent-tooling/frontend-design-policy.md`).

## Visual changes

- Inspect the rendered UI, not only the diff: 390, 768 and 1440 px, light and dark where applicable.
- Require evidence in the PR: the Refero references used and what was adapted, and Playwright
  screenshots per viewport and theme. Flag a visual PR that lacks either.
- Flag any claim of Refero use where the MCP was unavailable.
- Check that patterns were adapted to InterviewNotes typography, spacing, colours and existing
  components, not copied from a reference.
- Flag unnecessary gradients, extra cards, decorative elements, inconsistent spacing, oversized
  headings and unnecessary animation.
- Check keyboard navigation, focus visibility, accessible names and contrast; loading, empty, error
  and success states where the change touches them.

## Non-visual changes

- Flag unrelated UI modifications in API, state or logic-only PRs.
