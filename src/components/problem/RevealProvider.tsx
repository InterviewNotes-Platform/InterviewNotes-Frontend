"use client";

import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode, type SyntheticEvent } from "react";
import { INITIAL_REVEAL_STATE, allKeys, arrivalAt, openKeys, revealReducer, type RevealAction, type RevealState } from "./revealState";

const RevealContext = createContext<{ state: RevealState; dispatch: Dispatch<RevealAction> } | null>(null);

/**
 * The page's one owner of reveal state (S-RVL-7). The server HTML is closed native disclosure; once interactive this keeps
 * each one's `open` and acts on a followed fragment. It adds to native behaviour and never replaces it.
 */
export function RevealProvider({ children }: { children: ReactNode }) {
   const [state, dispatch] = useReducer(revealReducer, INITIAL_REVEAL_STATE);

   useEffect(() => {
      // Adopts whatever the reader opened before hydration, then follows the fragment, if it names released material.
      const follow = () => {
         const found = arrivalAt(window.location.hash, document);
         dispatch({ type: "open", keys: [...openKeys(document), ...(found?.keys ?? [])], arrival: found?.arrival });
      };
      // After the router has written a client navigation's URL.
      const first = window.setTimeout(follow, 0);
      // The router's own hash links use `pushState`, which never fires `hashchange`; the Navigation API reports them.
      const navigation = (window as { navigation?: EventTarget }).navigation;
      const [source, event] = navigation ? [navigation, "currententrychange"] : [window, "hashchange"];
      source.addEventListener(event, follow);
      return () => {
         window.clearTimeout(first);
         source.removeEventListener(event, follow);
      };
   }, []);

   const { arrival } = state;
   useEffect(() => {
      const target = arrival ? document.getElementById(arrival.id) : null;
      if (!arrival || !target) return;
      if (arrival.focus) target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start", behavior: "instant" });
   }, [arrival]);

   return <RevealContext.Provider value={{ state, dispatch }}>{children}</RevealContext.Provider>;
}

/** A reveal's controlled `open` and the handler that keeps native toggling in step; null outside a page-level owner. */
export function useReveal(key: string) {
   const context = useContext(RevealContext);
   if (!context) return null;
   const { state, dispatch } = context;
   return {
      open: state.open.has(key),
      onToggle: (event: SyntheticEvent<HTMLDetailsElement>) => dispatch({ type: "toggle", key, open: event.currentTarget.open }),
   };
}

export function useEverything() {
   const context = useContext(RevealContext);
   if (!context) throw new Error("useEverything needs a RevealProvider");
   const { state, dispatch } = context;
   return {
      everything: state.everything,
      showAll: () => dispatch({ type: "showAll", keys: allKeys(document) }),
      hideAll: () => dispatch({ type: "hideAll" }),
   };
}
