import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Teaches the merger the P2 type scale and widths from globals.css; unknown `text-*` reads as a colour.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "title", "section", "subsection", "body", "supporting", "code"] }],
      "max-w": [{ "max-w": ["page", "reading"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
