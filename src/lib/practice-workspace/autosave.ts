/**
 * One autosaving resource: a draft the learner edits, the canonical copy the server last returned, and the loop that
 * keeps them together (P9-T13; spec §8.1, `P9-R-GRF-10`). It is the `useAnswerEditor` pattern (`src/components/prepare/editor`)
 * lifted out of React and made generic: a 1.5 s inactivity debounce, one write in flight per resource, compare-and-set on
 * the canonical version, and "saved" claimed only when the server's reply holds the draft as it stands. T14 reuses it for
 * the diagram resource by supplying its own `Resource`.
 *
 * What it does not do: persist anything outside memory, retry for ever, or decide anything the server decides (the status
 * of the attempt, a version). A refusal it cannot resolve stops the loop and keeps the learner's text.
 */

/** Quiet time after the last keystroke before a save starts: the value `useAnswerEditor` uses (a test holds the two equal). */
export const AUTOSAVE_DELAY_MS = 1500;

/** Waits before each automatic retry after a write whose outcome is unknown; after the last one only the learner's Retry remains. */
export const OFFLINE_RETRY_DELAYS_MS: readonly number[] = [5_000, 15_000, 30_000];

export type SaveOutcome<S> =
   | { kind: "ok"; saved: S }
   /** 409 `version_conflict`: nothing was applied. */
   | { kind: "conflict" }
   /** 409 `attempt_not_active`: the attempt ended or was abandoned; nothing was applied and nothing may be. */
   | { kind: "not_active" }
   | { kind: "signin" }
   | { kind: "gone" }
   /** 422: the server did not accept the text. Retrying the same text cannot help. */
   | { kind: "invalid" }
   /** Network, timeout, 5xx or an unreadable answer: the write may or may not have landed. */
   | { kind: "offline" }
   /** The caller was replaced (session change, unmount): no outcome to act on. */
   | { kind: "aborted" };

export type LoadOutcome<S> = { kind: "ok"; saved: S; active: boolean } | { kind: "signin" } | { kind: "gone" } | { kind: "offline" } | { kind: "aborted" };

export interface Resource<D, S, P> {
   draftOf(saved: S): D;
   /** What the server lacks: null when the saved copy already holds the draft. */
   diff(draft: D, saved: S): P | null;
   send(saved: S, patch: P, signal: AbortSignal): Promise<SaveOutcome<S>>;
   /** The server's current copy, to settle a conflict or to confirm a write whose outcome was unknown. */
   load(signal: AbortSignal): Promise<LoadOutcome<S>>;
   /** Mine and theirs joined, from a common base: every part either side added is kept, and what both changed is shown twice. */
   combine(mine: D, theirs: S, base: S): { draft: D; note?: string };
   /** Mine over theirs where both changed; theirs where only the server changed. The draft to keep when the learner chooses Keep mine. */
   keepMine(mine: D, theirs: S, base: S): D;
}

export type Phase = "idle" | "saving" | "saved" | "offline" | "conflict" | "terminal" | "signin" | "gone" | "invalid";

export interface AutosaveSnapshot<D, S> {
   saved: S;
   draft: D;
   phase: Phase;
   /** There is text the server does not hold. */
   dirty: boolean;
   /** A choice about a conflict is being carried out. */
   resolving: boolean;
   /** On a conflict: the server's copy the learner is choosing against. Null until it has been read. */
   theirs: S | null;
   note?: string;
}

export interface AutosaveOptions<D, S, P> {
   resource: Resource<D, S, P>;
   initial: S;
   /** Called once when a write found the attempt no longer active. */
   onTerminal?: () => void;
   delayMs?: number;
}

const BLOCKED: ReadonlySet<Phase> = new Set(["conflict", "terminal", "signin", "gone", "invalid"]);

const ENDED_NOTE = "Not saved: this attempt has ended, so changes can no longer be saved. Your last edits are shown here.";

export class AutosaveEngine<D, S, P> {
   private readonly resource: Resource<D, S, P>;
   private readonly onTerminal?: () => void;
   private readonly delayMs: number;
   private readonly controller = new AbortController();
   private readonly listeners = new Set<() => void>();
   private saved: S;
   private draft: D;
   private phase: Phase = "idle";
   private resolving = false;
   private theirs: S | null = null;
   private note: string | undefined;
   private timer: ReturnType<typeof setTimeout> | undefined;
   private retryTimer: ReturnType<typeof setTimeout> | undefined;
   private retries = 0;
   private flight: Promise<void> | null = null;
   private rejected: D | null = null;
   private disposed = false;
   /** Set once by `halt()` and never cleared: the attempt is not active, so this resource never writes again (an absorbing state). */
   private halted = false;
   private snapshot: AutosaveSnapshot<D, S>;

   constructor({ resource, initial, onTerminal, delayMs = AUTOSAVE_DELAY_MS }: AutosaveOptions<D, S, P>) {
      this.resource = resource;
      this.onTerminal = onTerminal;
      this.delayMs = delayMs;
      this.saved = initial;
      this.draft = resource.draftOf(initial);
      this.snapshot = this.build();
   }

   // --- reading ---

   subscribe = (listener: () => void): (() => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
   };

   getSnapshot = (): AutosaveSnapshot<D, S> => this.snapshot;

   /** Unsaved text, a write in the air, or a refusal that left text only here: something would be lost by leaving. */
   get hasPendingWork(): boolean {
      return this.isDirty() || this.phase === "saving";
   }

   private isDirty(): boolean {
      return this.resource.diff(this.draft, this.saved) !== null;
   }

   private build(): AutosaveSnapshot<D, S> {
      return { saved: this.saved, draft: this.draft, phase: this.phase, dirty: this.isDirty(), resolving: this.resolving, theirs: this.theirs, note: this.note };
   }

   private emit(): void {
      if (this.disposed) return;
      this.snapshot = this.build();
      for (const listener of [...this.listeners]) listener();
   }

   private set(phase: Phase, note?: string): void {
      this.phase = phase;
      this.note = note;
      this.emit();
   }

   // --- editing ---

   /** Local typing: visible at once, saved after the quiet time. Never blocked by a refusal: the text stays editable and in memory. */
   edit(update: (draft: D) => D): void {
      if (this.disposed) return;
      this.draft = update(this.draft);
      if (this.halted) {
         // The text stays editable and in memory, but nothing is ever sent: only the note about what is unsaved is kept true.
         this.refreshEndedNote();
         return;
      }
      if (this.phase === "saved" || this.phase === "invalid") {
         this.phase = "idle";
         this.note = undefined;
      }
      this.rejected = null;
      this.emit();
      this.schedule();
   }

   private schedule(): void {
      clearTimeout(this.timer);
      clearTimeout(this.retryTimer);
      if (this.disposed || BLOCKED.has(this.phase)) return;
      this.timer = setTimeout(() => {
         this.timer = undefined;
         void this.persist();
      }, this.delayMs);
   }

   /** Saves what is unsaved now, after any write already in flight. Resolves when the loop has stopped. */
   persist(): Promise<void> {
      clearTimeout(this.timer);
      this.timer = undefined;
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
      if (this.disposed || this.halted) return Promise.resolve();
      this.flight ??= this.drain().finally(() => {
         this.flight = null;
      });
      return this.flight;
   }

   /** The learner's Retry after an unknown outcome or a refusal that depended on the network. */
   retry(): Promise<void> {
      if (this.halted) return Promise.resolve();
      if (this.phase === "invalid") this.rejected = null;
      if (this.phase === "offline" || this.phase === "invalid") this.phase = "idle";
      this.retries = 0;
      return this.persist();
   }

   private async drain(): Promise<void> {
      for (;;) {
         if (this.disposed || this.halted) return;
         const patch = this.resource.diff(this.draft, this.saved);
         if (patch === null) {
            if (this.phase === "saving") this.set("saved");
            return;
         }
         if (BLOCKED.has(this.phase) || this.rejected === this.draft) return;
         const sent = this.draft;
         this.set("saving");
         const outcome = await this.resource.send(this.saved, patch, this.controller.signal);
         if (this.disposed) return;
         if (this.halted) return this.acceptLateReply(outcome);
         switch (outcome.kind) {
            case "ok":
               this.saved = outcome.saved;
               this.retries = 0;
               if (this.resource.diff(this.draft, this.saved) === null) return this.set("saved");
               // Typed during the request: a pending debounce saves it, otherwise this loop does, now.
               if (this.timer !== undefined) return this.set("idle");
               continue;
            case "conflict":
               // True when the server already held the draft (a write that landed unseen): nothing was lost and nothing is left to choose.
               if (await this.enterConflict()) return;
               return;
            case "not_active":
               return this.halt();
            case "signin":
               return this.set("signin", "Not saved: your session has ended. Your text is still here.");
            case "gone":
               return this.set("gone", "Not saved: this attempt no longer exists. Your text is still here; copy it if you want to keep it.");
            case "invalid":
               this.rejected = sent;
               return this.set("invalid", "Not saved: the server did not accept some of this text. Your text is still here.");
            case "aborted":
               return;
            case "offline":
               this.set("offline", "Not saved: we could not reach the server. Your text is still here and stays only in this tab; we will try again.");
               this.scheduleRetry();
               return;
         }
      }
   }

   private scheduleRetry(): void {
      const delay = OFFLINE_RETRY_DELAYS_MS[this.retries];
      if (delay === undefined || this.disposed || this.halted) return;
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => {
         this.retryTimer = undefined;
         if (this.halted) return;
         this.retries += 1;
         if (this.phase === "offline") this.phase = "idle";
         void this.persist();
      }, delay);
   }

   // --- terminal attempt ---

   /** Stops every write for good: the attempt is not active. The draft stays visible so the learner can see what was not saved. */
   halt(): void {
      clearTimeout(this.timer);
      clearTimeout(this.retryTimer);
      this.timer = undefined;
      this.retryTimer = undefined;
      const first = !this.halted;
      this.halted = true;
      this.theirs = null;
      this.resolving = false;
      this.set("terminal", this.isDirty() ? ENDED_NOTE : undefined);
      if (first) this.onTerminal?.();
   }

   /** The note says "not saved" exactly while the server lacks text; it never claims a save nobody acknowledged. */
   private refreshEndedNote(): void {
      this.note = this.isDirty() ? ENDED_NOTE : undefined;
      this.emit();
   }

   /**
    * A reply to a write that was in the air when the attempt ended. It cannot reopen the resource: the phase stays `terminal` and
    * nothing is sent. Only an acknowledged `ok` changes what is known: that write committed before the attempt ended, so the
    * canonical copy moves to it and "unsaved" is recomputed from it. Every other outcome says nothing the learner can act on
    * (an unknown outcome is not claimed as saved, and a refusal changes nothing), so the note stays "not saved".
    */
   private acceptLateReply(outcome: SaveOutcome<S>): void {
      if (outcome.kind === "ok") this.saved = outcome.saved;
      this.refreshEndedNote();
   }

   // --- conflict ---

   /** 409: read the server's copy. If it already holds the draft (a write that landed unseen), nothing is in conflict; otherwise the learner chooses. */
   private async enterConflict(): Promise<boolean> {
      if (this.halted) return false;
      this.set("conflict", "Not saved: this was changed somewhere else. Your text is still here; choose which version to keep.");
      const loaded = await this.resource.load(this.controller.signal);
      if (this.disposed) return false;
      if (this.halted) {
         // Halted while the other version was being read: the read may still show what the server holds, but it cannot reopen the resource.
         if (loaded.kind === "ok") this.saved = loaded.saved;
         this.refreshEndedNote();
         return false;
      }
      switch (loaded.kind) {
         case "ok":
            if (!loaded.active) {
               this.saved = loaded.saved;
               this.halt();
               return false;
            }
            // Everything I changed is already what the server holds: the write landed unseen. What only the server changed is adopted, so nothing of mine is replaced.
            const merged = this.resource.keepMine(this.draft, loaded.saved, this.saved);
            if (this.resource.diff(merged, loaded.saved) === null) {
               this.saved = loaded.saved;
               this.draft = merged;
               this.theirs = null;
               this.set("saved");
               return true;
            }
            this.theirs = loaded.saved;
            this.set("conflict", "Not saved: this was changed somewhere else. Your text is still here; choose which version to keep.");
            return false;
         case "signin":
            this.set("signin", "Not saved: your session has ended. Your text is still here.");
            return false;
         case "gone":
            this.set("gone", "Not saved: this attempt no longer exists. Your text is still here; copy it if you want to keep it.");
            return false;
         default:
            this.theirs = null;
            this.set("conflict", "Not saved: this was changed somewhere else, and we could not load the other version. Your text is still here; try again.");
            return false;
      }
   }

   /** The conflict's "Load the other version again" after a read that failed. */
   reloadConflict(): Promise<void> {
      if (this.halted || this.phase !== "conflict" || this.resolving || this.flight) return Promise.resolve();
      this.flight = this.enterConflict().then(() => undefined).finally(() => {
         this.flight = null;
      });
      return this.flight;
   }

   private resolve(choose: (theirs: S) => { draft: D; note?: string }, after: "save" | "none"): Promise<void> {
      const theirs = this.theirs;
      if (this.halted || this.phase !== "conflict" || this.resolving || this.flight || theirs === null) return Promise.resolve();
      this.resolving = true;
      this.emit();
      this.flight = (async () => {
         const chosen = choose(theirs);
         this.resolving = false;
         // From here the learner's choice is the approval: the next write goes out against the server's version, not the old one.
         this.saved = theirs;
         this.theirs = null;
         this.draft = chosen.draft;
         this.rejected = null;
         this.set(after === "save" ? "idle" : "saved", chosen.note);
         if (after === "save") {
            await this.drain();
            // A second conflict is shown again, never overwritten (`enterConflict` ran inside the loop).
         }
      })().finally(() => {
         this.flight = null;
      });
      return this.flight;
   }

   keepMine(): Promise<void> {
      const base = this.saved;
      return this.resolve((theirs) => ({ draft: this.resource.keepMine(this.draft, theirs, base) }), "save");
   }

   takeTheirs(): Promise<void> {
      return this.resolve((theirs) => ({ draft: this.resource.draftOf(theirs), note: "Saved: loaded the other version. Your earlier text was replaced." }), "none");
   }

   combine(): Promise<void> {
      const base = this.saved;
      return this.resolve((theirs) => this.resource.combine(this.draft, theirs, base), "save");
   }

   // --- leaving ---

   /** Drives everything unsaved to the server before the learner leaves. True only when the server then holds the draft as it stands. */
   async settle(): Promise<boolean> {
      for (let round = 0; round < 3; round++) {
         await this.persist();
         if (this.disposed) return false;
         if (!this.isDirty() && this.phase !== "saving") return true;
         if (BLOCKED.has(this.phase) || this.phase === "offline") return false;
      }
      return !this.isDirty();
   }

   // --- the end of this resource's life ---

   /** A session change or unmount: stop the timers, abort what is in the air, and ignore whatever still arrives. */
   dispose(): void {
      this.disposed = true;
      clearTimeout(this.timer);
      clearTimeout(this.retryTimer);
      this.controller.abort();
      this.listeners.clear();
   }
}
