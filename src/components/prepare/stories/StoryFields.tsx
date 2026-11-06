"use client";

import { useId } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { STAR_KEYS, hasStarText, starText, type StarKey } from "@/lib/prep/answerDraft";
import type { FieldIssue } from "@/lib/prep/types";
import { issueText } from "./notices";
import type { DraftProblems, StoryDraft } from "./storyDraft";
import { TagInput } from "./TagInput";

const STAR_COPY: Record<StarKey, { label: string; hint: string }> = {
   situation: { label: "Situation", hint: "The context: where and when, and what was at stake." },
   task: { label: "Task", hint: "Your responsibility: what you needed to achieve." },
   action: { label: "Action", hint: "What you did, in the first person." },
   result: { label: "Result", hint: "What happened, with numbers where you can." },
};

const CHOICE =
   "flex min-h-11 cursor-pointer items-center rounded-lg border border-border px-5 py-3 text-body transition-micro hover:border-primary " +
   "has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]";

interface Props {
   draft: StoryDraft;
   onChange: (patch: Partial<StoryDraft>) => void;
   /** What the form itself found wrong; shown once the reader has tried to save. */
   problems: DraftProblems;
   /** What the server refused, by field path. */
   issues: FieldIssue[];
   disabled?: boolean;
}

/** The story's fields, shared by create and edit. STAR and free-form notes are two views of one story: neither is ever discarded. */
export function StoryFields({ draft, onChange, problems, issues, disabled }: Props) {
   const ids = useId();
   const freeForm = draft.framework === "free_form";

   return (
      <fieldset disabled={disabled} className="min-w-0 space-y-6">
         <legend className="sr-only">Story</legend>
         <Field label="Title" required error={problems.title ?? issueText(issues, "title")}>
            <Input value={draft.title} maxLength={200} onChange={(event) => onChange({ title: event.target.value })} />
         </Field>
         <Field label="Year" description="Optional. When it happened." className="max-w-48" error={problems.year ?? issueText(issues, "year")}>
            <Input value={draft.year} inputMode="numeric" maxLength={4} onChange={(event) => onChange({ year: event.target.value })} />
         </Field>

         <fieldset className="space-y-2">
            <legend className="text-sm leading-snug font-medium">Writing format</legend>
            <div className="flex flex-wrap gap-3">
               {(
                  [
                     ["star", "STAR"],
                     ["free_form", "Free-form"],
                  ] as const
               ).map(([value, label]) => (
                  <label key={value} className={CHOICE}>
                     <input
                        type="radio"
                        name={`${ids}-format`}
                        value={value}
                        checked={(value === "free_form") === freeForm}
                        onChange={() => onChange({ framework: value })}
                        className="sr-only"
                     />
                     {label}
                  </label>
               ))}
            </div>
         </fieldset>

         {freeForm ? (
            <>
               <Field label="Notes" description="Write the story in your own words." error={issueText(issues, "notes")}>
                  <Textarea rows={12} value={draft.notes} onChange={(event) => onChange({ notes: event.target.value })} />
               </Field>
               {hasStarText(draft.fields) && (
                  <Field label="STAR notes" description="Kept with your story and shown here so nothing is hidden. Switch to STAR to edit them.">
                     <Textarea rows={8} readOnly value={starText(draft.fields)} />
                  </Field>
               )}
            </>
         ) : (
            <>
               {STAR_KEYS.map((key) => (
                  <Field key={key} label={STAR_COPY[key].label} description={STAR_COPY[key].hint} error={issueText(issues, `fields.${key}`)}>
                     <Textarea rows={4} value={draft.fields[key]} onChange={(event) => onChange({ fields: { ...draft.fields, [key]: event.target.value } })} />
                  </Field>
               ))}
               {draft.notes !== "" && (
                  <Field label="Free-form notes" description="Kept with your story and shown here so nothing is hidden. Switch to Free-form to edit them.">
                     <Textarea rows={6} readOnly value={draft.notes} />
                  </Field>
               )}
            </>
         )}

         <TagInput tags={draft.tags} onChange={(tags) => onChange({ tags })} error={issueText(issues, "tags")} disabled={disabled} />
      </fieldset>
   );
}
