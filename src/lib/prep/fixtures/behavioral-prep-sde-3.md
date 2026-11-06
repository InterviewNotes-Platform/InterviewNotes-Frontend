---
id: lesson.behavioral-prep-sde-3
format: markdown@1
---
An SDE-3's work crosses team boundaries and runs over several quarters. Some of it is technical direction that teams who don't report to you have to adopt. Some is a problem nobody owns until you decide it is worth owning. Some is helping other engineers do better work, including people who know more than you about parts of the system. The decisions tend to be expensive to reverse, ownership is often unclear, and everyone affected has priorities of their own. You are still an individual contributor: your influence comes from judgement, evidence and the trust you have built, not from a reporting line.

Behavioral questions at this scope tend to listen for judgement more than effort. Interviewers are usually trying to find out whether you pick problems worth solving, bring people along without authority, make sound decisions with incomplete information, change your mind in public when the evidence turns, and leave behind mechanisms that keep working after you move on. This is an editorial summary of how behavioral questions are commonly used at this scope, not a description of any particular company's process.

The most common calibration mistake is to equate seniority with a big story. A platform rewrite told vaguely says less about you than a contained decision told precisely: what you knew, what you didn't, who you had to convince and what it cost. The second mistake is the opposite of hiding behind "we". SDE-3 work almost always involves many people, and an answer in which you alone saw the problem, designed the fix and saved the quarter rarely survives the first follow-up. The interviewer wants to see your part in a group effort clearly, including the parts where other people were right.

**Choosing a level.** Pick the Lesson that matches the scope of the work the role will expect and the examples you can honestly give, not your current title. Employers name and divide levels differently, so treat SDE-3 here as a description of scope rather than a rung on any company's ladder. If your strongest stories are projects you owned end to end inside one team, with one or two dependencies, the SDE-2 Lesson in this Track is likely a closer fit, and those stories don't need inflating to belong there. If the role is to manage a team of engineers, with one-to-ones, performance and hiring as part of the job, the first-line engineering manager Lesson covers that. Managing is a different job, not the step after this one, and this Lesson stays with technical leadership as an individual contributor. The four Lessons are alternatives; some senior roles mix technical leadership with a little people work, and reading two of them is reasonable.

The answers below use the structure explained in [Structuring behavioral interview answers with STAR](ref:knowledge.structuring-behavioral-answers-with-star): Situation, Task, Action and Result, with Reflection where it adds something. At this level the Situation needs more discipline than usual. The interviewer has to understand several teams, a technical constraint and a timeline before your actions make sense, so give only what the decision depended on and spend the time on what you did and what it cost.

## What fits at this level

| Aspect | Fits at SDE-3 | Usually pitched below this level | Beyond this Lesson |
|---|---|---|---|
| Scope | A problem spanning several teams or quarters, often with no clear owner | One project inside your own team, however well run | Setting an organization's strategy or structure |
| Influence | Teams that don't report to you change what they do because of your evidence, proposal or pilot | Persuading your own lead in a design review | Directing people through a reporting line |
| Decisions | Hard-to-reverse choices made under uncertainty, with the assumptions written down | Choices that could be undone in the next deploy | Budget, headcount or reorganization decisions |
| Other engineers | Engineers, including stronger ones, doing better work because of how you taught, reviewed or sponsored them | Answering a newer teammate's questions | Performance reviews, hiring decisions and career management for reports |
| Results | A mechanism that outlasted your involvement, with its cost and any partial outcome stated | A fix that only holds while you stay involved | Organization-wide outcomes claimed as yours |

The notes under each question describe what to look for in your own experience. They are not a template for one correct story, and different stories, or different tellings of the same one, can answer a question equally well.

## A technical direction several teams adopted {#a-technical-direction-several-teams-adopted}

The question: "Tell me about a technical direction you set that several teams had to follow."

**What the interviewer is assessing**

Your technical judgement about which direction was right, and how you got teams that don't report to you to adopt it. "Had to follow" in the prompt is worth noticing: the interviewer is usually more interested in how adoption was earned than in who could have required it.

**What strong evidence sounds like**

Why this direction and not the alternatives, including one you rejected and the reason. Who had to change what, and what it cost them. How you built the case: examples from the code, a written proposal, a pilot with a team that wanted it. Which objections you heard, and which of them changed the proposal. What adoption looked like in practice and how far it got. A partial adoption with a recorded reason is credible; "everyone moved over" invites a question about who didn't. Who maintains the direction now. The first worked example below answers this question.

**Common pitfalls**

- Adoption by mandate, with your part reduced to getting a leader to sign off.
- A personal preference defended as a principle.
- No mention of what migrating cost the other teams.
- Claiming as yours a direction that a group arrived at together.

**Likely follow-ups**

- "Which team pushed back hardest, and were they right about anything?"
- "What did moving cost the teams that moved?"
- "What would you have done if most teams had said no?"
- "Who looks after it now that you've moved on?"

## Changing your mind after others had built on it {#changing-your-mind-after-others-had-built-on-it}

The question: "Describe a time you changed your mind about a technical decision after others had built on it."

**What the interviewer is assessing**

Intellectual honesty when it's expensive. Can you notice that a decision of yours is no longer right, weigh the cost of reversing it against the cost of living with it, and tell the people affected in a way that keeps their trust?

**What strong evidence sounds like**

What the decision was and what you believed when you made it. What evidence changed your mind, and how you checked it rather than reacting to one complaint. The options you considered, including keeping the decision, because living with it is sometimes correct. When and how you told the people who had built on it. What the change cost, stated plainly, and how you limited that cost for others. What you do differently now when making decisions of that kind. The second worked example below answers this question.

**Common pitfalls**

- Blaming changed requirements for a decision that rested on an untested assumption.
- A reversal made quietly, which the affected teams discover for themselves.
- A decision that wasn't really yours, or didn't matter much, chosen because it makes a safe story.
- Presenting the reversal as free.

**Likely follow-ups**

- "Which of your original assumptions failed, and could you have tested it earlier?"
- "How did the teams that had built on it react?"
- "Why not live with it?"
- "How would you find out sooner next time?"

## Helping strong engineers reach a decision {#helping-strong-engineers-reach-a-decision}

The question: "Tell me about a time strong engineers disagreed and you helped them reach a decision."

**What the interviewer is assessing**

Whether you can run a decision among people with strong, well-founded opinions: get the real disagreement into the open, settle how the decision will be made, and record both the outcome and the dissent. Your own technical view matters less here than how you got the group to a decision it could act on.

**What strong evidence sounds like**

What the disagreement was actually about, which is often narrower than it first appears: different assumptions about load, about where the product is heading, about what a failure would cost. How you separated the points evidence could settle from the ones that needed a judgement call, and what you did to get that evidence. Who made the final call and why it was them; it may have been someone else, with you running the process. What was written down: the options, the decision, the reasoning and the strongest objection. How the people whose view lost were treated, and whether the decision held.

**Common pitfalls**

- Your own view winning, described as facilitation.
- Treating full agreement as the only acceptable outcome, so the decision drags on for months.
- A decision with no written record, reopened at the next design review.
- Describing the people who disagreed as difficult rather than as people with reasons.

**Likely follow-ups**

- "What did the people who disagreed with the outcome do afterwards?"
- "When did you decide that more discussion wouldn't help?"
- "What would have made the decision go the other way?"
- "Where is the decision recorded, and has anyone used that record since?"

## A problem nobody asked you to solve {#a-problem-nobody-asked-you-to-solve}

The question: "Describe a problem nobody had asked you to solve, and how you convinced others it was worth solving."

**What the interviewer is assessing**

Problem selection and advocacy. At this scope, part of the job is noticing the expensive problems that fall between teams, deciding which are worth the time, and then making that case against everything already in the plan.

**What strong evidence sounds like**

How you noticed the problem and why nobody owned it. How you sized it with evidence other people could check, rather than asserting that it mattered. What you weighed it against: the planned work it would displace, and why it was still worth doing. Who you needed to convince and what each of them needed to hear, which is rarely the same thing. A problem you looked at and decided not to pursue adds credibility. If the work went ahead, who carries it now. The first worked example below answers this question too.

**Common pitfalls**

- A pet project presented as an organizational need.
- Starting the work quietly and presenting it as finished.
- Evidence that amounts to "everyone knows it's a mess".
- Ignoring what the work pushed out of the plan.

**Likely follow-ups**

- "What did you or others stop doing to make room?"
- "Why hadn't anyone fixed it before?"
- "What's a problem you decided wasn't worth solving?"
- "How did you know it was fixed?"

## An unwelcome technical message {#an-unwelcome-technical-message}

The question: "Tell me about delivering an unwelcome technical message to product or leadership."

**What the interviewer is assessing**

Upward communication under pressure: whether you can tell people with more authority something they don't want to hear, frame the risk with evidence they can weigh, and stay credible whether or not they act on it.

**What strong evidence sounds like**

The message itself in one sentence: a date that won't hold, a design that won't survive the planned launch, a dependency that is less reliable than everyone assumes. Why it fell to you, and why you raised it when you did. How you made it concrete for people who couldn't check the technical detail: what would likely fail, what that would cost, what avoiding it would take. The options you brought with the problem. How they responded, and what you did next. If they chose to accept the risk, accepting their decision with the risk recorded is a legitimate ending.

**Common pitfalls**

- "I warned them and they ignored me" as the shape of the story.
- Technical detail with no translation into consequences.
- Alarm with no options attached.
- Raising it so late that the only choice left was the bad one.
- Going around the people who owned the decision.

**Likely follow-ups**

- "What did they decide, and do you agree with it now?"
- "How did you make the risk concrete without exaggerating it?"
- "What would have made you take it further?"
- "How did it affect your working relationship with them?"

## Developing other engineers {#developing-other-engineers}

The question: "Describe how you develop other engineers, including some who are stronger than you in an area."

**What the interviewer is assessing**

Whether you multiply other people's work: by teaching, by sponsoring, by giving away interesting problems, and by doing that with peers and specialists as well as with people newer than you.

**What strong evidence sounds like**

Specific people and specific changes, described with respect. Concrete methods: handing someone a design you could have written yourself and reviewing it instead of rewriting it, putting a quieter engineer's work in front of the people who make decisions, pointing a specialist at a problem that stretches them in a different direction. For someone stronger than you in an area, what you offered that they didn't already have, such as context from other teams, a sharper way to present a proposal, or visibility, and what you learned from them in return. Evidence that the growth was theirs: they now do something without you.

**Common pitfalls**

- Mentoring that consists only of answering questions.
- Taking credit for someone else's promotion.
- Skipping the "stronger than you" part, or implying there is nobody stronger.
- Development that really meant handing off work you didn't want.

**Likely follow-ups**

- "What did you give away that you would have enjoyed doing yourself?"
- "What did the person who's stronger than you get from working with you?"
- "How do you know it helped them rather than you?"
- "Who has taught you something recently?"

## A project that failed or was stopped {#a-project-that-failed-or-was-stopped}

The question: "Tell me about a significant project that failed or was stopped. What was your part in that?"

**What the interviewer is assessing**

Accountability at the scale you work at: whether you can describe your own contribution to a failure precisely, separate a bad outcome from a bad decision, and show what changed afterwards.

**What strong evidence sounds like**

The project and your role in it. What happened, and when the warning signs became visible. Your part, named specifically: an assumption you made, a signal you missed, a concern you raised too softly, or a stop you argued for later than you should have. Whether the original decision was reasonable given what was known at the time, which it sometimes was. Stopping a project at the right moment can be the strongest part of the story. What changed afterwards, in how you work or in a mechanism the teams now use.

**Common pitfalls**

- A failure in which no part was yours.
- A failure that turns out to have been a success ("we learned so much").
- Taking the blame for things outside your control, which is as unconvincing as blaming others.
- A project too small to count as significant at this scope.

**Likely follow-ups**

- "When should it have been stopped?"
- "What did you know at the time that you didn't act on?"
- "What happened to the people working on it?"
- "With the same information, would you make the original decision again?"

## Deciding with incomplete information {#deciding-with-incomplete-information}

The question: "Describe a decision you made with incomplete information that would be expensive to undo."

**What the interviewer is assessing**

Decision quality under uncertainty: whether you can tell which parts of a decision are reversible, put your care into the parts that aren't, and bound the risk instead of waiting for certainty that won't arrive.

**What strong evidence sounds like**

What you didn't know, and why you couldn't find out in time. Which parts of the decision could be undone cheaply and which couldn't, and how that shaped the order of the work. How you limited the risk: a staged rollout, a checkpoint with an explicit go or no-go, a design that kept a way back open. What would tell you that you were wrong, and whether you said so in advance. How it turned out, and how you judge the decision separately from the outcome. The second worked example below answers this question.

**Common pitfalls**

- "We gathered more data" as the whole answer.
- A decision that happened to work out, offered as proof the reasoning was sound.
- No distinction between the steps you could take back and the ones you couldn't.
- Uncertainty that nobody else was told about.

**Likely follow-ups**

- "What would have made you wait?"
- "What signal would have told you it was wrong?"
- "Which step couldn't you take back, and why did it come where it did?"
- "How much did you spend reducing the uncertainty, and why stop there?"

## Delivery pressure and technical health {#delivery-pressure-and-technical-health}

The question: "Tell me about balancing a team's delivery pressure against long-term technical health."

**What the interviewer is assessing**

Whether you can make the cost of neglect visible to the people who set priorities, negotiate something specific, and protect what actually matters rather than everything you'd like to fix.

**What strong evidence sounds like**

The specific technical health problem and how it was already hurting delivery or reliability, in terms the product side could weigh: incidents, slower changes in one area, on-call load. What you asked for, sized and bounded rather than "time for tech debt". What you agreed to give up or delay in return. What was protected and what wasn't. Whether the work happened, and some evidence that it mattered. Choosing delivery this time, with the risk written down and a point at which to revisit it, is a valid answer too.

**Common pitfalls**

- Technical health as a moral position: "we should never ship debt".
- A request for open-ended refactoring time.
- Product cast as the opponent.
- Clean-up hidden inside feature estimates, so nobody could weigh the trade-off.

**Likely follow-ups**

- "What did product give up?"
- "How did you size it?"
- "What did you leave unfixed, and why?"
- "How do you know it made a difference?"

## A reliability problem that crossed teams {#a-reliability-problem-that-crossed-teams}

The question: "Describe a reliability or quality problem that crossed team boundaries, where you improved the system and not only the immediate failure."

**What the interviewer is assessing**

Systemic thinking: whether you look past the failure in front of you to the conditions that keep producing it, and change those with a mechanism that works without your continued attention.

**What strong evidence sounds like**

The immediate failure, briefly, and why it was a symptom. The pattern behind it: the same class of problem in several teams or services, and how you showed it was a pattern rather than a coincidence. The mechanism you introduced or proposed: a safer shared default, a check in the deployment pipeline, a contract test between services, a clearer ownership boundary, a review step for one risky kind of change. How the teams involved came to adopt it. Evidence it worked, such as a class of failure that stopped recurring or a check that caught something real, and what it cost in friction.

**Common pitfalls**

- A heroic incident response presented as a systemic fix.
- A mechanism that only works while you keep enforcing it.
- A document nobody reads, offered as the fix.
- Ignoring the friction the mechanism added for other teams.

**Likely follow-ups**

- "How did you know it was a pattern?"
- "What does the mechanism cost the teams that have to follow it?"
- "What happens to it if you leave?"
- "Has it caught anything since?"

## Worked example: four copies of a client library

::: callout kind=note
Illustrative example: a composite written for teaching, not a real candidate's experience.
:::

The questions: "Describe a problem nobody had asked you to solve, and how you convinced others it was worth solving." The same story also answers "Tell me about a technical direction you set that several teams had to follow."

**Situation.** Four product teams use an internal configuration service through a client library. Years earlier, each team copied the library into its own codebase, and the copies have drifted apart since. While fixing a retry bug in their own team's copy, a senior engineer finds the same fix, written differently, in two of the other copies, and no fix at all in the fourth. The configuration service's team maintains the service but none of the copies. Nobody owns the problem.

**Task.** Decide whether converging on one shared library is worth the disruption and, if it is, persuade three teams that don't report to them to change, without a mandate from above.

**Action.**

- Before proposing anything, they gather evidence other people can check: a year of commit history across the four copies, showing the same defects fixed separately, and a recent incident in which the copy without the retry fix flooded the configuration service with requests during a partial outage.
- They write a two-page proposal covering the problem, the evidence, a shared library owned by the configuration service team, and what each team would need to change. They include the strongest argument against it: every team would depend on library upgrades it doesn't control.
- They send it to the four teams' tech leads and to the configuration service team for written objections a week before any meeting. Two objections change the proposal. One team relies on a caching layer it added to its copy, so the shared library gains an extension point for it. The configuration service team will only own the library with a contribution guide and a named reviewer rota, so the proposal adds both.
- They pilot with the two teams that want it, their own and the team with the caching layer. They write the first migration change for each, behind a flag, and keep each team's old copy until the new library has run in production for a full release cycle without problems.
- They write down what a team can decline, and on what grounds: a team may keep its own copy if the shared library can't meet a real constraint, provided the reason is recorded and the team applies security fixes to its copy itself.
- The third team migrates after seeing the pilots. The fourth runs on an older runtime that the shared library doesn't support, and moving off that runtime is a much larger project already on its own roadmap. It keeps its copy under the recorded exception, and the configuration service team adds it to the list of teams told about client defects.

**Result.** Three of the four teams use the shared library, maintained by the configuration service team through the reviewer rota, and defects in the client are now fixed once for all three. The fourth team still maintains its own copy for a documented reason, so the duplication is reduced, not gone. Each adopting team spent engineering time on the migration over two release cycles, which the proposal had estimated up front.

**Reflection.** The fourth team's constraint was real and could have been found at the start. The engineer would bring that team into drafting the proposal rather than only into reviewing it, so the exception would have been designed in from the beginning instead of negotiated at the end, and the team wouldn't have had reason to feel the proposal was written around it.

**Sample wording.** One possible spoken version, offered as a sample to adapt rather than to memorise:

> "Four teams, mine included, each had their own copy of the client library for our configuration service, and they'd drifted apart. I noticed while fixing a retry bug in ours: the same fix was in two other copies, written differently, and missing from the fourth. That fourth copy had made an outage worse a few months earlier. Nobody owned the problem, because the configuration team owned the service, not the copies. I didn't want to argue from principle, so I went through a year of history in all four and showed the duplicated fixes and the incident. I wrote a short proposal with the case against it included, mainly that teams would depend on upgrades they didn't control, and I sent it round for written objections before any meeting. Two objections changed it. One team needed its caching layer, so we added an extension point, and the configuration team would only take ownership with a contribution guide and a reviewer rota, so we added those. I piloted with my team and the caching team and wrote both migrations myself, behind flags. We also agreed up front that a team could keep its copy for a real constraint, as long as the reason was written down. Three teams moved. The fourth is on an older runtime the library doesn't support, so it kept its copy under that exception. If I did it again, I'd have that team help write the proposal, because their constraint was there from day one."

**Why it works.** The candidate chooses the problem on evidence, not taste, and makes the evidence something others can verify. Influence comes from a written proposal that invited objections and changed because of them, a pilot with willing teams, and migration work the candidate did much of personally. They also build what keeps the result alive after they move on: an owning team, a contribution process and a written rule for exceptions. The partial result is stated plainly and explained. The reflection names a real flaw in how the proposal was run rather than offering modesty for its own sake. The scope fits SDE-3: four teams, more than a quarter, no authority, and costs that land on other people.

**How a weaker version differs.** One weaker version has a director mandate the shared library once the candidate raises it, which leaves nothing about influence to assess. Another is a heroic rewrite: the candidate builds a new library over a few weekends and the teams "loved it", with no evidence, no migration cost and no owner afterwards. A third says all four teams adopted it. That is either untrue or hides a team that was pushed into it, and the follow-up "did anyone push back?" usually finds out which.

## Worked example: the datastore choice I reversed

::: callout kind=note
Illustrative example: a composite written for teaching, not a real candidate's experience.
:::

The questions: "Describe a time you changed your mind about a technical decision after others had built on it." The same story also answers "Describe a decision you made with incomplete information that would be expensive to undo."

**Situation.** An engineer led the choice of a key-value datastore for a new device registry, the service that records the state of every unit in a fleet of connected hardware. The decision assumed that nearly every read would fetch one device's record, and that reporting across the fleet would go through the data warehouse. Six months later, two teams are building on the service. The firmware rollout team needs to find, several times a day, every device on a given firmware version that hasn't checked in since its update, and it must use live data because the warehouse lags by a day and a rollout can't wait that long to pause. The table is keyed only by device ID, with no index on firmware version or check-in time, so in this setup the query means scanning the whole table. It is slow, its cost grows every month with the fleet, and the support tooling team already plans a second query across devices.

**Task.** Decide whether to keep the datastore, patch around it or reverse the choice, knowing that any change lands on two teams mid-build, and do it openly, because the original decision was the engineer's.

**Action.**

- They measure the real access pattern from production logs and the rollout query's cost, and ask both dependent teams which queries they expect to need over the next two quarters. The answers confirm that the scan is not a one-off: reads across devices are becoming a second main access pattern.
- They write a short note that restates the reasoning in the original decision record and names the two assumptions that failed: that reads would be per device, and that anything across the fleet could wait for the warehouse.
- They lay out three options with their costs. Doing nothing keeps the scan, whose cost keeps growing, and the planned second query makes it worse. Patching means maintaining a secondary index table written alongside the main one, which fixes the rollout query but adds a consistency risk the team would carry indefinitely. Reversing means moving the service to a relational database that handles both access patterns, at the price of a migration spread over most of a quarter.
- They recommend reversing, staged so that the early steps can be undone. The service's API stays the same, so neither dependent team changes code. New writes go to both stores first, so nothing that changes during the migration is missed. A backfill job then copies the existing records across in batches, using a version number the service adds to every record before the migration starts, so the backfill can never overwrite a newer write with an older copy. A reconciliation job compares the two stores record by record and repairs any differences, and reads are compared in the background until mismatches stay at zero. Reads then move over one query at a time, and the old store is retired only after two full firmware rollouts with no differences. Each stage has a point at which the team can stop and fall back.
- They review the plan with the two dependent teams first and agree a freeze on schema changes during the switch, then take it to the engineering leads for a decision. The decision and its reasoning are recorded, including the fact that the original choice was the engineer's.

**Result.** The teams agree to the staged reversal, and the rollout query runs against the new database within the quarter. The migration takes most of a quarter the service team had planned for features, and the dual-write, backfill and reconciliation period adds operational work. The engineer states both costs openly rather than rounding them down. The dependent teams change no code, although one of them holds a schema change for several weeks because of the freeze.

**Reflection.** The original decision wasn't unreasonable given what was known, but its central assumption was never written down as an assumption, so nobody was watching for it to stop being true. The team's decision records now list the assumptions behind a choice and a trigger for revisiting it, such as a second production query that reads across devices.

**Sample wording.** A sample of how a candidate might say this, in their own words rather than these:

> "I led the choice of a key-value store for our device registry. We assumed nearly every read would be one device's record, and that anything across the fleet would go through the warehouse. About six months in, the firmware rollout team needed to find every device on a given version that hadn't checked in since its update, several times a day, on live data. Our table was keyed only by device ID, so that was a full scan, it was getting more expensive every month, and another team was planning a second query like it. So the access pattern I'd designed around wasn't the whole picture any more. I wrote a note that said which of my assumptions had failed and laid out three options: live with it, patch it with a secondary index we'd have to keep consistent ourselves, or move to a relational database. I recommended moving, but staged so we could stop at any point: the same API, so the two teams on top of us didn't change any code, then dual writes, a backfill of the existing records with a version check so it couldn't overwrite newer writes, a reconciliation job and background read comparisons, then reads moved one query at a time, and the old store retired only after two clean rollouts. I took it to the two dependent teams before the leads' meeting, and we agreed a schema freeze for the switch. It worked, but it wasn't free. It used most of a quarter we'd planned for features, and one team had to hold a change for a few weeks. The thing I changed afterwards is how we record decisions. My assumption was reasonable, but we never wrote it down as an assumption, so nobody was watching for it to break. Now our decision records list the assumptions and what would make us revisit them."

**Why it works.** The candidate owns both the original decision and the reversal, without defending the first choice or apologising for having made it. Their judgement shows in how the options are compared, including doing nothing, and in the staging, which puts the irreversible step last and builds in chances to stop. The migration mechanics hold up to a follow-up too: dual writes start before the backfill, and the version check stops the backfill from overwriting newer data. The dependent teams are protected by the design, through a stable API and a negotiated freeze, not just by being told. The costs are stated in terms an interviewer can weigh. The reflection produces a mechanism, recorded assumptions with revisit triggers, that makes the next failing assumption more likely to be noticed, whoever is on the team by then.

**How a weaker version differs.** One weaker version blames the rollout team for "changing the requirements", when the need was always plausible and the assumption was simply never tested. Another tells the migration as a clean technical success and leaves out the lost quarter and the held schema change, which an interviewer will usually ask about. A third presents the reversal as obviously right from the start and skips the comparison with patching, which is exactly the judgement the question is trying to see.
