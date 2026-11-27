import { createContext } from "react";

/** True where a diagram must draw now rather than when it nears the viewport: a pinned Lesson exhibit, whose slip offers Expand only once it is drawn. */
export const DrawDiagramNow = createContext(false);

/** Where a diagram's viewer returns focus on close, keyed by its Expand button: the margin slip it was opened from. */
export const viewerReturn = new WeakMap<HTMLElement, HTMLElement>();
