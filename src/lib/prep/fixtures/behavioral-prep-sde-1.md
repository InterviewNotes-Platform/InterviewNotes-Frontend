---
id: lesson.behavioral-prep-sde-1
format: markdown@1
---
An SDE-1 role is usually someone's first or second engineering job. The work comes in well-defined pieces of a team's system, sized in days to a few weeks: a feature slice, a bug, a small migration. A more experienced engineer is nearby to review the work and help when it stalls. Autonomy is real but bounded. You decide how to build something, while someone else has usually decided what to build and why. Your influence is mostly over the quality of your own work and over how easy you are to work with.

Behavioral questions at this level are rarely looking for someone who has already led large projects. Interviewers are more often listening for whether you can take a clearly defined piece of work to done, say early when something isn't going well, learn what the task needs, take feedback without getting defensive and treat the people around you well. That evidence lives in specifics: what you did, in what order, and what changed afterwards. This is an editorial summary of how behavioral questions are commonly used at this scope, not a description of any particular company's process.

Stories can come from internships, team coursework, open-source contributions, personal projects or a first job. They are not interchangeable. Work that other people depended on, reviewed or used gives an interviewer more to go on than work only you ever saw, so prefer those stories where you have them. Where you don't, a school or personal project told precisely is a legitimate answer. Inventing breadth you don't have is not, and follow-up questions tend to expose it.

**Choosing a level.** Pick the Lesson that matches the scope of the work the role will expect and the examples you can honestly give, not your current title. Employers name and divide levels differently, so treat SDE-1 here as a description of scope rather than a rung on any company's ladder. If your recent work has you owning features end to end, coordinating with other teams and helping newer engineers, the SDE-2 Lesson in this Track is likely a closer fit. If your work routinely spans several teams or quarters, look at SDE-3, and if you are interviewing to lead a team of engineers, the first-line engineering manager Lesson. The four are alternatives, and reading more than one is fine.

The clearest way to tell this Lesson from the SDE-2 one is the question each is mostly trying to answer:

| Level | The question behind most behavioral questions |
|---|---|
| SDE-1 | Can you complete your piece of work, make sound decisions within it, ask for help at the right moment and learn from feedback? |
| SDE-2 | Can you work out what success means, manage dependencies and risk, make trade-offs visible and own the outcome through launch and after it? |

Both describe scope, not stages. A strong SDE-1 answer is not a weaker SDE-2 answer, and the Lessons are not meant to be worked through in order.

Every answer below assumes a simple structure: Situation, Task, Action and Result, with Reflection where it adds something. [Structuring behavioral interview answers with STAR](ref:knowledge.structuring-behavioral-answers-with-star) explains that structure and the ways it goes wrong. This Lesson is about what to put inside it at SDE-1.

## What fits at this level

| Theme | What a fitting SDE-1 story usually shows | What tends to weaken it |
|---|---|---|
| Ownership | A bounded piece of work you can describe decision by decision, including the tests and the follow-up bug | Claiming a whole project, or hiding inside "we" |
| Asking for help | An honest attempt first, then a precise question at a sensible moment | Days of silent struggle, or asking before trying anything |
| Feedback and mistakes | A specific change in what you do, with some sign that it stuck | Agreement in the abstract, or a mistake that was really someone else's |
| Learning | How you decided what to learn and how you checked you had it right | A list of tutorials with no connection to the task |
| Working with others | Courtesy and evidence in a disagreement, help that leaves someone more capable | A story where you were right and everyone else came round |

The notes under each question describe what to look for in your own experience. They are not a template for one correct story. Different stories, and different ways of telling the same one, can answer a question equally well.

## A piece of work that was clearly yours {#a-piece-of-work-that-was-clearly-yours}

The question: "Tell me about a piece of work that was clearly yours. What did you decide, and what did others contribute?"

**What the interviewer is assessing**

Whether you can separate your contribution from the team's, and whether your sense of ownership matches what you actually controlled. The second half of the question matters as much as the first: how you describe the help you had says a lot about how you work with people.

**What strong evidence sounds like**

A bounded piece of work, such as a feature slice, a fix or one component of a group project, where you can name the decisions you made and why. You credit others precisely ("my reviewer pointed out the retry case; I chose to handle it in the client because the server change needed another team"). You can say what done meant and how you knew you had reached it. At this level, ownership often shows in the unglamorous parts: the tests, the rollout note, the bug you fixed a week after launch because it was yours.

**Common pitfalls**

- An answer told entirely in "we", so your part disappears.
- The opposite: claiming the whole project, which tends to unravel when the interviewer asks who designed a particular piece.
- Choosing the most impressive project instead of one where your role is easy to see.
- Describing the technology rather than the decisions you made with it.

**Likely follow-ups**

- "What would have gone differently if you hadn't been on it?"
- "Which decision would you change now?"
- "Who reviewed your work, and what did they change?"
- "How did you know it worked once it shipped?"

## Being stuck {#being-stuck}

The question: "Describe a time you were stuck and did not know what to try next."

**What the interviewer is assessing**

Your method when progress stops, your judgement about how long to keep going alone, and the quality of the question you eventually asked. Getting stuck is expected at any level. What varies is what people do next.

**What strong evidence sounds like**

How you narrowed the problem: reproducing it, cutting it down to the smallest failing case, reading the code or logs, forming a guess and testing it. Some sense of time ("I gave it the afternoon and wrote down what I'd ruled out"). When you did ask for help, you brought what you had tried and a specific question, which made the help quick to give. Being unstuck by someone else is a perfectly good ending. The interesting part is how you got to a question worth asking, and what you would do sooner next time.

**Common pitfalls**

- A story where you were never really stuck, just busy.
- Several days of silent struggle presented as persistence.
- Asking immediately, with nothing tried and nothing to describe.
- An ending where a senior engineer fixed it and nothing is said about what you learned.

**Likely follow-ups**

- "How did you decide it was time to ask?"
- "What did you try that didn't work?"
- "If nobody had been available, what would you have done?"
- "What would you tell someone stuck on the same problem?"

## Feedback that was hard to hear {#feedback-that-was-hard-to-hear}

The question: "Tell me about feedback on your work that was hard to hear. What did you change afterwards?"

**What the interviewer is assessing**

Whether you can take criticism without defending yourself, and whether it changed something observable in how you work. Early-career engineers receive a lot of feedback, so how someone handles it says a good deal about how they are likely to grow on the job.

**What strong evidence sounds like**

The actual feedback, in specific terms. Your first reaction, told honestly; it is fine to say it stung. How you made sure you understood it, often by asking for an example. Then a concrete change and some sign that it stuck: later feedback, a habit you still keep, a result that improved. Code review comments can work if they pointed at a pattern rather than a single line. The first worked example below answers this question.

**Common pitfalls**

- A disguised strength, such as being told you care too much about quality.
- Agreement in the abstract ("I realised I needed to communicate more") with no change you can describe.
- Feedback you rejected without explaining how you weighed it.
- Criticising the person who gave the feedback.

**Likely follow-ups**

- "Did you agree with all of it?"
- "How did you know the change was working?"
- "Is there feedback you decided not to act on?"
- "Have you given someone similar feedback since?"

## A mistake that affected someone else {#a-mistake-that-affected-someone-else}

The question: "Describe a mistake of yours that affected someone else's work."

**What the interviewer is assessing**

Accountability, repair and prevention, and how quickly you told the people affected. The interviewer wants to know what happens on a team when you get something wrong, because everyone does.

**What strong evidence sounds like**

You name the mistake plainly as yours. You explain how and when you found out, who you told and how soon, how you repaired the damage, and what you changed so it would not happen the same way again: a test, a checklist item, a question you now ask before changing something shared. The mistake should have had a real effect on someone, such as a broken build that blocked teammates, wrong figures in a report or a handoff you dropped. The size of the mistake matters less than how candidly you describe it.

**Common pitfalls**

- A mistake that turns out to be someone else's fault.
- Playing down the impact on the person affected.
- A fix with no prevention, or prevention summed up as "I'm more careful now", which describes no action.
- A mistake so trivial that it answers a different question.

**Likely follow-ups**

- "How did the person affected react?"
- "Why didn't review or testing catch it?"
- "What if you had found it a week later?"
- "Has anything similar happened since?"

## Learning something quickly {#learning-something-quickly}

The question: "Tell me about a time you had to learn something quickly to finish a task."

**What the interviewer is assessing**

How you learn when there's a deadline: how you scope what you need to know, where you look, and how you check that you have understood it correctly. Most SDE-1 roles involve a steady stream of unfamiliar code and tools, so this is close to the daily job.

**What strong evidence sounds like**

You separated what the task needed from what could wait. You went to sources in a sensible order, often existing code in your own codebase, then official documentation, then a small experiment. You verified your understanding with a test or a reviewer before relying on it, and you left something behind for the next person, such as a note in the team's documentation or a clearer code comment. Unlike the "stuck" question, learning is the point of this story, so give the method more time than the obstacle.

**Common pitfalls**

- Listing resources without saying what you did with them.
- Claiming to have mastered a large subject in a few days.
- A story that ends with the learning and never mentions whether the task got done.

**Likely follow-ups**

- "What did you deliberately not learn?"
- "How did you know you understood it well enough?"
- "What did you get wrong at first?"
- "How would you approach the same thing now?"

## Disagreeing with a teammate {#disagreeing-with-a-teammate}

The question: "Describe a disagreement with a teammate about how to do something, such as an approach or a review comment."

**What the interviewer is assessing**

Whether you can disagree respectfully, use evidence rather than preference, and accept an outcome you didn't choose. At this level the disagreement is often with someone more experienced, so raising it at all, and doing it courteously, is part of what's being assessed.

**What strong evidence sounds like**

A genuine technical difference, not a clash of personalities. You understood the other person's reasoning before arguing for yours. You brought something more than opinion: a small benchmark, a failing test, a documented convention, a quick prototype. You can say who made the decision and how. A story where you changed your mind is as strong as one where you didn't, and sometimes stronger, because it shows you were listening.

**Common pitfalls**

- A story that is really about someone's tone rather than the work.
- "I was right, and eventually they agreed."
- A disagreement you never voiced, told now as if you had.
- Going to a manager as the first move.

**Likely follow-ups**

- "What was the strongest argument on their side?"
- "What would you have done if the decision had gone the other way?"
- "How did you work together afterwards?"
- "Who made the final call?"

## More work than time {#more-work-than-time}

The question: "Tell me about a time you had more work than time. How did you decide what to do first?"

**What the interviewer is assessing**

How you prioritise within the work you have been given, and whether you recognise that deciding what slips is often not yours alone to decide. The interviewer is listening for whether the people who depend on you would have found out in time.

**What strong evidence sounds like**

The competing items, named concretely, along with who was waiting on each. Some estimate of each before you chose. Criteria that make sense: who is blocked, what affects users, which dates are real. You took the conflict to the person who sets your priorities with a proposal, not only a problem, and you told the people affected what would slip and when. The second worked example below answers this question.

**Common pitfalls**

- Heroics as the point of the story: you worked the weekend and did everything.
- Quietly reordering the work and letting someone discover the slip on the deadline.
- "I asked my lead" with no view of your own.
- A story where, in the end, nothing actually had to give.

**Likely follow-ups**

- "What did you drop, and how did that person take it?"
- "What if your lead had disagreed with your proposal?"
- "Was your estimate right?"
- "How do you spot this earlier now?"

## Helping someone who was struggling {#helping-someone-who-was-struggling}

The question: "Describe a time you helped someone who was struggling with their work."

**What the interviewer is assessing**

Collaboration, and whether you help in a way that leaves the other person more capable rather than more dependent. Noticing that someone is struggling, without being asked, is part of it.

**What strong evidence sounds like**

How you noticed or were asked. You found out what they had already tried before offering anything. You explained, paired or pointed to the right place instead of taking over, or, if you did take over, you can say why that was right on that occasion. You are honest about what helping cost your own work and how you handled it, and you can say how the other person got on afterwards. Peer help counts at this level: a fellow intern, a classmate on a group project, someone who joined after you.

**Common pitfalls**

- A story in which you are the hero and the other person is simply incapable.
- Vague helpfulness with no specific moment.
- Doing their work for them and calling it help.
- Details that would embarrass the other person if they heard the story.

**Likely follow-ups**

- "How did you know they wanted help?"
- "What did they do differently afterwards?"
- "What did it cost your own work?"
- "When is it better not to step in?"

## Requirements that weren't clear {#requirements-that-weren-t-clear}

The question: "Tell me about a task where the requirements were unclear, and you had to move on anyway."

**What the interviewer is assessing**

Whether you ask good clarifying questions, state your assumptions where others can see them, and check in at sensible moments instead of waiting for perfect information. At SDE-1, the ambiguity is usually inside a task someone else defined, so the evidence is in how you handled the gaps.

**What strong evidence sounds like**

What exactly was unclear. Who you asked and what you asked them. What you decided to assume, and where you wrote it down: the ticket, the pull request description, a message to the person who asked. Building a small piece first so someone could react to something real. And what happened when one of your assumptions turned out to be wrong, because in a good story at least one usually does.

**Common pitfalls**

- "The requirements were bad" as the theme of the answer.
- Guessing silently and hoping.
- Asking so many questions that nothing moved.
- A story in which the ambiguity resolved itself.

**Likely follow-ups**

- "Which assumption turned out to be wrong?"
- "Why did you ask that person?"
- "How did you decide you knew enough to start?"
- "What would you have done if nobody could answer?"

## Something nobody asked for {#something-nobody-asked-for}

The question: "Tell me about something you did that nobody asked for, which made your team's work easier."

**What the interviewer is assessing**

Initiative with judgement about scope. The interviewer wants to know whether you notice friction other people feel, whether you check before spending real time on it, and whether the result mattered to anyone besides you.

**What strong evidence sounds like**

A friction others actually felt: a flaky test, a missing setup step in the onboarding notes, a slow local build, a manual task repeated every release. You checked that it was worth doing and that it didn't push aside your assigned work. You finished it. Some evidence that others used it, such as fewer questions in the team channel or a teammate adopting your script. A small improvement that is finished and used is stronger than a large one left half-built. The composite example in the STAR guide answers a closely related question, so use it as a reference for structure rather than as a story to borrow.

**Common pitfalls**

- A side project that quietly displaced assigned work.
- Changing a shared process without asking the people it affects.
- An improvement nobody adopted, presented as a success.
- "I'm always looking for ways to improve things" in place of an example.

**Likely follow-ups**

- "Did you ask anyone before starting?"
- "How much time did it take, and was it worth it?"
- "Who uses it now?"
- "What did you decide not to do?"

## Worked example: the update that kept saying "almost done"

::: callout kind=note
Illustrative example: a composite written for teaching, not a real candidate's experience.
:::

The question: "Tell me about feedback on your work that was hard to hear. What did you change afterwards?"

**Situation.** Four months into a first job, an engineer on a team that owns the account settings area of a consumer web product is assigned a page where users choose which emails they receive. The page itself takes two days. Then two pieces of hidden work appear: existing accounts have no stored preference, so each needs a sensible default, and the unsubscribe link in outgoing emails ignores the new settings. For six working days, the engineer reports "almost done" at stand-up. The team lead has booked a demo for the product manager on the strength of those updates and has to move it.

**Task.** The feature is theirs, and so is the way they report on it. In a one-to-one, their mentor says plainly that the updates weren't useful: "almost done" for a week gave the lead nothing to plan with. The engineer's job is to change how they report progress so that the people planning around their work can actually plan.

**Action.**

- They don't argue in the meeting, though they want to explain that the work grew. Instead they ask what a useful update would have looked like. The mentor's answer: what's done, what's left, what you don't know yet, and when you will.
- That afternoon they write the remaining work as a checklist in the ticket: defaults for existing accounts, the unsubscribe change, tests for both. The default is marked as an open question, and they ask the product manager directly which default to use instead of waiting for it to come up.
- They split the remaining work into two pull requests, so the page can ship behind a feature flag while the unsubscribe change is reviewed separately.
- Their stand-up updates change shape: "Two of four items done. The unsubscribe change is in review. I'm waiting on the default decision, which I asked for yesterday." When a piece turns out bigger than expected, they say so that day.
- Two weeks later, they ask the mentor whether the updates have improved.

**Result.** The page ships behind the flag that week and the demo goes ahead with it. The unsubscribe change follows the week after, about a week and a half later than the lead had originally expected. The mentor confirms that the lead can now plan around the engineer's updates.

**Reflection.** "Almost done" described how the work felt, not what was left. The engineer now writes the remaining work down before giving an estimate, and treats newly discovered work as news to share rather than a private problem to absorb.

**Sample wording.** One way a candidate might tell it, offered as a sample rather than a script:

> "A few months into my first job I was building a notification preferences page. The page took two days, and then I found that existing accounts had no stored preference and that our unsubscribe links ignored the new settings. I said 'almost done' at stand-up for about a week. My mentor told me in our one-to-one that those updates weren't useful: our lead had booked a demo on the strength of them and had to move it. Honestly, that stung, because I'd been working hard. I asked what a useful update would have looked like, and the answer was: what's done, what's left, and what I don't know yet. That afternoon I wrote the remaining work as a checklist in the ticket, asked the product manager directly which default to use, and split the work so the page could ship behind a flag while the unsubscribe change was reviewed. My updates became things like 'two of four done, waiting on one decision'. The page went out that week and the rest the week after. When I checked back a couple of weeks later, my mentor said the lead could plan around my updates now. What I took from it is that 'almost done' describes how I feel, not what's left, so I write the list down before I give anyone a date."

**Why it works.** The feedback is real criticism, not a strength in disguise, and the candidate admits the sting without dwelling on it or relitigating whether the feedback was fair. Most of the answer is behaviour you could watch change: a question asked, a checklist written, a decision requested, a different kind of update. The candidate also checked whether the change worked, which is the evidence most answers to this question leave out. The result is honest about the delay. The scope is right for SDE-1: one feature, and the candidate's own communication about it.

**How a weaker version differs.** One weaker version compresses all of this into "I got feedback that I should communicate more proactively, so I started doing that and it went well." Nothing in it can be checked or followed up. Another spends most of its time explaining why the work grew, which implies the feedback was unfair and leaves no room for what changed. Both answer the first half of the question and skip the second.

## Worked example: three requests on one afternoon

::: callout kind=note
Illustrative example: a composite written for teaching, not a real candidate's experience.
:::

The question: "Tell me about a time you had more work than time. How did you decide what to do first?"

**Situation.** Eight months into the job, an engineer on a team that owns the search service for an online marketplace is two days into adding new sort options to the search API. The mobile team plans to use them in its next release, and the engineer has said the change will be ready by Friday. On Wednesday afternoon, two more requests arrive. The on-call engineer assigns them a support escalation, because they recently worked in the relevant code: some users' saved searches have returned no results since the last deploy. And a teammate asks them to review a large pull request that is blocking the teammate's own work, "today if possible".

**Task.** The sort change and the bug are both theirs; the review is a request from a colleague. All three won't fit before Friday. They need to decide the order and make sure everyone affected knows what that means for them.

**Action.**

- Before starting on whichever request sounds most urgent, they spend about twenty minutes sizing each one. They reproduce the saved-search bug and find a likely cause: a filter field renamed in the last deploy, which saved searches still refer to by the old name. That looks like a small fix. The sort change has roughly two days left. A proper review of the pull request will take an hour or two.
- They message the team lead with a proposal rather than a question: fix the bug today, review tomorrow morning, sort change on Monday instead of Friday. They add that they don't know whether Monday breaks the mobile release.
- The lead suggests asking the mobile engineer directly. The mobile engineer explains that the release cutoff is Tuesday, so Monday works if nothing else goes wrong.
- They tell the teammate the full review will be first thing tomorrow, and ask whether any part is more urgent. The teammate points to a database migration file that other work depends on. The engineer reviews that file within the hour and leaves the rest for the morning.
- They fix the saved-search bug, add a test that saved searches with the old field name still return results, and ship it that evening after review by the on-call engineer.

**Result.** The bug is fixed the same day. The teammate is unblocked on the migration that afternoon and gets the full review the next morning. The sort change lands on Monday, inside the mobile team's cutoff but with a day less of testing time than they had planned around.

**Reflection.** Deciding what slips was partly other people's decision, and asking them took less time than guessing would have. The engineer now asks "when do you actually need this?" when they take on work someone else is waiting for, instead of finding out when it's already late.

**Sample wording.** A sample of how this could sound in an interview, not the only way to tell it:

> "I was two days into adding sort options to our search API, which the mobile team needed, and I'd told them Friday. On Wednesday afternoon I got a support escalation about saved searches returning nothing after a deploy, and a teammate asked me to review a big pull request that was blocking them. Before picking one, I spent about twenty minutes sizing all three. The bug looked small: a renamed filter field. The sort work had about two days left, and the review needed an hour or two to do properly. So I sent my lead a proposal: bug today, review tomorrow morning, sort on Monday. I said I didn't know whether Monday would hurt the mobile release, and my lead suggested I ask the mobile engineer, who told me their cutoff was Tuesday. I asked my teammate which part of the review mattered most right now, and reviewed the migration file that afternoon. The bug fix went out that evening with a test for the old field name, and the sort change landed Monday. The cost was that the mobile team had a day less to test it. The habit I took away is to ask 'when do you actually need this?' when I pick up work someone's waiting on, not when it's already late."

**Why it works.** The candidate sizes the work before choosing, which shows the prioritising was reasoned rather than reactive. They bring the lead a proposal, then go to the person who actually knows the real deadline. The partial review is a small but telling detail: it shows they looked for the part of the request that mattered rather than treating it as all or nothing. The cost to the mobile team is stated, not hidden. And the lead still sets the priorities, which is the right shape for this level.

**How a weaker version differs.** The most common weaker version is "I stayed late and got all three done by Friday." It may even be true, but it hides the judgement the question asks about and suggests a habit that won't scale. Another is "I asked my lead what to do", which hands over the thinking entirely. The most damaging is a version where the sort change slips quietly and the mobile engineer finds out on Friday, because that is exactly the outcome the interviewer is checking for.
