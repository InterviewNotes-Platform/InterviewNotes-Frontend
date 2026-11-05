/** Paging for the two item-state lists (api-contract §15.5): `limit` 1 to 100 (default 50), `offset` at least 0. No `q`, `sort` or filter. */
export type ItemStateListParams = { limit?: number; offset?: number };
