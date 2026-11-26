"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChallengeOut } from "@/lib/practice-workspace/types";
import { PromptBlocks } from "./PromptBlocks";

/** The Problem brief, reachable from every stage (P9-R-PRC-17). It holds the givens only: the prompt the server released for this attempt. */
export function BriefDialog({ challenge }: { challenge: ChallengeOut | null }) {
   return (
      <Dialog.Root>
         <Dialog.Trigger asChild>
            <Button type="button" variant="outline" className="min-h-11 gap-2">
               <FileText aria-hidden="true" className="size-4" />
               Brief
            </Button>
         </Dialog.Trigger>
         <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
            <Dialog.Content className="bg-background fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto rounded-lg border p-6 shadow-lg">
               <Dialog.Title className="m-0 font-[family-name:Iowan_Old_Style,Palatino_Linotype,Palatino,Book_Antiqua,Georgia,serif] text-subsection text-foreground">{challenge?.title ?? "The Problem"}</Dialog.Title>
               <Dialog.Description className="sr-only">The Problem you are practising, as it was given to you.</Dialog.Description>
               {challenge ? (
                  <PromptBlocks blocks={challenge.prompt} />
               ) : (
                  <p className="m-0 text-body text-muted-foreground">The Problem text is not available right now. Everything you wrote is still saved.</p>
               )}
               <div className="flex justify-end">
                  <Dialog.Close asChild>
                     <Button type="button" className="min-h-11">Back to the workspace</Button>
                  </Dialog.Close>
               </div>
            </Dialog.Content>
         </Dialog.Portal>
      </Dialog.Root>
   );
}
