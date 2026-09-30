export type CalloutKind = "note" | "tip" | "warning";

export type Block =
   | { type: "markdown"; text: string }
   | { type: "callout"; kind: CalloutKind; children: Block[] };

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const CALLOUT_OPEN =
   /^ {0,3}:::[ \t]*callout[ \t]+kind=(?:(note|tip|warning)|"(note|tip|warning)")[ \t]*$/;
const DIRECTIVE_CLOSE = /^ {0,3}:::[ \t]*$/;

/**
 * Splits a `markdown@1` body on the backend's `::: callout kind=<kind>` fences, which
 * remark-directive cannot parse. Fence detection mirrors the backend body scanner: lines
 * inside fenced code are literal, so a callout example in a code block stays code.
 */
export function parseBlocks(text: string): Block[] {
   const root: Block[] = [];
   const open: { kind: CalloutKind; children: Block[] }[] = [];
   let buffer: string[] = [];
   let fence: string | null = null;

   const target = () => (open.length ? open[open.length - 1].children : root);
   const flush = () => {
      const chunk = buffer.join("\n");
      buffer = [];
      if (chunk.trim()) target().push({ type: "markdown", text: chunk });
   };
   const close = () => {
      const { kind, children } = open.pop()!;
      target().push({ type: "callout", kind, children });
   };

   for (const line of text.split("\n")) {
      const fenceLine = FENCE.exec(line);
      if (fence !== null) {
         buffer.push(line);
         if (fenceLine && fenceLine[1].startsWith(fence) && !fenceLine[2].trim()) fence = null;
         continue;
      }
      if (fenceLine) {
         fence = fenceLine[1];
         buffer.push(line);
         continue;
      }
      const opened = CALLOUT_OPEN.exec(line);
      if (opened) {
         flush();
         open.push({ kind: (opened[1] ?? opened[2]) as CalloutKind, children: [] });
      } else if (open.length && DIRECTIVE_CLOSE.test(line)) {
         flush();
         close();
      } else {
         buffer.push(line);
      }
   }
   flush();
   while (open.length) close();
   return root;
}
