import type { ComponentPropsWithoutRef, ElementType } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mermaid } from "@/components/mdx/Mermaid";
import { Tip, type TipType } from "@/components/mdx/Tip";
import { catalogHref, firstPartyPath } from "@/lib/catalog/routes";
import type { CatalogBody as CatalogBodyData } from "@/lib/catalog/types";
import { parseBlocks, type Block, type CalloutKind } from "./blocks";

type HastElement = NonNullable<ExtraProps["node"]>;

const CALLOUTS: Record<CalloutKind, { type: TipType; title: string }> = {
   note: { type: "info", title: "Note" },
   tip: { type: "general", title: "Tip" },
   warning: { type: "warning", title: "Warning" },
};

/** `markdown@1` allows only `#anchor`, `https://` and `ref:<id>` links; drop everything else. */
function safeUrl(url: string): string {
   if (url.startsWith("#") || /^https:\/\//i.test(url)) return url;
   return url.startsWith("ref:") && catalogHref(url.slice(4)) ? url : "";
}

/** The diagram source when a <pre> wraps a single ```mermaid fence, else null. */
function mermaidSource(node?: HastElement): string | null {
   const code = node?.children[0];
   if (code?.type !== "element" || code.tagName !== "code") return null;
   const classes = code.properties?.className;
   if (!Array.isArray(classes) || !classes.includes("language-mermaid")) return null;
   const text = code.children.map((child) => (child.type === "text" ? child.value : "")).join("");
   return text.trim() ? text : null;
}

/** Styles a standard element, dropping react-markdown's `node` prop so it never reaches the DOM. */
function styled<Tag extends keyof React.JSX.IntrinsicElements>(tag: Tag, className: string) {
   const Element = tag as ElementType;
   return function Styled({ node, ...props }: ComponentPropsWithoutRef<Tag> & ExtraProps) {
      void node;
      return <Element className={className} {...props} />;
   };
}

const components: Components = {
   h1: styled("h1", "text-3xl font-bold mt-8 mb-4 text-foreground"),
   h2: styled("h2", "text-2xl font-bold mt-8 mb-3 text-foreground border-b border-border pb-2"),
   h3: styled("h3", "text-xl font-semibold mt-6 mb-2 text-foreground"),
   h4: styled("h4", "text-lg font-semibold mt-4 mb-2 text-foreground"),
   p: styled("p", "mb-4 leading-7 text-foreground/90"),
   ul: styled("ul", "mb-4 ml-6 list-disc space-y-1.5 text-foreground/90"),
   ol: styled("ol", "mb-4 ml-6 list-decimal space-y-1.5 text-foreground/90"),
   blockquote: styled("blockquote", "border-l-4 border-primary/40 pl-4 italic text-muted-foreground my-4"),
   table: ({ node, ...props }) => {
      void node;
      return <div className="overflow-x-auto my-6"><table className="w-full border-collapse text-sm" {...props} /></div>;
   },
   th: styled("th", "border border-border px-4 py-2 text-left font-semibold text-foreground"),
   td: styled("td", "border border-border px-4 py-2 text-foreground/90"),
   code: ({ node, className, children, ...props }) => {
      void node;
      const style = className ?? "bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground";
      return <code className={style} {...props}>{children}</code>;
   },
   // Intercepted at `pre`: <Mermaid /> emits a <div>, which is invalid inside <pre>.
   pre: ({ node, children, ...props }) => {
      const chart = mermaidSource(node);
      if (chart !== null) return <Mermaid chart={chart} />;
      return <pre className="bg-muted rounded-lg p-4 overflow-x-auto my-4 text-sm font-mono" {...props}>{children}</pre>;
   },
   // Assets are deferred (D-14); `markdown@1` has no images.
   img: () => null,
};

const LINK_STYLE = "text-primary underline underline-offset-4 hover:text-primary/80 transition-colors";

/** In a preview, a link to any InterviewNotes host stays on this deployment instead of reaching another one. */
function anchor(stayOnDeployment: boolean): Components["a"] {
   return function Anchor({ node, href, children }) {
      void node;
      if (!href) return <span>{children}</span>;
      const internal = href.startsWith("ref:")
         ? catalogHref(href.slice(4))
         : stayOnDeployment
           ? firstPartyPath(href)
           : null;
      if (internal) return <Link href={internal} className={LINK_STYLE}>{children}</Link>;
      if (href.startsWith("#")) return <a href={href} className={LINK_STYLE}>{children}</a>;
      return <a href={href} className={LINK_STYLE} target="_blank" rel="noopener noreferrer">{children}</a>;
   };
}

function Blocks({ blocks, stayOnDeployment }: { blocks: Block[]; stayOnDeployment: boolean }) {
   return (
      <>
         {blocks.map((block, index) =>
            block.type === "markdown" ? (
               <ReactMarkdown
                  key={index}
                  remarkPlugins={[remarkGfm]}
                  components={{ ...components, a: anchor(stayOnDeployment) }}
                  urlTransform={safeUrl}
                  skipHtml
               >
                  {block.text}
               </ReactMarkdown>
            ) : (
               <div key={index} role="note" data-callout={block.kind}>
                  <Tip type={CALLOUTS[block.kind].type} title={CALLOUTS[block.kind].title}>
                     <Blocks blocks={block.children} stayOnDeployment={stayOnDeployment} />
                  </Tip>
               </div>
            )
         )}
      </>
   );
}

/**
 * The one renderer for catalog bodies: a Lesson body and every Knowledge/Problem section.
 * It renders whatever the API already authorized and holds no access logic of its own.
 */
export function CatalogBody({ body, stayOnDeployment = false }: { body: CatalogBodyData; stayOnDeployment?: boolean }) {
   if (body.format !== "markdown@1") return null;
   return (
      <div className="markdown-content">
         <Blocks blocks={parseBlocks(body.text)} stayOnDeployment={stayOnDeployment} />
      </div>
   );
}
