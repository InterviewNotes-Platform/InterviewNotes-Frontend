import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { registerLeaveGuard } from "@/lib/leave-guard";

const DISCARD_PROMPT = "Your changes could not be saved. Leave anyway and lose them?";
/** Marks the history entry this hook adds on top of the editor's own. */
const MARK = "itnLeaveGuard";

interface Options {
   /** True while the server lacks something, or a write is in the air or unconfirmed and may still change it. */
   active: boolean;
   /** Writes everything unsaved; true only when the server then holds the draft as it stands. */
   settle: () => Promise<boolean>;
}

/** The slice of the Navigation API used here; browsers without it fall back to the history entry below. */
interface NavigateEvent extends Event {
   navigationType: string;
   cancelable: boolean;
   destination: { key: string | null };
}
interface NavigationApi {
   addEventListener(type: "navigate", listener: (event: NavigateEvent) => void): void;
   removeEventListener(type: "navigate", listener: (event: NavigateEvent) => void): void;
   traverseTo(key: string): { committed?: Promise<unknown>; finished?: Promise<unknown> } | undefined;
}
const navigationApi = () => (window as unknown as { navigation?: NavigationApi }).navigation;

const marked = () => Boolean((window.history.state as Record<string, unknown> | null)?.[MARK]);
const where = () => window.location.pathname + window.location.search;

/**
 * Stops in-app exits from discarding work: a same-tab link, the browser's back button, a copy opening, sign-out. Each
 * saves first and, when saving fails, asks. Closing the tab is the page's own beforeunload warning.
 */
export function useLeaveGuard({ active, settle }: Options) {
   const router = useRouter();
   const [leaving, setLeaving] = useState(false);
   const latest = useRef({ active, settle });
   const busy = useRef(false);
   const onMark = useRef(false);
   // Traversals this hook makes itself must not be held again: until this time the next navigate event passes.
   const passUntil = useRef(0);
   const afterJump = useRef(false);
   const go = useCallback((delta: number) => {
      passUntil.current = Date.now() + 1000;
      window.history.go(delta);
   }, []);

   useEffect(() => {
      latest.current = { active, settle };
   });

   /** True when the caller may go on: nothing was held back, it was saved, or the reader chose to discard it. */
   const confirmLeave = useCallback(async (): Promise<boolean> => {
      if (!latest.current.active) return true;
      if (busy.current) return false;
      busy.current = true;
      setLeaving(true);
      try {
         return (await latest.current.settle()) || window.confirm(DISCARD_PROMPT);
      } finally {
         busy.current = false;
         setLeaving(false);
      }
   }, []);

   const leave = useCallback(
      async (proceed: () => void) => {
         if (await confirmLeave()) proceed();
      },
      [confirmLeave]
   );

   useEffect(() => registerLeaveGuard(confirmLeave), [confirmLeave]);

   useEffect(() => {
      const onClick = (event: MouseEvent) => {
         if (!latest.current.active || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
         const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
         if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
         const url = new URL(anchor.href);
         // Another origin unloads the page, so beforeunload speaks for it; the same page is no exit.
         if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
         event.preventDefault();
         event.stopPropagation();
         void leave(() => router.push(`${url.pathname}${url.search}${url.hash}`));
      };
      document.addEventListener("click", onClick, true);
      return () => document.removeEventListener("click", onClick, true);
   }, [leave, router]);

   // Where the Navigation API exists, any history traversal, however many entries it spans, can be held before the router
   // sees it. The history entry below stays for browsers without it.
   useEffect(() => {
      const navigation = navigationApi();
      if (!navigation) return;
      const onNavigate = (event: NavigateEvent) => {
         if (Date.now() < passUntil.current) {
            passUntil.current = 0;
            return;
         }
         const key = event.destination.key;
         if (event.navigationType !== "traverse" || !event.cancelable || !key || !latest.current.active) return;
         event.preventDefault();
         void leave(() => {
            passUntil.current = Date.now() + 1000;
            afterJump.current = true;
            const forget = () => {
               passUntil.current = 0;
               afterJump.current = false;
            };
            try {
               const replay = navigation.traverseTo(key);
               void replay?.committed?.catch(forget);
               void replay?.finished?.catch(forget);
            } catch {
               forget();
            }
         });
      };
      navigation.addEventListener("navigate", onNavigate);
      return () => navigation.removeEventListener("navigate", onNavigate);
   }, [leave]);

   // The router acts on a pop before any listener of ours can stop it, so the pop must lead nowhere: once there is
   // something unsaved, one copy of this page is added to the history, and Back then lands on this same page.
   useEffect(() => {
      onMark.current = marked();
   }, []);
   useEffect(() => {
      if (!active || onMark.current) return;
      window.history.pushState({ ...(window.history.state as object | null), [MARK]: true }, "", window.location.href);
      onMark.current = true;
   }, [active]);

   useEffect(() => {
      const page = where();
      let restoring = false;
      let afterRestore: (() => void) | null = null;
      const onPop = (event: PopStateEvent) => {
         const landedOnMark = Boolean((event.state as Record<string, unknown> | null)?.[MARK]);
         if (restoring) {
            restoring = false;
            onMark.current = true;
            afterRestore?.();
            afterRestore = null;
            return;
         }
         const poppedToPage = onMark.current && !landedOnMark && where() === page;
         const decided = afterJump.current;
         onMark.current = landedOnMark;
         afterJump.current = false;
         if (!poppedToPage) return;
         if (decided || !latest.current.active) {
            // Nothing to protect, or the reader has already chosen: finish the Back, past the copy this hook added.
            go(-1);
            return;
         }
         restoring = true;
         go(1);
         // A traversal must land before the next is asked for, or the second is measured from the wrong entry.
         const goBack = () => go(-2);
         void leave(() => (restoring ? (afterRestore = goBack) : goBack()));
      };
      window.addEventListener("popstate", onPop);
      return () => window.removeEventListener("popstate", onPop);
   }, [leave, go]);

   return { leave, leaving };
}
