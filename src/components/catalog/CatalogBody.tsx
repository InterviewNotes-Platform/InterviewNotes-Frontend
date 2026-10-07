import type { ComponentPropsWithoutRef, ElementType } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { KnowledgeAbout } from "@/components/lesson/KnowledgeAbout";
import { CopyCode } from "@/components/mdx/CopyCode";
import { codeName, languageLabel, parseFence, type FenceInfo } from "@/components/mdx/fence";
import { Mermaid } from "@/components/mdx/Mermaid";
import { Tip, type TipType } from "@/components/mdx/Tip";
import { TechnicalScroll } from "@/components/ui/technical-scroll";
import { plainHeading, type KnowledgeSupport } from "@/lib/catalog/lesson";
import { catalogHref, firstPartyPath } from "@/lib/catalog/routes";
import type { CatalogBody as CatalogBodyData, CatalogHeading } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { headingIds, parseBlocks, type Block, type CalloutKind } from "./blocks";
import { knowledgeCoverage, type KnowledgeCoverage } from "./knowledgeRefs";

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

/** A fence as authored: its info string's language and metadata, and the exact text between the fence lines. */
function fenceOf(node?: HastElement): (FenceInfo & { source: string }) | null {
   const code = node?.children[0];
   if (code?.type !== "element" || code.tagName !== "code") return null;
   const classes = Array.isArray(code.properties?.className) ? code.properties.className : [];
   const language = String(classes.find((name) => String(name).startsWith("language-")) ?? "").slice("language-".length);
   // The parser ends fenced text with one added "\n"; the fence content is what precedes it.
   const text = code.children.map((child) => (child.type === "text" ? child.value : "")).join("");
   return { ...parseFence(language, code.data?.meta), source: text.endsWith("\n") ? text.slice(0, -1) : text };
}

/** Styles a standard element, dropping react-markdown's `node` prop so it never reaches the DOM. */
function styled<Tag extends keyof React.JSX.IntrinsicElements>(tag: Tag, className: string) {
   const Element = tag as ElementType;
   return function Styled({ node, ...props }: ComponentPropsWithoutRef<Tag> & ExtraProps) {
      void node;
      return <Element className={className} {...props} />;
   };
}

const HEADING_STYLE = {
   h1: "mt-12 mb-4 text-title text-balance",
   h2: "mt-12 mb-4 text-section text-balance",
   h3: "mt-10 mb-3 text-subsection text-balance",
   h4: "mt-8 mb-2 text-body font-semibold",
} as const;

/**
 * A heading. When the API has a heading for its source line it carries that exact id and is a focus target for
 * the contents (tabIndex -1 is no tab stop); h2/h3 also offer a quiet anchor. The name stays the heading's own text.
 */
function heading(Tag: keyof typeof HEADING_STYLE, ids?: Map<number, CatalogHeading>) {
   const style = HEADING_STYLE[Tag];
   return function Heading({ node, children, ...props }: ComponentPropsWithoutRef<"h2"> & ExtraProps) {
      const found = ids?.get(node?.position?.start.line ?? 0);
      if (!found) return <Tag className={style} {...props}>{children}</Tag>;
      return (
         <Tag id={found.id} tabIndex={-1} aria-labelledby={`${found.id}_text`} className={cn(style, "group w-fit max-w-full scroll-mt-28")} {...props}>
            <span id={`${found.id}_text`}>{children}</span>
            {Tag === "h2" || Tag === "h3" ? (
               <a
                  href={`#${found.id}`}
                  aria-label={`Link to section: ${plainHeading(found.text)}`}
                  className="ml-2 rounded-sm text-muted-foreground no-underline opacity-0 hover:text-primary focus-visible:opacity-100 group-hover:opacity-100"
               >
                  #
               </a>
            ) : null}
         </Tag>
      );
   };
}

const components: Components = {
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
   // Assets are deferred (D-14); `markdown@1` has no images.
   img: () => null,
};

const LINK_STYLE = "text-primary underline underline-offset-4 decoration-primary/40 transition-micro hover:decoration-primary";
// A reference to Knowledge reads as a reference, not a link away: quiet, dotted, and distinct from LINK_STYLE.
const KNOWLEDGE_REF_STYLE =
   "text-foreground underline decoration-dotted decoration-muted-foreground underline-offset-4 transition-micro hover:text-primary hover:decoration-primary";

/** Intercepted at `pre`: <Mermaid /> emits a <div>, which is invalid inside <pre>. */
function codeBlock(adaptive: boolean): Components["pre"] {
   return function Pre({ node, children, ...props }) {
      const fence = fenceOf(node);
      if (fence?.language === "mermaid" && fence.source.trim()) {
         return <Mermaid chart={fence.source} adaptive={adaptive} figure={{ caption: fence.caption, alt: fence.alt }} />;
      }
      const label = fence ? languageLabel(fence.language) : null;
      const name = codeName(label, fence?.title);
      return (
         <div role="group" aria-label={name} className="my-6">
            <div className="flex items-center gap-3 rounded-t-lg border-b border-border bg-code-surface px-4 text-supporting text-muted-foreground">
               {label ? <span className="shrink-0 font-mono">{label}</span> : null}
               {fence?.title ? <span className="min-w-0 truncate">{fence.title}</span> : null}
               <CopyCode source={fence?.source ?? ""} label={label} />
            </div>
            <TechnicalScroll label={name} className="rounded-b-lg bg-code-surface">
               <pre
                  className="w-max min-w-full p-4 font-mono text-code [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[1em]"
                  {...props}
               >
                  {children}
               </pre>
            </TechnicalScroll>
         </div>
      );
   };
}

/**
 * In a preview, a link to any InterviewNotes host stays on this deployment instead of reaching another one.
 * Reading mode never prefetches a catalog link: that makes the server read every target in view.
 */
function anchor(stayOnDeployment: boolean, reading: boolean, aboutAt?: (offset: number) => KnowledgeSupport | undefined): Components["a"] {
   return function Anchor({ node, href, children }) {
      void node;
      if (!href) return <span>{children}</span>;
      const internal = href.startsWith("ref:")
         ? catalogHref(href.slice(4))
         : stayOnDeployment
           ? firstPartyPath(href)
           : null;
      if (internal) {
         const knowledge = reading && href.startsWith("ref:knowledge.");
         const offset = node?.position?.start.offset;
         const about = knowledge && aboutAt && offset !== undefined ? aboutAt(offset) : undefined;
         const link = (
            <Link
               href={internal}
               prefetch={reading ? false : undefined}
               data-reference={knowledge ? "knowledge" : undefined}
               className={knowledge ? KNOWLEDGE_REF_STYLE : LINK_STYLE}
            >
               {children}
            </Link>
         );
         return about ? (
            <>
               {link}
               <KnowledgeAbout {...about} />
            </>
         ) : (
            link
         );
      }
      if (href.startsWith("#")) return <a href={href} className={LINK_STYLE}>{children}</a>;
      return <a href={href} className={LINK_STYLE} target="_blank" rel="noopener noreferrer">{children}</a>;
   };
}

type Knowledge = { coverage: KnowledgeCoverage; support: ReadonlyMap<string, KnowledgeSupport> };

interface BlocksProps {
   blocks: Block[];
   stayOnDeployment: boolean;
   reading: boolean;
   ids: ReturnType<typeof headingIds>;
   /** The Lesson's contextual Knowledge: which links carry a panel, and what each shows. */
   knowledge: Knowledge | null;
}

/** What a link at a source offset of this block shows in context, if the pre-pass marked it. */
function aboutIn(block: Block, knowledge: Knowledge | null) {
   const marked = block.type === "markdown" ? knowledge?.coverage.at.get(block) : undefined;
   return marked && ((offset: number) => knowledge?.support.get(marked.get(offset) ?? ""));
}

function Blocks({ blocks, stayOnDeployment, reading, ids, knowledge }: BlocksProps) {
   return (
      <>
         {blocks.map((block, index) =>
            block.type === "markdown" ? (
               <ReactMarkdown
                  key={index}
                  remarkPlugins={[remarkGfm]}
                  components={{
                     ...components,
                     h1: heading("h1", ids?.get(block)),
                     h2: heading("h2", ids?.get(block)),
                     h3: heading("h3", ids?.get(block)),
                     h4: heading("h4", ids?.get(block)),
                     pre: codeBlock(reading),
                     a: anchor(stayOnDeployment, reading, aboutIn(block, knowledge)),
                  }}
                  urlTransform={safeUrl}
                  skipHtml
               >
                  {block.text}
               </ReactMarkdown>
            ) : (
               <div key={index} role="note" data-callout={block.kind} className="[&_p:last-child]:mb-0">
                  <Tip type={CALLOUTS[block.kind].type} title={CALLOUTS[block.kind].title}>
                     <Blocks blocks={block.children} stayOnDeployment={stayOnDeployment} reading={reading} ids={ids} knowledge={knowledge} />
                  </Tip>
               </div>
            )
         )}
      </>
   );
}

export interface ReadingMode {
   headings: readonly CatalogHeading[];
   /** A Lesson's related Knowledge by id: its first reference to each offers the summary in context (S-KNW-2). */
   knowledge?: ReadonlyMap<string, KnowledgeSupport>;
}

interface CatalogBodyProps {
   body: CatalogBodyData;
   stayOnDeployment?: boolean;
   /** Reading mode (Lesson, Problem): the API's headings give the rendered headings their ids; Knowledge refs and diagrams are set apart and links never prefetch. */
   reading?: ReadingMode;
}

/**
 * The one renderer for catalog bodies: a Lesson body and every Knowledge/Problem section.
 * It renders whatever the API already authorized and holds no access logic of its own.
 */
export function CatalogBody({ body, stayOnDeployment = false, reading }: CatalogBodyProps) {
   if (body.format !== "markdown@1") return null;
   const blocks = parseBlocks(body.text);
   const ids = reading ? headingIds(blocks, reading.headings) : null;
   const knowledge = reading?.knowledge ? { coverage: knowledgeCoverage(blocks, reading.knowledge), support: reading.knowledge } : null;
   return (
      <div data-catalog-body="">
         <Blocks blocks={blocks} stayOnDeployment={stayOnDeployment} reading={Boolean(reading)} ids={ids} knowledge={knowledge} />
      </div>
   );
}
