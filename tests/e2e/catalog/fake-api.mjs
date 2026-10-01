// Test-only stand-in for the backend catalog/content API and Supabase's user endpoint, serving fixture.json.
// Access decisions mirror backend `app/routers/catalog.py`: the API decides, the frontend only renders.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const fixture = JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url), "utf8"));
const [apiPort, authPort] = process.argv.slice(2).map(Number);
const HOST = "127.0.0.1";

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

function meta({ id, type, slug, title, summary, tags, difficulty, level, access }) {
   return { id, type, slug, title, summary, tags, difficulty, level, access };
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
      kind: item.kind ?? null,
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

function catalog(req, res, path) {
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
   const path = new URL(req.url, `http://${HOST}`).pathname;
   if (req.method !== "GET") return send(res, 405, { detail: "Method not allowed" });
   if (path === "/health") return send(res, 200, { status: "ok" });
   if (path.startsWith("/catalog/")) return catalog(req, res, path);
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
auth.listen(authPort, HOST);
