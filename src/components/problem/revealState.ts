/** Marks a native disclosure as a reveal; the value is its key in the page-level state (S-RVL-7). */
export const REVEAL_ATTRIBUTE = "data-reveal";
const REVEALS = `details[${REVEAL_ATTRIBUTE}]`;

/** A followed fragment that opened something: the element to bring into view, and whether it is a unit that takes focus (S-AX-4). */
export interface Arrival {
   id: string;
   focus: boolean;
}

/** Ephemeral: which reveals are open. Never stored and never written to the URL (S-PST-1, S-PST-2). */
export interface RevealState {
   open: ReadonlySet<string>;
   /** The control reads "Hide everything" while this is set. */
   everything: boolean;
   arrival: Arrival | null;
}

export type RevealAction =
   | { type: "toggle"; key: string; open: boolean }
   | { type: "open"; keys: readonly string[]; arrival?: Arrival }
   | { type: "showAll"; keys: readonly string[] }
   | { type: "hideAll" };

export const INITIAL_REVEAL_STATE: RevealState = { open: new Set(), everything: false, arrival: null };

export function revealReducer(state: RevealState, action: RevealAction): RevealState {
   switch (action.type) {
      case "toggle": {
         if (state.open.has(action.key) === action.open) return state;
         const open = new Set(state.open);
         if (action.open) open.add(action.key);
         else open.delete(action.key);
         return { ...state, open };
      }
      case "open": {
         if (!action.arrival && action.keys.every((key) => state.open.has(key))) return state;
         return { ...state, open: new Set([...state.open, ...action.keys]), arrival: action.arrival ?? state.arrival };
      }
      case "showAll":
         return { open: new Set(action.keys), everything: true, arrival: null };
      case "hideAll":
         return INITIAL_REVEAL_STATE;
   }
}

const keyOf = (details: Element) => details.getAttribute(REVEAL_ATTRIBUTE)!;
const reveals = (root: ParentNode) => [...root.querySelectorAll(REVEALS)];

export const allKeys = (root: ParentNode) => reveals(root).map(keyOf);
export const openKeys = (root: ParentNode) => reveals(root).filter((details) => (details as HTMLDetailsElement).open).map(keyOf);

/**
 * What a fragment opens (S-RVL-8, S-RVL-9), read from the released document itself, so a withheld or absent id finds nothing:
 * every reveal around the target, outermost first, and the target's own reveal when it is a unit. A target in no reveal (the
 * challenge, a position) opens nothing and is left to the browser's own scroll.
 */
export function arrivalAt(fragment: string, root: Document): { keys: string[]; arrival: Arrival } | null {
   let id: string;
   try {
      id = decodeURIComponent(fragment.replace(/^#/, ""));
   } catch {
      return null;
   }
   const target = id ? root.getElementById(id) : null;
   if (!target) return null;

   const keys: string[] = [];
   for (let around = target.closest(REVEALS); around; around = around.parentElement?.closest(REVEALS) ?? null) keys.unshift(keyOf(around));
   const unit = reveals(root).some((details) => keyOf(details) === id);
   if (unit && !keys.includes(id)) keys.push(id);
   return keys.length > 0 ? { keys, arrival: { id, focus: unit } } : null;
}
