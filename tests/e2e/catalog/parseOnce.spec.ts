import { spawn, type ChildProcess } from "node:child_process";
import { expect, test } from "@playwright/test";
import { markdownBlocks, parseBlocks } from "@/components/catalog/blocks";
import fixture from "./fixture.json";
import { FAKE_AUTH_ORIGIN, sessionCookie } from "./harness";

// The production build, served by this spec on two private ports (parse-once on and off) against a private API double, so it can
// read each render's own timing line and no other spec's catalog log sees these requests.
// It shows what the unit tests cannot: React's request-scoped cache in a real Next server, between concurrent callers.
const ON = 3118;
const OFF = 3119;
const API_PORT = 3120;
const PROBLEM = "/problems/p4-premium-stages";
const LESSON = "/lessons/p2-t5-long";
const PREMIUM = /P4_SENTINEL_[A-Z_]+ premium/;
const COOKIES = { "signed-out": "", unentitled: cookie("unentitled"), entitled: cookie("entitled") } as const;
type Who = keyof typeof COOKIES;

function cookie(identity: "unentitled" | "entitled") {
   const { name, value } = sessionCookie(identity, "http://localhost");
   return `${name}=${value}`;
}

interface Line {
   route: string;
   pp?: number;
   reads: { k: string; s: number; ms: number }[];
}
interface Server {
   child: ChildProcess;
   output: () => string;
   /** Timing lines before this count belong to an earlier test. */
   skip: number;
   readonly lines: Line[];
}

async function start(port: number, env: Record<string, string>): Promise<Server> {
   const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
      env: {
         ...process.env,
         API_URL: `http://127.0.0.1:${API_PORT}`,
         CATALOG_PREVIEW_TOKEN: "",
         NEXT_PUBLIC_SUPABASE_URL: FAKE_AUTH_ORIGIN,
         NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key",
         NEXT_TELEMETRY_DISABLED: "1",
         ...env,
      },
   });
   let output = "";
   child.stdout!.on("data", (chunk: Buffer) => void (output += chunk.toString()));
   child.stderr!.on("data", (chunk: Buffer) => void (output += chunk.toString()));
   const server: Server = {
      child,
      output: () => output,
      skip: 0,
      get lines() {
         const found = output.replace(/\u001b\[[0-9;]*m/g, "").split("\n").filter((part) => part.startsWith('{"hp":1') && part.includes('"wall"') && part.endsWith("}"));
         return found.slice(this.skip).map((part) => JSON.parse(part) as Line);
      },
   };
   for (let attempt = 0; attempt < 120; attempt++) {
      if ((await fetch(`http://127.0.0.1:${port}/login`).catch(() => null))?.ok) return server;
      await new Promise((resolve) => setTimeout(resolve, 500));
   }
   throw new Error(`server on ${port} did not start`);
}

const get = async (port: number, path: string, who: Who, rsc = false) => {
   const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { "accept-encoding": "identity", ...(who === "signed-out" ? {} : { cookie: COOKIES[who] }), ...(rsc ? { RSC: "1" } : {}) } });
   return { status: response.status, text: await response.text() };
};
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const reset = (...servers: Server[]) => servers.forEach((server) => (server.skip += server.lines.length));
const settle = async (server: Server, count: number) => {
   for (let i = 0; i < 100 && server.lines.length < count; i++) await new Promise((resolve) => setTimeout(resolve, 100));
   expect(server.lines).toHaveLength(count);
};

test.describe.configure({ mode: "serial" });
let on: Server;
let off: Server;
let api: ChildProcess;
test.beforeAll(async () => {
   api = spawn(process.execPath, ["tests/e2e/catalog/fake-api.mjs", String(API_PORT)]);
   for (let attempt = 0; attempt < 40 && !(await fetch(`http://127.0.0.1:${API_PORT}/health`).catch(() => null))?.ok; attempt++) await new Promise((resolve) => setTimeout(resolve, 250));
   [on, off] = await Promise.all([start(ON, {}), start(OFF, { BODY_PARSE_ONCE: "off" })]);
});
test.afterAll(() => {
   api?.kill();
   on?.child.kill();
   off?.child.kill();
});

test("a Lesson is parsed once per block in every render, and again for the next request", async () => {
   for (let i = 0; i < 3; i++) await get(ON, LESSON, "signed-out");
   await get(OFF, LESSON, "signed-out");
   await settle(on, 3);
   await settle(off, 1);
   const lesson = fixture.items.find((entry) => entry.id === "lesson.p2-t5-long")!;
   const blocks = new Set(markdownBlocks(parseBlocks(lesson.body ?? "")).map((block) => block.text)).size;
   expect(on.lines.map((line) => line.pp), "each render parses each block once, whatever an earlier request did").toEqual([blocks, blocks, blocks]);
   expect(off.lines[0].pp, "with parse-once off the two coverage passes alone parse each block twice (the renderer's own parse is not counted)").toBeGreaterThan(blocks);
});

test("a Problem is parsed once per released block, so the early parse adds none", async () => {
   reset(on);
   await get(ON, PROBLEM, "entitled");
   await settle(on, 1);
   const released = fixture.items.find((entry) => entry.id === "problem.p4-premium-stages")!.sections!.map((section) => section.text);
   const blocks = new Set(released.flatMap((body) => markdownBlocks(parseBlocks(body)).map((block) => block.text))).size;
   expect(on.lines[0].pp).toBe(blocks);
});

test("concurrent callers each get only what they may read, and each render parses only its own released blocks", async () => {
   reset(on);
   const who: Who[] = ["signed-out", "entitled", "unentitled", "entitled", "signed-out", "unentitled"];
   const calls = Array.from({ length: 3 }, () => who).flat().map((w) => ({ w, path: PROBLEM }));
   const answers = await Promise.all(calls.map(({ w, path }) => get(ON, path, w).then((answer) => ({ w, ...answer }))));
   const rsc = await Promise.all(who.map((w) => get(ON, PROBLEM, w, true).then((answer) => ({ w, ...answer }))));
   await settle(on, calls.length + who.length);

   for (const answer of [...answers, ...rsc]) {
      expect(answer.status).toBe(200);
      if (answer.w === "entitled") expect(answer.text, "the entitled caller lost a released section").toMatch(PREMIUM);
      else expect(answer.text, `${answer.w} received Premium text`).not.toMatch(PREMIUM);
   }
   const counts = new Map<number | undefined, number>();
   for (const line of on.lines) counts.set(line.pp, (counts.get(line.pp) ?? 0) + 1);
   const entitled = who.filter((w) => w === "entitled").length * 4;
   const others = (who.length - who.filter((w) => w === "entitled").length) * 4;
   const [free, premium] = [...counts.keys()].sort((a, b) => a! - b!);
   expect(counts.size, "parse counts should be exactly one value per kind of caller").toBe(2);
   expect(free).toBeLessThan(premium!);
   expect([counts.get(free), counts.get(premium)]).toEqual([others, entitled]);
});

test("/related is read alongside the item, never waiting for it", async () => {
   reset(on);
   await Promise.all([get(ON, LESSON, "signed-out"), get(ON, PROBLEM, "entitled"), get(ON, LESSON, "unentitled")]);
   await settle(on, 3);
   for (const line of on.lines) {
      const item = line.reads.find((read) => read.k.startsWith("item:"))!;
      const related = line.reads.find((read) => read.k.startsWith("related:"))!;
      expect(related.s, "related waited for the item to answer").toBeLessThan(item.s + item.ms);
   }
});

test("the page text is the same with parse-once off", async () => {
   for (const [path, who] of [[PROBLEM, "entitled"], [PROBLEM, "signed-out"], [LESSON, "signed-out"]] as const) {
      const [a, b] = await Promise.all([get(ON, path, who), get(OFF, path, who)]);
      expect(text(a.text), `${path} as ${who}`).toBe(text(b.text));
   }
   expect(fixture.identities.entitled.entitled).toBe(true);
});
