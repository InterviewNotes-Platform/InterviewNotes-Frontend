"use client";

import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { addTags, TAG_MAX_COUNT } from "./storyDraft";

interface Props {
   tags: string[];
   onChange: (tags: string[]) => void;
   /** The server's reason, when it refused the tags. */
   error?: string;
   disabled?: boolean;
}

/** Tags as they will be stored: add one or several, remove any. Typed text is added when the field loses focus, never dropped. */
export function TagInput({ tags, onChange, error, disabled }: Props) {
   const [typed, setTyped] = useState("");
   const [problem, setProblem] = useState<string>();

   function commit() {
      if (typed.trim() === "") return setTyped("");
      const added = addTags(tags, typed);
      setProblem(added.error);
      if (added.error) return;
      onChange(added.tags);
      setTyped("");
   }

   function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commit();
   }

   return (
      <div className="space-y-2">
         <Field label="Tags" description={`Press Enter or use a comma to add a tag. Up to ${TAG_MAX_COUNT} tags, saved in lowercase.`} error={problem ?? error}>
            <Input
               value={typed}
               disabled={disabled}
               onChange={(event) => {
                  setTyped(event.target.value);
                  setProblem(undefined);
               }}
               onKeyDown={onKeyDown}
               onBlur={commit}
            />
         </Field>
         {tags.length > 0 && (
            <ul aria-label="Tags on this story" className="flex flex-wrap gap-2">
               {tags.map((tag) => (
                  <li key={tag} className="flex items-center gap-1 rounded-full border border-border py-0.5 pr-1 pl-3 text-supporting text-foreground">
                     {tag}
                     <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={`Remove tag ${tag}`} onClick={() => onChange(tags.filter((other) => other !== tag))}>
                        <X aria-hidden="true" />
                     </Button>
                  </li>
               ))}
            </ul>
         )}
      </div>
   );
}
