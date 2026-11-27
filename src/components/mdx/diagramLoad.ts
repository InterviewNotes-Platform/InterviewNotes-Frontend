import { createContext } from "react";

/** True where a diagram must draw now rather than when it nears the viewport: a pinned Lesson exhibit, whose slip offers Expand only once the drawing shows it overflows. */
export const DrawDiagramNow = createContext(false);
