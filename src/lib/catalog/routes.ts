const ITEM_ID = /^(knowledge|lesson|problem|track)\.([a-z0-9]+(?:-[a-z0-9]+)*)$/;

const ROUTE_ROOT = {
   knowledge: "/knowledge",
   lesson: "/lessons",
   problem: "/problems",
   track: "/tracks",
} as const;

/** The type-based route for an item id such as `lesson.dynamic-batching`; null if malformed. */
export function catalogHref(id: string): string | null {
   const match = ITEM_ID.exec(id);
   if (!match) return null;
   return `${ROUTE_ROOT[match[1] as keyof typeof ROUTE_ROOT]}/${match[2]}`;
}
