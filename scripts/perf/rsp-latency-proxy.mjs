// P8-RSP-01 diagnostic, never shipped: a local HTTP proxy between `next start` and the e2e fake API.
// It adds a fixed delay to every proxied request (default 0) and logs when each request started and ended,
// so the order and overlap of the frontend server's API calls for one navigation can be read back.
//
//   node scripts/perf/rsp-latency-proxy.mjs <listenPort> <upstreamOrigin>
//   PUT  /__rsp/delay?ms=250   set the per-request delay
//   GET  /__rsp/log            the request log ({ path, start, end } in epoch ms; query keys only)
//   DELETE /__rsp/log          clear the log
//
// Local only: it binds 127.0.0.1 and forwards to the given upstream, which must be a local fake API.
import http from "node:http";

const [port, upstream] = [Number(process.argv[2]), process.argv[3]];
if (!port || !upstream || !/^http:\/\/127\.0\.0\.1:\d+$/.test(upstream)) {
   console.error("usage: rsp-latency-proxy.mjs <port> http://127.0.0.1:<upstreamPort>");
   process.exit(2);
}

let delayMs = Number(process.env.RSP_DELAY_MS ?? 0);
const log = [];

const keysOnly = (url) => {
   const u = new URL(url, "http://x");
   const keys = [...new Set(u.searchParams.keys())].sort();
   return keys.length ? `${u.pathname}?${keys.join("&")}` : u.pathname;
};

http
   .createServer((req, res) => {
      const u = new URL(req.url, "http://x");
      if (u.pathname === "/__rsp/delay" && req.method === "PUT") {
         delayMs = Number(u.searchParams.get("ms") ?? 0);
         res.writeHead(200, { "content-type": "application/json" });
         return res.end(JSON.stringify({ delayMs }));
      }
      if (u.pathname === "/__rsp/log") {
         if (req.method === "DELETE") log.length = 0;
         res.writeHead(200, { "content-type": "application/json" });
         return res.end(JSON.stringify(req.method === "DELETE" ? [] : log));
      }
      const entry = { method: req.method, path: keysOnly(req.url), start: Date.now(), end: null, status: null, delayMs };
      log.push(entry);
      const forward = () => {
         const up = http.request(upstream + req.url, { method: req.method, headers: { ...req.headers, host: new URL(upstream).host } }, (upRes) => {
            res.writeHead(upRes.statusCode, upRes.headers);
            upRes.pipe(res);
            upRes.on("end", () => {
               entry.end = Date.now();
               entry.status = upRes.statusCode;
            });
         });
         up.on("error", () => {
            entry.end = Date.now();
            entry.status = 502;
            res.writeHead(502);
            res.end();
         });
         req.pipe(up);
      };
      // Health checks stay undelayed so a harness can poll readiness.
      if (delayMs > 0 && u.pathname !== "/health") setTimeout(forward, delayMs);
      else forward();
   })
   .listen(port, "127.0.0.1", () => console.log(`rsp-latency-proxy :${port} -> ${upstream} delay=${delayMs}ms`));
