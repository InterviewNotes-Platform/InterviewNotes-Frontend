// Test-only stand-in for the backend catalog/content API and Supabase's user endpoint, serving fixture.json.
// Access decisions mirror backend `app/routers/catalog.py`: the API decides, the frontend only renders.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const fixture = JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url), "utf8"));
const [apiPort, authPort] = process.argv.slice(2).map(Number);
const HOST = "127.0.0.1";
// Set: a preview API (backend D9), answering /catalog only to the holder of this secret. Unset: production.
const previewToken = process.env.FAKE_API_PREVIEW_TOKEN;
// Set: a second credential the preview API accepts, for a catalog with nothing published (empty states).
const emptyToken = process.env.FAKE_API_EMPTY_TOKEN;
const PRIVATE = "private, no-store";
/** Every /catalog request, with its query string and the preview credential it presented, served or refused. */
const catalogLog = [];

const items = new Map(fixture.items.map((item) => [item.id, item]));
const tracks = new Map(fixture.tracks.map((track) => [track.slug, track]));
const courses = new Map(fixture.legacy.courses.map((course) => [course.slug, course]));

function send(res, status, body, headers = {}) {
   res.writeHead(status, { "content-type": "application/json", ...headers });
   res.end(JSON.stringify(body));
}

/** The fixture identity for a bearer token; an unknown token is no user, as in backend `get_optional_user`. */
function identityOf(req) {
   const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
   return Object.values(fixture.identities).find((identity) => identity.token === token) ?? null;
}

function meta({ id, type, slug, title, summary, tags, category, difficulty, level, access }) {
   return { id, type, slug, title, summary, tags, category: category ?? null, difficulty, level, access };
}

/** 401/402 for a premium item, else the premium section ids to withhold (backend `_authorize`). */
function authorize(item, identity, sections = item.sections ?? []) {
   const premium = new Set(sections.filter((section) => section.access === "premium").map((section) => section.id));
   const entitled = identity?.entitled === true;
   if (item.access === "premium" && !entitled) return { status: identity ? 402 : 401 };
   return { withheld: entitled ? new Set() : premium };
}

function itemOut(item, withheld) {
   const sections = item.sections ?? [];
   return {
      ...meta(item),
      body: item.body ? { format: "markdown@1", text: item.body } : null,
      headings: item.headings ?? [],
      sections: sections
         .filter((section) => !withheld.has(section.id))
         .map(({ id, type, title, text }) => ({ id, type, title, body: { format: "markdown@1", text } })),
      sections_withheld: sections.some((section) => withheld.has(section.id)),
   };
}

function placements(item) {
   return fixture.tracks.flatMap((track) =>
      track.modules.flatMap((module) => {
         const index = module.items.indexOf(item.id);
         if (index === -1) return [];
         return [{ track: track.slug, module: module.key, position: index + 1, primary: item.home === track.slug }];
      })
   );
}

function trackOut(track) {
   const { id, slug, title, summary } = track;
   const modules = track.modules.map((module, index) => ({
      key: module.key,
      title: module.title,
      position: index + 1,
      items: module.items.map((itemId) => {
         const item = items.get(itemId);
         const primary = item.home === track.slug;
         return { id: item.id, type: item.type, slug: item.slug, title: item.title, access: item.access, primary };
      }),
   }));
   return { id, slug, title, summary, modules };
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ITEM_ID = /^(?:knowledge|lesson|problem)\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LIST_PARAMS = new Set(["type", "category", "tag", "difficulty", "level", "access", "track", "module", "limit", "cursor"]);
const ENUMS = {
   type: ["track", "knowledge", "lesson", "problem"],
   difficulty: ["easy", "medium", "hard"],
   level: ["foundational", "intermediate", "advanced"],
   access: ["free", "premium"],
};
// Backend vocab: a category belongs to exactly one type; Lesson and Track have none (P1 §6.1, §6.4).
const CATEGORIES = {
   knowledge: ["concept", "term", "technology", "research", "pattern", "quick_reference"],
   problem: ["system_design", "ml_system_design"],
};
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Backend `GET /catalog/tracks`: published Tracks by id, identity and summary only, never paginated. */
function listTracks(res) {
   const listed = [...tracks.values()].sort(byId).map(({ id, slug, title, summary }) => ({ id, slug, title, summary }));
   return send(res, 200, { tracks: listed });
}

/**
 * Backend `GET /catalog/items`: parameter validation (422), then the handler's checks, then an AND of the
 * filters ordered by id with a keyset cursor. The cursor is the last item's id, as the backend issues it.
 */
function listItems(res, query) {
   const invalid = (detail) => send(res, 422, { detail });
   for (const [name, allowed] of Object.entries(ENUMS)) {
      if (query.has(name) && !allowed.includes(query.get(name))) return invalid(`Invalid ${name}`);
   }
   if (query.get("tag") === "") return invalid("Invalid tag");
   const category = query.get("category");
   if (category !== null) {
      if (!Object.values(CATEGORIES).some((values) => values.includes(category))) return invalid("Invalid category");
      const type = query.get("type");
      if (type !== null && !CATEGORIES[type]?.includes(category)) return invalid(`category ${category} is not defined for type ${type}`);
   }
   const limit = query.has("limit") ? Number(query.get("limit")) : DEFAULT_LIMIT;
   if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return invalid("Invalid limit");
   const unsupported = [...new Set(query.keys())].filter((name) => !LIST_PARAMS.has(name)).sort();
   if (unsupported.length > 0) return invalid(`Unsupported query parameter: ${unsupported.join(", ")}`);

   const slug = query.get("track");
   const track = slug === null ? null : SLUG.test(slug) ? tracks.get(slug) : undefined;
   if (track === undefined) return send(res, 404, { detail: "Track not found" });
   if (query.get("type") === "track") return invalid("A Track is not an item");
   const moduleKey = query.get("module");
   if (moduleKey !== null && track === null) return invalid("module requires track");
   if (moduleKey !== null && !SLUG.test(moduleKey)) return invalid("Malformed module key");
   const cursor = query.get("cursor");
   if (cursor !== null && !ITEM_ID.test(cursor)) return invalid("Malformed cursor");

   const placed = track && new Set(track.modules.filter((m) => moduleKey === null || m.key === moduleKey).flatMap((m) => m.items));
   const matches = [...items.values()]
      .filter(
         (item) =>
            (!query.has("type") || item.type === query.get("type")) &&
            (category === null || item.category === category) &&
            (!query.has("access") || item.access === query.get("access")) &&
            (!query.has("difficulty") || item.difficulty === query.get("difficulty")) &&
            (!query.has("level") || item.level === query.get("level")) &&
            (!query.has("tag") || item.tags.includes(query.get("tag"))) &&
            (placed === null || placed.has(item.id)) &&
            (cursor === null || item.id > cursor)
      )
      .sort(byId);
   const page = matches.slice(0, limit);
   return send(res, 200, { items: page.map(meta), next_cursor: matches.length > limit ? page.at(-1).id : null });
}

function catalog(req, res, path, query) {
   if (path === "/catalog/tracks") return listTracks(res);
   if (path === "/catalog/items") return listItems(res, query);
   const track = /^\/catalog\/tracks\/([^/]+)$/.exec(path);
   if (track) {
      const found = tracks.get(decodeURIComponent(track[1]));
      return found ? send(res, 200, trackOut(found)) : send(res, 404, { detail: "Track not found" });
   }
   const match = /^\/catalog\/items\/([^/]+)\/([^/]+)(\/meta|\/related)?$/.exec(path);
   const item = match && items.get(`${decodeURIComponent(match[1])}.${decodeURIComponent(match[2])}`);
   if (!item) return send(res, 404, { detail: "Item not found" });

   if (match[3] === "/meta") return send(res, 200, meta(item));
   const identity = identityOf(req);
   if (match[3] === "/related") {
      const { status } = authorize(item, identity, []);
      if (status) return send(res, status, { detail: "Access denied" });
      const relations = Object.fromEntries(
         Object.entries(item.relations ?? {}).map(([name, ids]) => [name, ids.map((id) => meta(items.get(id)))])
      );
      return send(res, 200, { id: item.id, relations, placements: placements(item) });
   }
   const { status, withheld } = authorize(item, identity);
   return status ? send(res, status, { detail: "Access denied" }) : send(res, 200, itemOut(item, withheld));
}

/** Backend `PreviewBoundary`: a preview API serves only its trusted server; production refuses any preview credential. */
function guardedCatalog(req, res, path, query) {
   const presented = req.headers["x-preview-token"] ?? null;
   catalogLog.push({ path, query: query.toString(), presented });
   if (previewToken === undefined) {
      return presented === null ? catalog(req, res, path, query) : send(res, 403, { detail: "Forbidden" });
   }
   res.setHeader("cache-control", PRIVATE);
   if (emptyToken !== undefined && presented === emptyToken) return emptyCatalog(res, path);
   return presented === previewToken ? catalog(req, res, path, query) : send(res, 403, { detail: "Forbidden" });
}

/** A catalog that is enabled and reachable but has published nothing: the lists are empty, every item is unknown. */
function emptyCatalog(res, path) {
   if (path === "/catalog/tracks") return send(res, 200, { tracks: [] });
   if (path === "/catalog/items") return send(res, 200, { items: [], next_cursor: null });
   return send(res, 404, { detail: "Not found" });
}

/** The legacy `/content` endpoints read by `/learn/*`. */
function content(req, res, path) {
   if (path === "/content/courses") {
      return send(
         res,
         200,
         fixture.legacy.courses.map(({ chapters, ...course }) => ({
            ...course,
            chapter_count: chapters.length,
            chapters: chapters.map(({ id, slug, title, section, order, is_premium, estimated_read_time }) => ({
               id,
               course_id: course.id,
               slug,
               title,
               section,
               order,
               is_premium,
               estimated_read_time,
            })),
         }))
      );
   }
   const match = /^\/content\/courses\/([^/]+)\/chapters\/([^/]+)$/.exec(path);
   const chapter = match && courses.get(match[1])?.chapters.find((candidate) => candidate.slug === match[2]);
   if (!chapter) return send(res, 404, { detail: "Chapter not found" });
   const identity = identityOf(req);
   if (chapter.is_premium && !identity?.entitled) return send(res, identity ? 402 : 401, { detail: "Access denied" });
   return send(res, 200, {
      chapter_id: chapter.id,
      title: chapter.title,
      body_markdown: chapter.body,
      body_blocks: [],
      updated_at: "2026-01-01T00:00:00Z",
   });
}

const api = createServer((req, res) => {
   const { pathname: path, searchParams: query } = new URL(req.url, `http://${HOST}`);
   if (req.method !== "GET") return send(res, 405, { detail: "Method not allowed" });
   if (path === "/health") return send(res, 200, { status: "ok" });
   if (path === "/__catalog-log") return send(res, 200, catalogLog);
   if (path.startsWith("/catalog/")) return guardedCatalog(req, res, path, query);
   if (path.startsWith("/content/")) return content(req, res, path);
   return send(res, 404, { detail: "Not found" });
});

/** Supabase Auth `GET /auth/v1/user`, called by the middleware and the browser client. */
const auth = createServer((req, res) => {
   const cors = {
      "access-control-allow-origin": req.headers.origin ?? "*",
      "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "*",
      "access-control-allow-methods": "GET, OPTIONS",
   };
   if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
   const path = new URL(req.url, `http://${HOST}`).pathname;
   const identity = path === "/auth/v1/user" ? identityOf(req) : null;
   if (!identity) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" }, cors);
   return send(res, 200, identity.user, cors);
});

api.listen(apiPort, HOST);
if (authPort) auth.listen(authPort, HOST);
