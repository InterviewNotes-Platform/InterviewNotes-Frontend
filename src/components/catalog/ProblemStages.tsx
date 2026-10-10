import type { ReactNode } from "react";
import { linkDisplay } from "@/lib/catalog/linkDisplay";
import { ADDITIONAL_MATERIAL_LABEL, CHALLENGE_LABEL, CONTROL_LABEL, GROUP_LABEL, REVIEW_INTRODUCTION, ROLE_LABEL, STAGE_WITHHELD, YOURS_FIRST } from "@/lib/catalog/positionCopy";
import { problemSectionHeading } from "@/lib/catalog/problem";
import type { ProblemComposition, ProblemRoleGroup, ProblemStage } from "@/lib/catalog/problemSpine";
import type { CatalogSection } from "@/lib/catalog/types";
import { ProblemReveal } from "@/components/problem/ProblemReveal";
import { cn } from "@/lib/utils";
import { CatalogBody } from "./CatalogBody";
import { PremiumMark } from "./EntryRow";

// Problem sections carry no API headings; reading mode still gives diagrams their natural size and keeps links from prefetching.
const READING = { headings: [] } as const;
const EYEBROW = "m-0 text-supporting font-semibold uppercase tracking-wide text-muted-foreground";
const HEADING = { 3: "mt-8 mb-3 text-subsection text-balance", 4: "mt-6 mb-2 text-body font-semibold text-balance" } as const;

// Unit groups: a list control shows their headings, then each unit opens on its own (S-RVL-1).
const LIST_ROLES = new Set(["clarifications", "assumptions", "units", "followUps", "alternatives", "rubric"]);

type Level = 3 | 4;
type Body = (section: CatalogSection, level: Level) => ReactNode;
/** What sits between a unit's heading and its control: its link line, if the unit has one. */
type Note = (section: CatalogSection) => ReactNode;

const headingOf = (section: CatalogSection) => problemSectionHeading(section) ?? ADDITIONAL_MATERIAL_LABEL;

function SectionHeading({ section, level, id }: { section: CatalogSection; level: Level; id?: string }) {
   const Tag = `h${level}` as const;
   return (
      <Tag id={id} tabIndex={id ? -1 : undefined} className={cn(HEADING[level], id && "scroll-mt-28 rounded-sm")}>
         {headingOf(section)}
      </Tag>
   );
}

/**
 * Each section, its body open and its own anchor: under its own heading in a stage reference or a surface, or `untitled`
 * when a heading is already given (the challenge, hints, expectations, mistakes).
 */
function Sections({ sections, level, body, untitled = false }: { sections: CatalogSection[]; level: Level; body: Body; untitled?: boolean }) {
   return sections.map((section) => (
      <section key={section.id} id={section.id} className="scroll-mt-28">
         {untitled ? null : <SectionHeading section={section} level={level} />}
         {body(section, level)}
      </section>
   ));
}

/** A unit: its heading outside the disclosure (the deep-link target, which takes focus on arrival), then its own closed body. */
function Units({ role, sections, level, body, note }: { role: string; sections: CatalogSection[]; level: Level; body: Body; note?: Note }) {
   const label = role === "clarifications" ? CONTROL_LABEL.clarification : CONTROL_LABEL.unit;
   return sections.map((section) => (
      <div key={section.id}>
         <SectionHeading section={section} level={level} id={section.id} />
         {note?.(section)}
         <ProblemReveal unit={section.id} label={label} context={`: ${headingOf(section)}`}>
            {body(section, level)}
         </ProblemReveal>
      </div>
   ));
}

const LIST_LABEL: Partial<Record<string, string>> = {
   clarifications: CONTROL_LABEL.clarifications,
   assumptions: CONTROL_LABEL.assumptions,
   units: CONTROL_LABEL.units,
   followUps: CONTROL_LABEL.followUps,
};

/** A unit's link line (spec §6.5): a withheld one carries the premium mark, like a stage's access indication. */
function LinkLine({ section, released }: { section: CatalogSection; released: CatalogSection[] }) {
   const { text, withheld } = linkDisplay(section, released);
   if (!text) return null;
   return (
      <p className="mt-1 mb-0 flex flex-wrap items-center gap-2 text-supporting text-muted-foreground">
         {withheld ? <PremiumMark /> : null}
         <span>{text}</span>
      </p>
   );
}

/** Frame's pause before its controls (S-CLR-2): shown when Frame has a clarification, an assumption or a reference to compare. */
const hasQuestionsToCompare = (stage: ProblemStage) =>
   stage.position === "frame" && stage.groups.some(({ role }) => role === "clarifications" || role === "assumptions" || role === "stageReference");

/** An interview stage's role groups, in presentation order: hints quieter, then each reveal closed (§9.3). */
function StageGroups({ stage, body, released }: { stage: ProblemStage; body: Body; released: CatalogSection[] }) {
   const yoursFirst = hasQuestionsToCompare(stage) ? <p key="yours-first" className="mt-6 mb-0 text-body text-pretty">{YOURS_FIRST}</p> : null;
   const groups = stage.groups.map(({ role, sections }) => {
      if (role === "challenge") {
         return (
            <div key={role} className="mt-8">
               <h3 className="mt-0 mb-3 text-subsection text-balance">{CHALLENGE_LABEL}</h3>
               <Sections sections={sections} level={3} body={body} untitled />
            </div>
         );
      }
      if (role === "hints") {
         return (
            <ProblemReveal key={role} label={CONTROL_LABEL.hints} context={` for ${stage.label}`} quiet>
               <Sections sections={sections} level={3} body={body} untitled />
            </ProblemReveal>
         );
      }
      if (LIST_ROLES.has(role)) {
         return (
            <ProblemReveal key={role} label={LIST_LABEL[role] ?? CONTROL_LABEL.stageReference(stage.label)}>
               <Units
                  role={role}
                  sections={sections}
                  level={3}
                  body={body}
                  note={role === "assumptions" ? (section) => <LinkLine section={section} released={released} /> : undefined}
               />
            </ProblemReveal>
         );
      }
      const label = stage.position === "frame" ? CONTROL_LABEL.frameReference : CONTROL_LABEL.stageReference(stage.label);
      return (
         <ProblemReveal key={role} label={label}>
            <Sections sections={sections} level={3} body={body} />
         </ProblemReveal>
      );
   });
   // Directly after the challenge, or first when Frame has none released.
   const after = stage.groups[0]?.role === "challenge" ? 1 : 0;
   return yoursFirst ? [...groups.slice(0, after), yoursFirst, ...groups.slice(after)] : groups;
}

/** What a review surface's one control opens: its groups, labelled ones as h3 with their units as h4 (S-AX-1). */
function SurfaceGroup({ group: { role, sections }, body }: { group: ProblemRoleGroup; body: Body }) {
   const label = ROLE_LABEL[role];
   if (!label) return <Sections sections={sections} level={3} body={body} />;
   return (
      <div>
         <h3 className={HEADING[3]}>{label}</h3>
         {LIST_ROLES.has(role) ? (
            <Units role={role} sections={sections} level={4} body={body} />
         ) : role === "mistakes" ? (
            <ProblemReveal label={CONTROL_LABEL.mistakes}>
               <Sections sections={sections} level={3} body={body} untitled />
            </ProblemReveal>
         ) : (
            <Sections sections={sections} level={3} body={body} untitled />
         )}
      </div>
   );
}

function surfaceControl(stage: ProblemStage) {
   if (stage.position === "self_review") return CONTROL_LABEL.selfReview;
   if (stage.groups.some(({ role }) => role === "reference")) return CONTROL_LABEL.referenceSolution;
   return stage.groups.some(({ role }) => role === "alternatives") ? CONTROL_LABEL.alternatives : CONTROL_LABEL.stageReference(stage.label);
}

/** A stage or surface band: its anchor (the outline's focus target), step cue and h2 name, then its line. */
function Band({ stage, first, children }: { stage: ProblemStage; first: boolean; children: ReactNode }) {
   return (
      <section aria-labelledby={`${stage.id}_title`} className={cn(!first && "mt-14 border-t border-border pt-10")}>
         <div id={stage.id} tabIndex={-1} className="scroll-mt-28 rounded-sm">
            {stage.step ? <p className={cn(EYEBROW, "mb-1")}>{`Step ${stage.step.position} of ${stage.step.total}`}</p> : null}
            <h2 id={`${stage.id}_title`} className="m-0 text-section text-balance">
               {stage.label}
            </h2>
         </div>
         {stage.intent ? <p className="mt-2 mb-0 text-body text-pretty text-muted-foreground">{stage.intent}</p> : null}
         {children}
      </section>
   );
}

/** "All" only when nothing in the stage was released to this caller, a hint included; else "some" (S-ENT-1a). */
function AccessIndication({ stage }: { stage: ProblemStage }) {
   const all = stage.groups.length === 0;
   return (
      <p className="mt-3 mb-0 flex flex-wrap items-center gap-2 text-supporting text-muted-foreground">
         <PremiumMark />
         <span>{all ? STAGE_WITHHELD.all : STAGE_WITHHELD.some}</span>
      </p>
   );
}

/**
 * The composed Problem, challenge-first: the Interview stages, then the Review surfaces, then any material with no usable
 * position. Only the challenge is open; every other released section is in the HTML behind a closed native reveal.
 */
export function ProblemStages({ composition, stayOnDeployment }: { composition: ProblemComposition; stayOnDeployment: boolean }) {
   const { interview, review, neutral } = composition;
   const released = [...interview, ...review, ...(neutral ? [neutral] : [])].flatMap(({ groups }) => groups.flatMap(({ sections }) => sections));
   // An authored heading renders below the heading that contains it, and never above h6 (S-AX-2).
   const body: Body = (section, level) => (
      <CatalogBody key={section.id} body={section.body} stayOnDeployment={stayOnDeployment} reading={READING} headingOffset={level} />
   );

   return (
      <>
         {interview.length > 0 ? (
            <section aria-labelledby="problem_interview" className="mt-12">
               <p id="problem_interview" className={cn(EYEBROW, "mb-6")}>
                  {GROUP_LABEL.interview}
               </p>
               {interview.map((stage, index) => (
                  <Band key={stage.id} stage={stage} first={index === 0}>
                     {stage.withheld ? <AccessIndication stage={stage} /> : null}
                     <StageGroups stage={stage} body={body} released={released} />
                  </Band>
               ))}
            </section>
         ) : null}
         {review.length > 0 ? (
            <section aria-labelledby="problem_review" className="mt-16 border-t-2 border-border pt-10">
               <p id="problem_review" className={cn(EYEBROW, "mb-2")}>
                  {GROUP_LABEL.review}
               </p>
               <p className="mt-0 mb-8 text-body text-pretty text-muted-foreground">{REVIEW_INTRODUCTION}</p>
               {review.map((stage, index) => (
                  <Band key={stage.id} stage={stage} first={index === 0}>
                     <ProblemReveal label={surfaceControl(stage)}>
                        {stage.groups.map((group) => (
                           <SurfaceGroup key={group.role} group={group} body={body} />
                        ))}
                     </ProblemReveal>
                  </Band>
               ))}
            </section>
         ) : null}
         {neutral ? (
            <div className={cn(interview.length + review.length > 0 ? "mt-16 border-t border-border pt-10" : "mt-12")}>
               <Band stage={neutral} first>
                  <ProblemReveal label={CONTROL_LABEL.neutral}>
                     <Sections sections={neutral.groups.flatMap(({ sections }) => sections)} level={3} body={body} />
                  </ProblemReveal>
               </Band>
            </div>
         ) : null}
      </>
   );
}
