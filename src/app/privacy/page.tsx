import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { PageContainer, ReadingColumn } from "@/components/layout/PageContainer";
import { aiEnabled } from "@/lib/ai-flag";
import { AI_PROVIDER_BY_PLAN, PRIVACY_VERSION, SUPPORT_EMAIL } from "@/lib/privacy";

export const metadata: Metadata = {
   title: "Privacy & AI Use | InterviewNotes",
   description: "What InterviewNotes stores, what is sent to an AI provider and when, and the controls you have.",
};

// Every fact here traces to the P7-T65 and P7-T66 records (specs learning-progress/decisions.md §1.4, §1.7) or the frozen contract.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
   return (
      <section className="mt-12 space-y-4">
         <h2 className="text-section text-foreground">{title}</h2>
         {children}
      </section>
   );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
   return (
      <div className="mt-8 space-y-4">
         <h3 className="text-subsection text-foreground">{title}</h3>
         {children}
      </div>
   );
}

const Email = () => (
   <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-foreground underline underline-offset-4">
      {SUPPORT_EMAIL}
   </a>
);

export default function PrivacyPage() {
   const available = aiEnabled();
   return (
      <>
         <PageContainer as="main" className="py-12 md:py-16">
            <ReadingColumn className="text-body text-muted-foreground [&_li]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2">
               <h1 className="text-title text-foreground">Privacy &amp; AI Use</h1>
               <p className="mt-3 text-supporting">Version {PRIVACY_VERSION}</p>

               <section aria-labelledby="tldr" className="mt-8 rounded-lg bg-surface p-6 space-y-3">
                  <h2 id="tldr" className="text-subsection text-foreground">TL;DR</h2>
                  <ul>
                     <li>
                        We keep your account details from Google sign-in and, if you use the preparation workspace, what you
                        save there. We don&apos;t sell it. Don&apos;t save passwords, payment details or other secrets in it.
                     </li>
                     <li>
                        {available
                           ? "AI features are available in this environment."
                           : "AI features are not available yet."}
                     </li>
                     <li>
                        AI runs only when you start an AI action and have accepted this notice. That request goes to Groq on
                        the Free plan and to OpenAI on the Premium plan, with the question and the text you chose for it.
                     </li>
                     <li>
                        Those providers may keep request data for up to 30 days for abuse monitoring or reliability, according
                        to their documentation. We don&apos;t claim that they keep nothing.
                     </li>
                     <li>
                        We don&apos;t currently keep backups, so we can&apos;t restore lost data. Keep your own copy of
                        anything important.
                     </li>
                     <li>
                        The workspace lets you delete and export what you save, and once AI is available you can withdraw
                        your AI consent on this page. For anything else, including your account, email <Email />.
                     </li>
                  </ul>
               </section>

               <Section title="Who runs InterviewNotes">
                  <p>
                     InterviewNotes is run by Interview Notes, with operations in the United States and India. For questions
                     about this page or your data, email <Email />.
                  </p>
               </Section>

               <Section title="What InterviewNotes stores">
                  <Subsection title="Your account">
                     <p>
                        You sign in with Google. Our authentication provider, Supabase, keeps the account record Google
                        shares, such as your email address and name, and a record of Premium access if you have it. Cookies
                        keep you signed in, and your browser remembers your light or dark theme.
                     </p>
                  </Subsection>
                  <Subsection title="Your preparation content">
                     <p>
                        The preparation workspace is being rolled out and may not be available to your account yet. When it
                        is, it stores what you save there: your stories, your answers, the links between them and your target
                        level. We don&apos;t sell it. Don&apos;t save passwords, payment details or other secrets there.
                     </p>
                  </Subsection>
                  <Subsection title="Records about AI use">
                     <p>Once AI features are available, two kinds of record are kept. Neither contains any of your text.</p>
                     <ul>
                        <li>
                           <strong className="text-foreground">Your AI consent:</strong> which version of this notice you
                           accepted, when you accepted it and, if you withdraw, when. It is kept while your account exists,
                           delete-all does not remove it, and it is included in your export.
                        </li>
                        <li>
                           <strong className="text-foreground">Usage records</strong> for quotas and abuse prevention: your
                           account ID, the action (Draft or Review), your plan, which provider and model handled it, token
                           counts when known, the outcome, whether it counted toward your quota, how long it took and when.
                           Each is kept until the end of the calendar month (UTC) it was made in, plus 31 days, and then
                           deleted. Deleting your content doesn&apos;t remove them, so deleting can&apos;t reset a quota.
                           They are not in your export.
                        </li>
                     </ul>
                  </Subsection>
               </Section>

               <Section title="Where your data is kept, and backups">
                  <p>
                     Your account and preparation content are stored with Supabase. As of 27 October 2026, the database the
                     live service uses is in Supabase&apos;s East US (Ohio) region, and the one our separate beta environment
                     uses is in South Asia (Mumbai). That may be outside the country where you live.
                  </p>
                  <p>
                     As of 27 October 2026, we haven&apos;t set up backups for either database, the live service&apos;s or
                     beta&apos;s, so we can&apos;t restore lost data. None of Supabase&apos;s replica, pipeline or log
                     export features is set up for them either. If we start keeping backups, this page will say so first.
                  </p>
               </Section>

               <Section title="AI features">
                  <p className="rounded-lg border border-border px-5 py-4 text-foreground">
                     {available
                        ? "AI features are available in this environment."
                        : "AI features are not available yet. This section describes how AI requests will work when they are turned on."}
                  </p>

                  <Subsection title="When AI runs">
                     <p>
                        AI runs only when you start an action yourself, such as Draft or Review. The first time, you&apos;re
                        asked to accept this notice. If you decline, nothing is sent, everything else keeps working, and
                        you&apos;re asked again the next time you choose an AI action. You&apos;re asked again after accepting
                        only if a new version of this notice changes something that matters.
                     </p>
                     <p>
                        An AI result is a suggestion. It becomes part of your saved answer only if you apply or save it.
                     </p>
                  </Subsection>

                  <Subsection title="What is sent">
                     <p>Each request carries our instructions for the task, plus:</p>
                     <ul>
                        <li>
                           <strong className="text-foreground">Draft:</strong> the question, its guidance (from the Lesson,
                           or a company collection&apos;s explanation), the format you chose (STAR or free form), your notes and
                           up to five stories you selected.
                        </li>
                        <li>
                           <strong className="text-foreground">Review:</strong> the question, its guidance, the format, your
                           answer text and up to five stories you selected.
                        </li>
                     </ul>
                     <p>
                        Nothing else you&apos;ve saved is read for the request. Our servers don&apos;t keep the text of the request or
                        the response, and our logs don&apos;t contain your text.
                     </p>
                  </Subsection>

                  <Subsection title="Which provider processes it">
                     <table className="w-full border-collapse text-left">
                        <caption className="sr-only">AI provider by plan</caption>
                        <thead>
                           <tr className="border-b border-border text-foreground">
                              <th scope="col" className="py-2 pr-4 font-semibold">Plan</th>
                              <th scope="col" className="py-2 font-semibold">Provider</th>
                           </tr>
                        </thead>
                        <tbody>
                           {AI_PROVIDER_BY_PLAN.map(({ plan, provider }) => (
                              <tr key={plan} className="border-b border-border/60">
                                 <td className="py-2 pr-4">{plan}</td>
                                 <td className="py-2">{provider}</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                     <p>
                        Your plan decides the provider. A Premium request is never sent to Groq instead: if OpenAI is
                        unavailable, the action fails and you can try again later.
                     </p>
                  </Subsection>

                  <Subsection title="What the providers keep">
                     <p>Each provider handles your request under its own terms. Their documentation, read on 27 October 2026, says:</p>
                     <ul>
                        <li>
                           <strong className="text-foreground">Groq</strong> doesn&apos;t keep inference requests by default,
                           but may log inputs and outputs for up to 30 days (longer if the law requires) to troubleshoot
                           reliability problems or investigate suspected abuse. It stores customer data in the United States.
                        </li>
                        <li>
                           <strong className="text-foreground">OpenAI</strong> doesn&apos;t use data sent to its API to train
                           its models unless the customer opts in, and keeps abuse-monitoring logs for up to 30 days by
                           default (longer if the law requires). Our requests set OpenAI&apos;s <code>store</code> option to
                           false, so the response isn&apos;t kept as a stored response.
                        </li>
                     </ul>
                     <p>
                        We haven&apos;t confirmed Zero Data Retention or any similar arrangement on our accounts, so we
                        don&apos;t claim one. We don&apos;t claim that either provider keeps nothing, and we don&apos;t state
                        where OpenAI processes requests. Don&apos;t send anything to an AI feature that you wouldn&apos;t be
                        comfortable sending to the provider for your plan.
                     </p>
                  </Subsection>
               </Section>

               <Section title="Your controls">
                  <ul>
                     <li>
                        <strong className="text-foreground">Delete an item:</strong> a story, answer or link you delete is
                        removed from the database.
                     </li>
                     <li>
                        <strong className="text-foreground">Delete all:</strong> removes all your stories, answers, links and
                        your target level. It keeps your AI consent record and the usage records described above.
                     </li>
                     <li>
                        <strong className="text-foreground">Export:</strong> a JSON file with everything you saved and your AI
                        consent record, or a readable Markdown copy. Usage records are not included.
                     </li>
                     <li>
                        <strong className="text-foreground">Withdraw AI consent:</strong> once AI features are available, you
                        can withdraw on this page at any time. Your next AI action will ask again.
                     </li>
                     <li>
                        <strong className="text-foreground">Your account:</strong> there is no account deletion control yet.
                        To ask about deleting your account, email <Email />.
                     </li>
                  </ul>
               </Section>

               <Section title="Changes to this page">
                  <p>
                     The version at the top changes whenever this page does. If a change affects how your data is handled in
                     a way that matters, you&apos;ll be asked to accept the new version before your next AI action.
                  </p>
               </Section>
            </ReadingColumn>
         </PageContainer>
         <Footer />
      </>
   );
}
