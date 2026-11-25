import { Fragment, type ReactNode } from "react";

type Block = Record<string, unknown>;

/** `**bold**`, `*italic*` and `` `code` `` as elements; everything else is text. Nothing is parsed as markup or HTML, so a prompt cannot inject any. */
function inline(text: string): ReactNode[] {
   const nodes: ReactNode[] = [];
   const pattern = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
   let last = 0;
   let key = 0;
   for (const match of text.matchAll(pattern)) {
      if (match.index > last) nodes.push(text.slice(last, match.index));
      const token = match[0];
      if (token.startsWith("**")) nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
      else if (token.startsWith("`")) nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
      else nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
      last = match.index + token.length;
   }
   if (last < text.length) nodes.push(text.slice(last));
   return nodes;
}

function paragraphs(text: string, keyBase: string): ReactNode[] {
   return text
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk, index) => {
         const lines = chunk.split("\n");
         const key = `${keyBase}-${index}`;
         if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
            return (
               <ul key={key} className="my-3 list-disc space-y-1 pl-5">
                  {lines.map((line, i) => (
                     <li key={i}>{inline(line.replace(/^\s*[-*]\s+/, ""))}</li>
                  ))}
               </ul>
            );
         }
         return (
            <p key={key} className="my-3">
               {lines.map((line, i) => (
                  <Fragment key={i}>
                     {i > 0 ? <br /> : null}
                     {inline(line)}
                  </Fragment>
               ))}
            </p>
         );
      });
}

function render(blocks: Block[], keyBase: string): ReactNode[] {
   return blocks.flatMap((block, index) => {
      const key = `${keyBase}-${index}`;
      if (block.type === "markdown" && typeof block.text === "string") return paragraphs(block.text, key);
      if ((block.type === "callout" || block.type === "part") && Array.isArray(block.children)) return render(block.children.filter((child): child is Block => typeof child === "object" && child !== null), key);
      return [];
   });
}

/**
 * The prompt of the Problem (`ChallengeOut.prompt`, "the reader's block shape, the givens only"), as plain text with paragraphs, lists and inline
 * emphasis. A block of a shape this does not know is skipped, never rendered as HTML.
 */
export function PromptBlocks({ blocks }: { blocks: readonly object[] }) {
   // Read defensively whatever the typed contract says: an unknown block shape renders nothing rather than markup.
   return <div className="text-body text-foreground">{render(blocks as Block[], "p")}</div>;
}
