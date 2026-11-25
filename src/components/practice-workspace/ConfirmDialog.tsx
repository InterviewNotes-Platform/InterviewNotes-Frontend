"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   title: string;
   children: ReactNode;
   confirm: string;
   cancel: string;
   onConfirm: () => void;
   /** The action is in progress: both buttons are disabled and the dialog cannot be dismissed. */
   busy?: boolean;
   destructive?: boolean;
}

/**
 * An explicit confirmation (reveal, abandon, submit, delete). Radix traps focus while it is open and returns it to the
 * control that opened it; Escape and the cancel button close it, except while the action is running.
 */
export function ConfirmDialog({ open, onOpenChange, title, children, confirm, cancel, onConfirm, busy = false, destructive = false }: Props) {
   return (
      <Dialog.Root open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
         <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
            <Dialog.Content
               role="alertdialog"
               onEscapeKeyDown={(event) => busy && event.preventDefault()}
               onPointerDownOutside={(event) => event.preventDefault()}
               className="bg-background fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto rounded-lg border p-6 shadow-lg"
            >
               <Dialog.Title className="m-0 font-[family-name:Iowan_Old_Style,Palatino_Linotype,Palatino,Book_Antiqua,Georgia,serif] text-subsection text-foreground">{title}</Dialog.Title>
               <Dialog.Description asChild>
                  <div className="grid gap-2 text-body text-muted-foreground">{children}</div>
               </Dialog.Description>
               <div className="flex flex-wrap justify-end gap-3">
                  <Dialog.Close asChild>
                     <Button type="button" variant="outline" className="min-h-11" disabled={busy}>
                        {cancel}
                     </Button>
                  </Dialog.Close>
                  <Button type="button" variant={destructive ? "destructive" : "default"} className="min-h-11" disabled={busy} aria-busy={busy || undefined} onClick={onConfirm}>
                     {confirm}
                  </Button>
               </div>
            </Dialog.Content>
         </Dialog.Portal>
      </Dialog.Root>
   );
}
