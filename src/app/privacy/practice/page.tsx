import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { PageContainer, ReadingColumn } from "@/components/layout/PageContainer";
import { PracticeDataAccess } from "@/components/practice-privacy/PracticeDataAccess";
import { practiceEnabled } from "@/lib/practice-flag";
import { PRACTICE_TERMS_VERSION } from "@/lib/practice-terms";
import { PRIVACY_HREF, SUPPORT_EMAIL } from "@/lib/privacy";

// LOCAL draft (P9-T17): not indexed until the owner approves the final wording and the pending facts are verified.
export const metadata: Metadata = {
   title: "Practice data terms | InterviewNotes",
   description: "What Problem practice stores in your account, how long it is kept, and how to export, delete or withdraw.",
   robots: { index: false, follow: false },
};

// Every statement traces to the P9-T17 record (specs technical-practice/evidence/P9-T17-practice-terms-record.md): the T12
// behaviour, the owner's P9-OD-01, -15, -17 and -20 decisions, and the P8-D-081 analytics code. A fact that is not verified
// is a "Pending" note, never a claim.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
   return (
      <section className="mt-12 space-y-4">
         <h2 className="text-section text-foreground">{title}</h2>
         {children}
      </section>
   );
}

function Pending({ children }: { children: React.ReactNode }) {
   return (
      <p role="note" className="rounded-lg border border-dashed border-border px-5 py-4 text-foreground">
         <strong>Pending verification.</strong> {children}
      </p>
   );
}

const Email = () => (
   <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-foreground underline underline-offset-4">
      {SUPPORT_EMAIL}
   </a>
);

const LINK = "font-medium text-foreground underline underline-offset-4";

export default function PracticeTermsPage() {
   // The frontend practice flag hides this page with the rest of practice; it enables nothing (src/lib/practice-flag.ts).
   if (!practiceEnabled()) notFound();
   return (
      <>
         <PageContainer as="main" className="py-12 md:py-16">
            <ReadingColumn className="text-body text-muted-foreground [&_li]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2">
               <h1 className="text-title text-foreground">Practice data terms</h1>
               <p className="mt-3 text-supporting">Version {PRACTICE_TERMS_VERSION}</p>
               <p className="mt-3">
                  These terms cover Problem practice only. They are a separate document from the{" "}
                  <Link href={PRIVACY_HREF} prefetch={false} className={LINK}>
                     Privacy &amp; AI Use
                  </Link>{" "}
                  page, which covers the rest of InterviewNotes. Accepting these terms does not change your consent on that page.
               </p>
               <p className="mt-3 rounded-lg border border-border px-5 py-4 text-foreground">
                  Draft for review. Some facts below are still being verified and are marked as pending. Practice is not open to learners
                  until they are.
               </p>

               <section aria-labelledby="summary" className="mt-8 rounded-lg bg-surface p-6 space-y-3">
                  <h2 id="summary" className="text-subsection text-foreground">
                     Summary
                  </h2>
                  <ul>
                     <li>
                        Practice saves your work on a Problem in your account: your stage answers, your diagram, the hints and
                        clarifications you open, the snapshots made when you submit, and your self-review.
                     </li>
                     <li>We keep your practice data until you delete it or your account is removed. Nothing deletes it on a timer.</li>
                     <li>
                        It is associated with your account and is not visible to other learners. We don&apos;t sell it. Self-guided practice
                        doesn&apos;t send your work to an AI provider.
                     </li>
                     <li>
                        You can export it, delete one attempt or delete all of it. Deleting removes it from the live database at once. We keep
                        no automatic backups of it, so if our database were lost it could not be recovered; export anything you want to keep.
                     </li>
                     <li>You accept these terms before your first attempt. Reading Problems never needs them.</li>
                     <li>Practice stores no uploaded files and no audio.</li>
                  </ul>
               </section>

               <Section title="What practice stores">
                  <p>When you practise a Problem, we store, for each attempt:</p>
                  <ul>
                     <li>the Problem, the level you chose and when you started, submitted or ended the attempt;</li>
                     <li>your answer for each stage;</li>
                     <li>your diagram: its parts, their labels and explanations, and where they sit on the canvas;</li>
                     <li>a record of what you did in each stage, such as the hints and clarifications you opened and the assumptions you noted;</li>
                     <li>snapshots of your answers and diagram taken when you submit, so your review compares against what you submitted;</li>
                     <li>your self-review marks and notes.</li>
                  </ul>
                  <p>
                     We also keep your practice preferences, such as your usual level, and a record of each version of these terms you accepted
                     and when, and if you withdraw, when. That record holds none of your work.
                  </p>
                  <p>
                     Practice doesn&apos;t accept file uploads and doesn&apos;t record audio. Don&apos;t put passwords, payment details or
                     other secrets in your answers or diagram.
                  </p>
               </Section>

               <Section title="Why we store it">
                  <p>
                     So you can leave and come back to an attempt, see your earlier attempts, compare your submitted work with the review
                     material, and export or delete it.
                  </p>
               </Section>

               <Section title="Who can see it">
                  <p>
                     Your practice data is associated with your account. The app shows it only to you when you are signed in, and it is not
                     visible to other learners. There is no sharing or public view.
                  </p>
                  <p>
                     It is stored in the same database as the rest of your InterviewNotes data, described on the Privacy &amp; AI Use page. The
                     people who run InterviewNotes, and the services that host it, can technically reach that database, for example to keep
                     the service working or to act on a request you send us. We don&apos;t claim that no one else can ever access it.
                  </p>
               </Section>

               <Section title="How long we keep it">
                  <p>
                     We keep your practice data until you delete it or your account is removed. Nothing deletes it on a timer, even if you stop
                     signing in, and there is no limit on how many attempts you keep.
                  </p>
               </Section>

               <Section title="Exporting your data">
                  <p>
                     You can export all of your practice data as one file. The file ends with a completion line that repeats its counts; if
                     that line is missing, the export did not finish and the app tells you so. If exporting everything does not finish, you can
                     export one attempt at a time.
                  </p>
                  <p>
                     An export holds your own practice work as your account may see it. It leaves out anything you have not unlocked, such as
                     reference answers, and our internal records, such as the deletion log described below.
                  </p>
               </Section>

               <Section title="Deleting your data">
                  <ul>
                     <li>
                        <strong className="text-foreground">Delete one attempt:</strong> removes that attempt and everything saved with it.
                     </li>
                     <li>
                        <strong className="text-foreground">Delete all practice data:</strong> removes every attempt and your practice
                        preferences. It keeps the record of which version of these terms you accepted, because deleting your data does not
                        withdraw your acceptance. It does not affect your Lesson and Problem progress or your preparation workspace.
                     </li>
                  </ul>
                  <p>
                     Each deletion is permanent and can&apos;t be undone. It removes the data from the live database at once. We keep no
                     automatic backups of practice data. If we made our own copy of the database before you deleted, that copy still holds your
                     data until it is removed, and we can&apos;t say when that will be.
                  </p>
                  <p>
                     When you delete, we record that a deletion happened: when, whether it was one attempt or all of them, and a coded
                     reference to your account that can&apos;t be turned back into your account without a secret key that is not stored in the
                     database. This deletion log holds none of your work. It is kept after your deletion so that deleted data that comes back
                     from an older copy of the database can be found and deleted again.
                  </p>
               </Section>

               <Section title="Backups and restoring them">
                  <p>
                     We don&apos;t keep automatic backups of practice data, and our database host keeps none for us. If our database were lost,
                     practice work stored in it could not be recovered, so export anything you want to keep. We don&apos;t claim anything about
                     copies our database host may keep itself.
                  </p>
                  <p>
                     We may sometimes make our own copy of the database. If we ever restored a copy made before you deleted something, that data
                     could come back until it is deleted again.
                  </p>
                  <Pending>
                     We plan to keep practice closed after a restore until deleted data has been found and deleted again using the deletion
                     log, but that process is not yet in place. How long we keep our own copies, the copy of the deletion log kept outside the
                     database and how far behind it can be, and what happens if that copy or its key is lost, are being verified. This section
                     will state them before practice opens to learners. Until then we make no promise about re-deleting data after a restore.
                  </Pending>
               </Section>

               <Section title="Withdrawing your acceptance">
                  <p>
                     You can withdraw your acceptance of these terms at any time. After that you can&apos;t start a new attempt until you
                     accept again.
                  </p>
                  <p>
                     Withdrawing deletes nothing. Your saved attempts stay, and you can still open, edit, export and delete them while practice
                     is available. Withdrawing is separate from deleting one attempt or all of your practice data; to remove your data, delete
                     it.
                  </p>
               </Section>

               <Section title="Removing your account">
                  <p>
                     There is no account deletion button. To ask for your account to be removed, email <Email />. We delete all of your
                     practice data, including your acceptance records, before removing your sign-in identity.
                  </p>
                  <Pending>
                     The steps we follow for an account removal request are being set up and checked. This section will describe them before
                     practice opens to learners.
                  </Pending>
               </Section>

               <Section title="Logs and analytics">
                  <p>
                     Our servers&apos; logs and error reports don&apos;t contain your answers, diagram labels or notes. Practice adds no
                     analytics events of its own.
                  </p>
                  <p>
                     Where our site is served by Vercel, Vercel Web Analytics and Speed Insights record page views and how fast pages load. A
                     page view includes the page&apos;s address, which for an attempt contains the attempt&apos;s random ID but none of its
                     content.
                  </p>
                  <Pending>Which of our sites are served by Vercel, and what Vercel keeps, are being verified.</Pending>
               </Section>

               <Section title="What practice does not do yet">
                  <ul>
                     <li>Self-guided practice gives no AI feedback and sends nothing to an AI provider.</li>
                     <li>There is no voice practice, and no audio is recorded or stored.</li>
                     <li>You can&apos;t upload files.</li>
                  </ul>
                  <p>If we add AI-guided or voice practice, each will have its own terms and will ask you separately before it is used.</p>
               </Section>

               <Section title="Your practice data">
                  <PracticeDataAccess apiUrl={process.env.NEXT_PUBLIC_API_URL || null} />
               </Section>

               <Section title="Changes to these terms">
                  <p>
                     The version at the top changes whenever this document does. If a change matters for how your practice data is handled,
                     you&apos;ll be asked to accept the new version before you start another attempt. Questions: <Email />.
                  </p>
               </Section>
            </ReadingColumn>
         </PageContainer>
         <Footer />
      </>
   );
}
