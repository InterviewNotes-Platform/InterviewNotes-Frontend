"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, useSyncExternalStore, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ReaderMode } from "@/lib/reader/shellPolicy";

type Update<T> = T | ((previous: T) => T);
type Tools = Readonly<Record<string, unknown>>;
/** The signed-in user's id, null when signed out, undefined until the session is known. */
type Owner = string | null | undefined;
interface Store {
   owner: Owner;
   tools: Tools;
}
type StoreAction = { type: "owner"; owner: Owner } | { type: "set"; key: string; update: Update<unknown>; initial: unknown };

const EMPTY: Tools = {};

function storeReducer(store: Store, action: StoreAction): Store {
   // Another session (sign-in, sign-out, a different user) starts from nothing: no tool state crosses users.
   if (action.type === "owner") return action.owner === store.owner ? store : { owner: action.owner, tools: EMPTY };
   const current = action.key in store.tools ? store.tools[action.key] : action.initial;
   const value = typeof action.update === "function" ? (action.update as (previous: unknown) => unknown)(current) : action.update;
   return { ...store, tools: { ...store.tools, [action.key]: value } };
}

/** Follows the session from the browser client's auth events only, so it adds no request of its own. */
function useSessionOwner(): Owner {
   const [owner, setOwner] = useState<Owner>(undefined);
   useEffect(() => {
      try {
         const { data } = createClient().auth.onAuthStateChange((_event, session) => setOwner(session?.user.id ?? null));
         return () => data.subscription.unsubscribe();
      } catch {
         // No auth client (as in tests): the owner stays unknown and the store serves one anonymous session.
      }
   }, []);
   return owner;
}

// Values that are already stable (a string, the state object, React's dispatch), so none needs memoizing.
const ModeContext = createContext<ReaderMode | null>(null);
const ToolsContext = createContext<Tools | null>(null);
const DispatchContext = createContext<((action: StoreAction) => void) | null>(null);

/**
 * Study-tool state (pins, scratch, …) for the browser tab, in memory only (S-PST-1): never written to storage or a server. It
 * sits in the root layout, which App Router keeps across client navigation, so it survives moving between reader pages, as the
 * selected design's do; a reload clears it, and a change of session clears it.
 */
export function ReaderToolStoreProvider({ children }: { children: ReactNode }) {
   const owner = useSessionOwner();
   const [store, dispatch] = useReducer(storeReducer, { owner: undefined, tools: EMPTY });
   useEffect(() => dispatch({ type: "owner", owner }), [owner]);
   // Until the reset above runs, another session's state is never read.
   const tools = store.owner === owner ? store.tools : EMPTY;
   return (
      <DispatchContext.Provider value={dispatch}>
         <ToolsContext.Provider value={tools}>{children}</ToolsContext.Provider>
      </DispatchContext.Provider>
   );
}

/** The reading mode of one page's shell; it does not carry across pages. */
export function ReaderModeProvider({ mode, children }: { mode: ReaderMode; children: ReactNode }) {
   return <ModeContext.Provider value={mode}>{children}</ModeContext.Provider>;
}

function required<T>(value: T | null, hook: string, where: string): T {
   if (value === null) throw new Error(`${hook} must be used inside ${where}`);
   return value;
}

/** The current Study/Read mode, for page presentation such as Read's type sizes. */
export function useReaderMode(): ReaderMode {
   return required(useContext(ModeContext), "useReaderMode", "ReaderShell");
}

/** One piece of study-tool state by key, owned by the tab-level store rather than by the tool's own component. */
export function useReaderToolState<T>(key: string, initial: T): [T, (update: Update<T>) => void] {
   const tools = required(useContext(ToolsContext), "useReaderToolState", "ReaderToolStoreProvider");
   const dispatch = required(useContext(DispatchContext), "useReaderToolState", "ReaderToolStoreProvider");
   const value = (key in tools ? tools[key] : initial) as T;
   const set = useCallback((update: Update<T>) => dispatch({ type: "set", key, update: update as Update<unknown>, initial }), [dispatch, key, initial]);
   return [value, set];
}

const subscribeTo = (query: string) => (change: () => void) => {
   if (typeof window.matchMedia !== "function") return () => {};
   const list = window.matchMedia(query);
   list.addEventListener("change", change);
   return () => list.removeEventListener("change", change);
};

/** Whether `query` matches; null on the server and while hydrating, so the first client render matches the HTML. */
export function useMediaQuery(query: string): boolean | null {
   const subscribe = useMemo(() => subscribeTo(query), [query]);
   return useSyncExternalStore(
      subscribe,
      () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
      () => null
   );
}
