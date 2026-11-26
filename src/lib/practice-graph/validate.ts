/**
 * The client copy of T10's graph and layout rules (`graph-editor-contract.md` §3.5, §4 and §6.1), using the backend's reason names.
 * It runs before every save so a known-invalid graph is never sent; the server stays the authority and validates again. Messages
 * name the element by its role and never quote learner text back into an error.
 */

import { GRAPH } from "@/lib/practice-workspace/contract";
import { isElementId } from "./ids";
import { layoutBytes, wireLayout } from "./canonical";
import type { DiagramDraft } from "./model";
import { codePoints, storedText, textRule, type TextRule } from "./text";
import { BOUNDARY_TYPES, EDGE_KINDS, LAYOUT_MAX_BYTES, LIMITS, SUBTYPES, isLegalSubtype } from "./vocabulary";

export type IssueRule =
   | TextRule
   | "malformed_id"
   | "duplicate_id"
   | "dangling_edge"
   | "self_loop"
   | "unknown_type"
   | "subtype_mismatch"
   | "unknown_kind"
   | "unknown_boundary_type"
   | "unknown_boundary"
   | "label_too_long"
   | "tag_too_long"
   | "explanation_too_long"
   | "too_many_nodes"
   | "too_many_edges"
   | "too_many_boundaries"
   | "explanations_total_too_large"
   | "layout_too_large";

export type IssueField = "label" | "tag" | "explanation";

export interface Issue {
   rule: IssueRule;
   elementId?: string;
   field?: IssueField;
}

export function validateDraft(draft: DiagramDraft): Issue[] {
   const issues: Issue[] = [];
   const { nodes, edges, boundaries } = draft.graph;
   if (nodes.length > LIMITS.max_nodes) issues.push({ rule: "too_many_nodes" });
   if (edges.length > LIMITS.max_edges) issues.push({ rule: "too_many_edges" });
   if (boundaries.length > LIMITS.max_boundaries) issues.push({ rule: "too_many_boundaries" });

   const seen = new Set<string>();
   const id = (value: string, prefix: "n" | "e" | "b") => {
      if (!isElementId(value, prefix)) issues.push({ rule: "malformed_id" });
      else if (seen.has(value)) issues.push({ rule: "duplicate_id", elementId: value });
      seen.add(value);
   };
   let total = 0;
   const text = (value: string, limit: number, tooLong: IssueRule, elementId: string, field: IssueField, newline = false) => {
      const rule = textRule(value, newline);
      if (rule) return issues.push({ rule, elementId, field });
      const length = codePoints(storedText(value));
      if (field === "explanation") total += length;
      if (length > limit) issues.push({ rule: tooLong, elementId, field });
   };

   for (const b of boundaries) {
      id(b.id, "b");
      if (!(BOUNDARY_TYPES as readonly string[]).includes(b.type)) issues.push({ rule: "unknown_boundary_type", elementId: b.id });
      text(b.label, LIMITS.max_label, "label_too_long", b.id, "label");
   }
   const boundaryIds = new Set(boundaries.map((b) => b.id));
   for (const n of nodes) {
      id(n.id, "n");
      if (!Object.hasOwn(SUBTYPES, n.type)) issues.push({ rule: "unknown_type", elementId: n.id });
      else if (!isLegalSubtype(n.type, n.subtype)) issues.push({ rule: "subtype_mismatch", elementId: n.id });
      text(n.label, LIMITS.max_label, "label_too_long", n.id, "label");
      text(n.explanation, LIMITS.max_explanation, "explanation_too_long", n.id, "explanation", true);
      if (n.boundary !== null && !boundaryIds.has(n.boundary)) issues.push({ rule: "unknown_boundary", elementId: n.id });
   }
   const nodeIds = new Set(nodes.map((n) => n.id));
   for (const e of edges) {
      id(e.id, "e");
      if (e.from === e.to) issues.push({ rule: "self_loop", elementId: e.id });
      else if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) issues.push({ rule: "dangling_edge", elementId: e.id });
      if (!(EDGE_KINDS as readonly string[]).includes(e.kind)) issues.push({ rule: "unknown_kind", elementId: e.id });
      text(e.tag, LIMITS.max_tag, "tag_too_long", e.id, "tag");
      text(e.explanation, LIMITS.max_explanation, "explanation_too_long", e.id, "explanation", true);
   }
   if (total > LIMITS.max_total_explanation) issues.push({ rule: "explanations_total_too_large" });
   if (layoutBytes(wireLayout(draft)) > LAYOUT_MAX_BYTES) issues.push({ rule: "layout_too_large" });
   return issues;
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const FIELD_WORD: Record<IssueField, string> = { label: "name", tag: "tag", explanation: "explanation" };

/** One sentence a learner can act on. `name` describes the element (for example "the component API gateway"). */
export function issueMessage(issue: Issue, name: string): string {
   const field = issue.field ? FIELD_WORD[issue.field] : "text";
   switch (issue.rule) {
      case "invalid_unicode":
      case "control_character":
      case "bidi_control":
      case "noncharacter":
         return `The ${field} of ${name} contains characters that cannot be saved. Retype that part.`;
      case "unbroken_run":
         return `The ${field} of ${name} has a run of more than ${GRAPH.limits.max_unbroken_run} characters without a space. Add a space or shorten it.`;
      case "label_too_long":
         return `The name of ${name} is longer than ${LIMITS.max_label} characters.`;
      case "tag_too_long":
         return `The tag of ${name} is longer than ${LIMITS.max_tag} characters.`;
      case "explanation_too_long":
         return `The explanation of ${name} is longer than ${LIMITS.max_explanation} characters.`;
      case "explanations_total_too_large":
         return `All explanations together are longer than ${LIMITS.max_total_explanation.toLocaleString("en-US")} characters. Shorten some of them.`;
      case "too_many_nodes":
         return `A diagram holds at most ${LIMITS.max_nodes} components.`;
      case "too_many_edges":
         return `A diagram holds at most ${LIMITS.max_edges} connections.`;
      case "too_many_boundaries":
         return `A diagram holds at most ${LIMITS.max_boundaries} boundaries.`;
      case "layout_too_large":
         return "The diagram's layout is too large to save. Remove some bend points.";
      case "dangling_edge":
         return `${cap(name)} has an end that is not on the diagram. Restore that component or remove the connection.`;
      case "self_loop":
         return `${cap(name)} connects a component to itself.`;
      default:
         return `${cap(name)} cannot be saved as it is.`;
   }
}
