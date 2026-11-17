// P8-RSP-01 diagnostic, never shipped: merge rsp-measure.mjs result files into one baseline document and print a
// Markdown table (median / p75 / worst per journey and leg). Used for RSP-02 before/after comparisons:
//
//   node scripts/perf/rsp-summarize.mjs --out baseline.json before-local.json before-prod.json ...
import { readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--out");
const out = outIdx >= 0 ? argv[outIdx + 1] : null;
const files = outIdx >= 0 ? argv.filter((_, i) => i !== outIdx && i !== outIdx + 1) : argv;

const percentile = (values, p) => {
   const v = values.filter(Number.isFinite).sort((a, b) => a - b);
   if (!v.length) return null;
   const idx = (v.length - 1) * p;
   const lo = Math.floor(idx);
   return Math.round(v[lo] + (v[Math.min(lo + 1, v.length - 1)] - v[lo]) * (idx - lo));
};

const environments = files.map((file) => {
   const d = JSON.parse(readFileSync(file, "utf8"));
   return {
      env: d.env,
      base: d.base,
      label: d.label,
      started: d.started,
      finished: d.finished,
      runsPerJourney: d.runsPerJourney,
      profile: d.profile,
      warmup: d.warmup,
      journeys: d.journeys.map((j) => {
         const ok = j.runs.filter((r) => r.forward);
         const legs = ["forward", "back", "historyForward", "repeat"].filter((leg) => ok.some((r) => r[leg]));
         const leg = (name) => {
            const rows = ok.map((r) => r[name]).filter(Boolean);
            const s = (k) => ({ median: percentile(rows.map((r) => r[k]), 0.5), p75: percentile(rows.map((r) => r[k]), 0.75), worst: percentile(rows.map((r) => r[k]), 1) });
            const navRsc = rows.map((r) => r.navRequests.find((n) => /_rsc/.test(n.url) || n.type === "document")).filter(Boolean);
            return {
               n: rows.length,
               navigationTypes: [...new Set(rows.map((r) => r.navigationType))],
               feedbackMs: s("clickToFeedbackMs"),
               contentMs: s("clickToContentMs"),
               usableMs: s("clickToUsableMs"),
               navRequest: navRsc.length
                  ? { url: navRsc[0].url, headersMs: { median: percentile(navRsc.map((n) => n.headersMs), 0.5) }, endMs: { median: percentile(navRsc.map((n) => n.endMs), 0.5), worst: percentile(navRsc.map((n) => n.endMs), 1) }, transferMedian: percentile(navRsc.map((n) => n.transfer), 0.5), sampleHeaders: navRsc[0].headers }
                  : null,
               requestCountMedian: percentile(rows.map((r) => r.requestCount), 0.5),
               scriptRequestsMedian: percentile(rows.map((r) => r.scriptRequests.length), 0.5),
               longTaskTotalMsWorst: percentile(rows.map((r) => r.longTasks.totalMs), 1),
               serverApiCallsMedian: rows[0]?.serverApiCalls ? percentile(rows.map((r) => r.serverApiCalls.length), 0.5) : undefined,
               timeouts: rows.filter((r) => r.timedOut).length,
            };
         };
         return {
            id: j.id,
            name: j.name,
            notExercised: j.notExercised,
            from: ok[0]?.from ?? null,
            clicked: ok[0]?.clicked ?? null,
            sourceDocumentTtfbMs: { median: percentile(ok.map((r) => r.source.documentTtfbMs), 0.5), worst: percentile(ok.map((r) => r.source.documentTtfbMs), 1) },
            prefetchBeforeClick: [...new Set(ok.flatMap((r) => r.source.prefetchBeforeClick.map((p) => p.url)))],
            legs: Object.fromEntries(legs.map((name) => [name, leg(name)])),
         };
      }),
   };
});

const lines = ["| Env | Journey | Leg | Nav type | n | Feedback med/p75/worst | Content med/p75/worst | Usable med/p75/worst |", "|---|---|---|---|---|---|---|---|"];
for (const e of environments)
   for (const j of e.journeys) {
      if (j.notExercised) {
         lines.push(`| ${e.env} | ${j.id} ${j.name} | — | — | 0 | NOT EXERCISED: ${j.notExercised} | | |`);
         continue;
      }
      for (const [name, l] of Object.entries(j.legs)) {
         const f = (m) => `${m.median} / ${m.p75} / ${m.worst}`;
         lines.push(`| ${e.env} | ${j.id} ${j.name} | ${name} | ${l.navigationTypes.join(",")} | ${l.n} | ${f(l.feedbackMs)} | ${f(l.contentMs)} | ${f(l.usableMs)} |`);
      }
   }
console.log(lines.join("\n"));
if (out) writeFileSync(out, JSON.stringify({ tool: "P8-RSP-01 rsp-summarize.mjs", generated: new Date().toISOString(), environments }, null, 2));
