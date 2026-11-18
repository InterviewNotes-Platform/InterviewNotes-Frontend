/** One card per published Track; a lone Track or a pair is centred rather than left in a wider grid. */
export const CARD_GRID = (count: number) => (count === 1 ? "max-w-xl" : count === 2 ? "max-w-4xl md:grid-cols-2" : "max-w-6xl md:grid-cols-2 lg:grid-cols-3");
/** The grid a skeleton holds while the count is unknown: a pair, which is what the catalog publishes. */
export const CARD_GRID_CLASS = CARD_GRID(2);
