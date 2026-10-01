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

/** The route for a navigation entry whose id agrees with its own type and slug; null otherwise. */
export function catalogEntryHref(entry: { id: string; type: string; slug: string }): string | null {
   return entry.id === `${entry.type}.${entry.slug}` ? catalogHref(entry.id) : null;
}

/** The entries that map to a canonical route, each with it. Any other reference is dropped. */
export function linkableEntries<T extends { id: string; type: string; slug: string }>(
   entries: readonly T[]
): { entry: T; href: string }[] {
   return entries.flatMap((entry) => {
      const href = catalogEntryHref(entry);
      return href ? [{ entry, href }] : [];
   });
}
