type Guard = () => Promise<boolean>;

let current: Guard | null = null;

/** A page holding unsaved work registers here, so actions outside it that end the session can ask it first. */
export function registerLeaveGuard(guard: Guard): () => void {
   current = guard;
   return () => {
      if (current === guard) current = null;
   };
}

/** True when nothing is held back, or the holder saved its work or the reader chose to discard it. */
export async function mayLeave(): Promise<boolean> {
   return current ? current() : true;
}
