import type { ComponentPropsWithoutRef, ElementType } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mermaid } from "@/components/mdx/Mermaid";
import { Tip, type TipType } from "@/components/mdx/Tip";
import { TechnicalScroll } from "@/components/ui/technical-scroll";
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
   h1: styled("h1", "mt-12 mb-4 text-title text-balance"),
   h2: styled("h2", "mt-12 mb-4 text-section text-balance"),
   h3: styled("h3", "mt-10 mb-3 text-subsection text-balance"),
   h4: styled("h4", "mt-8 mb-2 text-body font-semibold"),
   p: styled("p", "mb-5 text-body text-pretty"),
   ul: styled("ul", "mb-5 ml-6 list-disc space-y-2 text-body marker:text-muted-foreground"),
   ol: styled("ol", "mb-5 ml-6 list-decimal space-y-2 text-body marker:text-muted-foreground"),
   blockquote: styled("blockquote", "my-6 border-l-2 border-border pl-5 text-body text-muted-foreground"),
   table: ({ node, ...props }) => {
      void node;
      return (
         <TechnicalScroll label="Table" className="my-6">
            <table className="w-full border-collapse text-supporting" {...props} />
         </TechnicalScroll>
      );
   },
   th: styled("th", "border-b border-border bg-surface px-3 py-2 text-left align-bottom font-semibold"),
   td: styled("td", "border-b border-border px-3 py-2 align-top"),
   code: ({ node, className, children, ...props }) => {
      void node;
      const style = className ?? "rounded-sm bg-code-surface px-1.5 py-0.5 font-mono text-[0.875em]";
      return <code className={style} {...props}>{children}</code>;
   },
   // Intercepted at `pre`: <Mermaid /> emits a <div>, which is invalid inside <pre>.
   pre: ({ node, children, ...props }) => {
      const chart = mermaidSource(node);
      if (chart !== null) return <Mermaid chart={chart} />;
      return (
         <TechnicalScroll label="Code" className="my-6 rounded-lg bg-code-surface">
            <pre
               className="w-max min-w-full p-4 font-mono text-code [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[1em]"
               {...props}
            >
               {children}
            </pre>
         </TechnicalScroll>
      );
   },
   // Assets are deferred (D-14); `markdown@1` has no images.
   img: () => null,
};

const LINK_STYLE = "text-primary underline underline-offset-4 decoration-primary/40 transition-micro hover:decoration-primary";

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
               <div key={index} role="note" data-callout={block.kind} className="[&_p:last-child]:mb-0">
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
      <div>
         <Blocks blocks={parseBlocks(body.text)} stayOnDeployment={stayOnDeployment} />
      </div>
   );
}
