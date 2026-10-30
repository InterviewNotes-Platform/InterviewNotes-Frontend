---
id: lesson.amazon-leadership-principles
format: markdown@1
---
Amazon publishes a list of leadership principles on its jobs site. This Lesson uses the principle names, in the order that page lists them, as headings and takes nothing else from it. Every explanation, practice question and note below is InterviewNotes' own writing, aimed at software engineers rehearsing behavioral answers.

> *InterviewNotes-created practice material; not affiliated with or endorsed by Amazon or Google. Company hiring practices can change; these questions and signals are editorial preparation aids, not official questions or scoring rubrics.*

The questions are practice prompts written for this Lesson. They are not a list of questions any company is known to ask, and what a given interviewer asks, or listens for, can differ from anything here. Treat the principles as themes that help you examine your own experience, not as a checklist you must satisfy.

Each principle below has a short explanation, a note on what strong evidence tends to look like, and three practice questions. The note is editorial judgment about what makes a story easy to evaluate. It is not a description of how any company assesses candidates.

A few habits make the practice worth the time:

- Use real stories. Follow-up questions tend to expose borrowed or inflated ones, and the practice is only useful if the details are yours.
- Expect one story to serve several principles. A single project can show customer focus, ownership and a hard disagreement, depending on which part you tell. Build a small set of stories you know well and decide which angle each question calls for.
- Keep the structure simple: the situation and what was at stake, the decisions you personally made, what happened, and what you would do differently. If you want a refresher on that structure, the Behavioral Track's guidance on structuring answers applies to every question below.
- Say what you did, and be precise about what others did. Teams ship most engineering work, and credit stated accurately makes your own part easier to believe.

The Behavioral Track's Lessons are organised by seniority level and ask what scope of work a story should show. This Lesson is organised by principle instead, so it suits practising one experience from several angles. The two sets of questions are separate, and nothing here replaces the level-based Lessons.

## Customer Obsession

For an engineer, the customer is whoever lives with the consequences of the work: a shopper, a developer calling an API, a team that depends on your pipeline. The principle asks whether you learn what those people need from them rather than from assumptions about them, and whether you judge the work by what changed in their experience. A proxy that is easy to measure, such as median latency or tickets closed, can improve while the real experience stays the same or gets worse.

**Editorial note.** Strong evidence names a specific person or group, says how you came to understand their problem (a support thread, a session recording, a conversation, usage data) and shows a plan changing because of what you learned. It also closes the loop: what you measured afterwards, and whether it matched the pain you started from. A story where the customer appears only as a requirement handed down from someone else gives an interviewer little to work with.

### Feedback that reshaped the plan {#alp-customer-obsession-01}

The question: "Describe a time something a user or customer told you made you change a technical design you had already settled on. What did they say, and what did you change?"

### A convenient metric against the real outcome {#alp-customer-obsession-02}

The question: "Tell me about a decision where the metric your team tracked and the outcome users actually experienced pointed in different directions. How did you choose?"

### Confirming that a fix helped {#alp-customer-obsession-03}

The question: "Talk me through a recurring problem that users kept running into. How did you find the pattern, and how did you check that your fix reduced it?"

## Ownership

Ownership is about where your sense of responsibility stops. An engineer who owns a problem treats the ticket as one step toward a working outcome: they chase the dependency that has gone quiet, write down the sharp edge they discovered, and think about who will maintain the result next quarter. It does not mean doing everyone else's job or guarding work from others. It means not letting a gap persist merely because it fell between two teams' boundaries.

**Editorial note.** Strong evidence shows initiative in proportion to the situation: you raised the problem with the right people, took on the part that was reasonably yours and left things better than you found them. Look for the follow-through (the runbook, the alert, the regression test) and not only the first urgent fix. When the story involves a mistake, say plainly what was yours, what you did about the damage and what is different now.

### A problem nobody had assigned {#alp-ownership-01}

The question: "Tell me about a problem in production or on a project that was not formally yours, but that you took responsibility for. How did you decide to get involved?"

### Inheriting something fragile {#alp-ownership-02}

The question: "Describe a time you took over a system that was brittle or poorly understood. What did you do beyond getting it stable for the moment?"

### A mistake you owned {#alp-ownership-03}

The question: "Tell me about a mistake of yours that other people noticed. How did you handle the aftermath, and what changed so it was less likely to happen again?"

## Invent and Simplify

Two ideas share this principle. Invention is finding a new approach when the standard options do not fit. Simplification is removing parts that cost more than they give. The second is often harder to demonstrate, because complexity builds up through individually reasonable decisions: one more configuration flag, a layer of abstraction added for a future that never arrived. A good story treats a simpler design as a claim to be supported with evidence, not as something obviously better.

**Editorial note.** Strong evidence compares before and after in terms someone else could check, such as steps in a workflow, services or code paths, time to onboard, or incidents. It admits what was given up, since removing a feature or an abstraction usually costs someone something. For invention, look for the constraint that ruled out the conventional answer and for how you tested that the unusual one worked, rather than novelty for its own sake.

### Evidence that the simpler way won {#alp-invent-and-simplify-01}

The question: "Tell me about a process or piece of software that had grown more complicated than it needed to be. What did you simplify, and how did you know the result was better?"

### Working inside a hard constraint {#alp-invent-and-simplify-02}

The question: "Describe a time a tight constraint ruled out the usual approach and you had to find another way. What was the constraint, and what did you try?"

### Taking something out {#alp-invent-and-simplify-03}

The question: "Describe a time you deleted a feature, setting or abstraction that had stopped earning its keep. What convinced you it should go, and who felt the change?"

## Are Right, A Lot

Read literally, this principle sounds like a claim to be correct most of the time, which is not something an interview answer can establish. Read as an engineering habit, it is about how well your judgments hold up and what you do when they do not. Sound judgment under ambiguity comes from gathering the evidence that is cheap to get, asking people who disagree with you for their reasoning, being clear about how confident you are, and changing course when the facts move. An engineer who never revises an opinion does not show this, and neither does one who shifts with every new voice.

**Editorial note.** Strong evidence includes a decision made with imperfect information, the reasoning at the time and what happened afterwards, including any part that turned out wrong. The most persuasive stories show a deliberate attempt to disprove the preferred option (a test designed to fail it, a reviewer asked to attack it) and a specific update when the result came back. A spotless record is harder to believe than an honest one.

### Proved wrong by the data {#alp-are-right-a-lot-01}

The question: "Tell me about a time evidence showed that a technical opinion you held was mistaken. What was the evidence, and what did you do differently afterwards?"

### Deciding with gaps in the data {#alp-are-right-a-lot-02}

The question: "Describe an important decision you had to make while the available information was incomplete or contradictory. How did you limit the risk of being wrong?"

### Trying to break your own idea {#alp-are-right-a-lot-03}

The question: "Give an example of actively looking for evidence that would undermine the approach you preferred. What did you look for, and what did you find?"

## Learn and Be Curious

Curiosity at work is visible as behavior: noticing what you do not understand and doing something specific about it. A list of courses says little by itself. What carries weight is the connection between what you learned and what you then did differently. The principle covers the pressured case, where a project forces you to become competent in unfamiliar territory quickly, and the unpressured one, where an interest you followed turned out to be useful later.

**Editorial note.** Strong evidence describes how you decided what to learn first, how you checked your understanding (a prototype, a review by someone experienced, a deliberately hard test case) and what changed in the work. Feedback that exposed a gap is good material, provided the story includes the plan you made and a later sign that the gap had narrowed. Learning that never touches an outcome is hard for a listener to evaluate.

### Learning fast under pressure {#alp-learn-and-be-curious-01}

The question: "Describe a situation that required you to become competent quickly in a technology or problem area that was new to you. How did you approach it, and how did you know you had understood it?"

### Curiosity that paid off later {#alp-learn-and-be-curious-02}

The question: "Describe something you looked into purely because it interested you that later turned out to help your work or your team's."

### A gap someone else pointed out {#alp-learn-and-be-curious-03}

The question: "Tell me about feedback that showed you were missing a skill or a piece of knowledge. What did you do about it, and what was different afterwards?"

## Hire and Develop the Best

For engineers who are not managers, this principle is mostly about raising the people around you: how you review code, how you share what you know, how you help a teammate take on something just beyond their comfort. Where you have taken part in hiring, it also covers how you gather and weigh evidence about candidates, and how you handle a decision on which the people involved disagree. Developing people is different from doing their work for them or offering only praise. It usually involves honest feedback that the other person can act on.

**Editorial note.** Strong evidence is specific about the other person's starting point, what you did (a pairing plan, a staged set of tasks, written feedback with examples) and what they could do afterwards that they could not do before. Say how you adapted to that person instead of describing a generic mentoring method. For a feedback story, include how it was received and what you would change. Credit the other person's effort: the story is about their growth, not your generosity. For a hiring story, say what evidence you looked for, how you kept your judgment consistent across candidates and what you did when your view differed from the group's; a recommendation you later revised is useful material. Keep candidates anonymous: leave out names and any detail that could identify them. If hiring has not been part of your work, the first two questions are the better fit.

### Helping a teammate step up {#alp-hire-and-develop-the-best-01}

The question: "Describe how you helped a colleague build a skill or take on more responsibility. Where were they starting from, and what did you do?"

### Hard feedback that improved the work {#alp-hire-and-develop-the-best-02}

The question: "Describe a time you had to give a colleague difficult feedback about their work. How did you prepare, how was it received, and what changed?"

### Weighing evidence about a candidate {#alp-hire-and-develop-the-best-03}

The question: "Describe a time you took part in evaluating a candidate or making a hiring recommendation. What evidence did you weigh, and how did you handle uncertainty or a view that differed from someone else's in the decision?"

## Insist on the Highest Standards

Standards show up in what you refuse to let slide. For an engineer that means making quality checkable (tests, review norms, alerts, a clear definition of done) and treating a recurring defect as evidence about the process rather than bad luck. This is not perfectionism. Standards are applied where the cost of failure justifies them, and a thoughtful engineer can explain where they chose not to polish further.

**Editorial note.** Strong evidence states the standard you held to and why it mattered for this particular system, the pressure against it (a deadline, a reluctant teammate, a cost) and how you handled that pressure without simply overriding people. Root-cause stories are most convincing when they show the investigation that separated cause from symptom and a measurement afterwards showing the problem had stopped recurring. A problem caught before users saw it is good evidence, as long as you can say how it was caught.

### A defect caught in time {#alp-insist-on-highest-standards-01}

The question: "Tell me about a serious quality problem you found before it reached users. How did you find it, and what did you do next?"

### Raising the bar under pressure {#alp-insist-on-highest-standards-02}

The question: "Describe a time you pushed for a higher engineering standard while there was schedule pressure or resistance from colleagues. How did you make the case?"

### Fixing the cause, not the symptom {#alp-insist-on-highest-standards-03}

The question: "Give an example of a defect that kept coming back until you dealt with what was underneath it. How did you find the real cause, and how did you confirm it was gone?"

## Think Big

Thinking big does not mean proposing a rewrite. It means noticing that the task in front of you may be one instance of a larger problem, and being able to connect a longer-term direction to a first step someone could approve this quarter. For engineers the larger idea is often a shared service, a better developer workflow, or capacity planned ahead of growth. An ambitious idea that cannot be reduced to a credible sequence of steps is an aspiration, not a plan.

**Editorial note.** Strong evidence shows how the idea grew from a concrete observation (repeated work, a trend in usage, a recurring incident), what the first increment was and how you persuaded the people who had to invest. Be honest about the outcome: an idea that was partly adopted, or deferred for good reasons, can make a better story than one that went perfectly. Show that you weighed the cost of the larger investment against simply finishing the original task.

### Widening a project's reach {#alp-think-big-01}

The question: "Walk me through a proposal of yours that stretched a project past its original scope so that it reached more people. What led you to see the larger opportunity?"

### Preparing for growth early {#alp-think-big-02}

The question: "Describe a time you saw a growth or usage need coming before anyone was asking for it. What signals did you notice, and what did you do about them?"

### Winning support for a longer-term investment {#alp-think-big-03}

The question: "Give an example of persuading others to invest in an improvement that would only pay off over a longer period. How did you make the case, and how did you break it into steps?"

## Bias for Action

Speed matters in engineering when waiting has a price: a bug users keep hitting, a teammate blocked on your answer, a window that is about to close. The useful skill is sorting decisions by how easily they can be undone. A choice behind a feature flag, a canary rollout or a throwaway prototype can be made quickly because the cost of being wrong is small and the result teaches you something a longer discussion would not. A choice that is expensive to reverse, such as a data migration or a public API, deserves more care. Moving fast without that sorting is simply haste.

**Editorial note.** Strong evidence says what the delay would have cost, how you judged the decision reversible or not, and what made it safe to move quickly (a flag, a rollback plan, a small blast radius). It then shows the follow-up: when you checked whether the call was holding up, and what you did when it was not. A story where speed came from skipping a review that existed for good reason is a weak example.

### Acting when waiting is the risk {#alp-bias-for-action-01}

The question: "Describe a situation where waiting for more certainty would itself have caused harm, such as a blocked team or a worsening outage. What did you do instead of waiting, and what made that acceptable?"

### A quick call on an easy-to-undo choice {#alp-bias-for-action-02}

The question: "Give an example of a choice you judged easy to reverse and settled quickly so the team could keep moving. How did you decide it was safe to treat that way?"

### Adjusting a decision made in a hurry {#alp-bias-for-action-03}

The question: "Tell me about a fast decision that you later reversed or adjusted. What signal told you it was not holding up, and how soon did you act on it?"

## Frugality

Constraints are a design input. In engineering, frugality is the habit of asking whether a problem really needs more resources (more servers, more people, another vendor) or a sharper look at what is already being spent. Cost covers more than the cloud bill: engineer time, on-call attention and the upkeep of everything the team has built all count. The aim is the best outcome for what is genuinely scarce, which is not always the cheapest option. Cutting a cost that users or operators then pay for in quality only moves it somewhere else.

**Editorial note.** Strong evidence names the scarce resource (budget, headcount, time, latency, on-call attention) and compares before and after in units a listener can check, such as a monthly bill, hours of work or instance counts. It says what was deliberately left out or given up, and how you confirmed that quality held. Be wary of a story whose savings quietly became another team's workload.

### A real result on a thin budget {#alp-frugality-01}

The question: "Describe an improvement you delivered with far less money, hardware or headcount than the obvious approach would have needed. What did you leave out, and what did you reuse?"

### Lowering cost without users noticing {#alp-frugality-02}

The question: "Give an example of reducing the running cost of a system, such as compute, storage, query volume or on-call load. How did you confirm that users did not feel the change?"

### Features the team chose not to build {#alp-frugality-03}

The question: "Walk me through a case where building and maintaining everything on the wish list would have cost more than the team could justify. Which resource was the limit, how did you decide what to cut, and who needed convincing?"

## Earn Trust

Trust at work builds from small, checkable behaviors: doing what you said you would do, reporting bad news early and plainly, and admitting what you do not know. For engineers it shows up in status updates, estimates, incident communication and code review. Earning trust does not mean being agreeable. People trust the colleague whose account of a situation later turns out to match reality, unflattering parts included. It also runs in both directions, because how you respond when someone is candid with you decides whether they stay candid.

**Editorial note.** Strong evidence is specific about what was said, to whom and when, especially at the uncomfortable moment: the slipped date, the wrong estimate, the outage you caused. It shows the repair as a concrete change in how you communicate or commit, and a later sign that the relationship recovered. Feedback stories land when they show you acting on what you heard, not only listening. Framing that shifts the blame elsewhere undermines the point of the story.

### Repairing a broken commitment {#alp-earn-trust-01}

The question: "Describe how you handled the aftermath of missing a commitment or breaking something others depended on. What did you say first, and what changed so your next commitment could be believed?"

### Delivering bad news about the system {#alp-earn-trust-02}

The question: "Give an example of telling stakeholders something unwelcome about a technical situation, such as a slipped date, a flawed design or a risk nobody wanted to hear. How did you frame it, and how did they respond?"

### Feedback on how you work with others {#alp-earn-trust-03}

The question: "Tell me about feedback on how you work with people, rather than on your technical skill, that was uncomfortable to hear. What did you do with it, and did the person who gave it notice a difference?"

## Dive Deep

Dashboards summarize, and summaries hide things. Diving deep means getting close to primary evidence, such as the logs, the query plan, the raw records or the trace, instead of relying on an aggregate metric or the story the team has settled on. It also means moving between levels (the user's symptom, the service, a dependency, the data) until the explanation accounts for every observation, including the ones that do not fit. Depth costs time, so it pays off most where a surface fix would probably be wrong or would not last.

**Editorial note.** Strong evidence walks through the investigation as a series of hypotheses, each with the observation that ruled it in or out, instead of announcing only the answer. Say what the first explanation was, what contradicted it, and how you confirmed the final cause (a reproduction, a targeted experiment, a fix checked against the original signal). Credit the people whose knowledge shortened the search. A conclusion without its evidence trail sounds like hindsight.

### A first theory that did not hold {#alp-dive-deep-01}

The question: "Describe an investigation in which your first theory about a failure turned out to be wrong. What evidence did you collect that pointed somewhere else?"

### When the data and the story disagree {#alp-dive-deep-02}

The question: "Give an example of a time the data conflicted with the explanation most of the team favored. How did you establish which one was right, and what happened to the disagreement?"

### Tracing a problem across layers {#alp-dive-deep-03}

The question: "Walk me through a performance or reliability problem you traced across several parts of a system, such as client, service, database and network. How did you decide which layer to inspect next?"

## Have Backbone; Disagree and Commit

This principle has two halves that depend on each other. The first is saying a disagreement out loud, with reasons and evidence, to someone who can act on it, even when that person is more senior or the room is leaning the other way. The second is putting real effort behind a decision once it is made, including one you argued against. Without the first, doubts surface later as quiet resentment or silent failure. Without the second, a lost argument becomes slow-walking. Neither half calls for stubbornness or deference: changing your mind when you hear a better argument is part of it.

**Editorial note.** Strong evidence shows what each side believed and why, how you raised your view (the evidence, the timing, the right forum) and what happened to your position. For the commitment half, give concrete actions: how you carried out the decision, and what you did when a risk you had flagged appeared. Stories where you were proven right are less telling than ones where you changed your mind or committed fully to a choice you would not have made.

### Challenging a more senior decision {#alp-have-backbone-disagree-and-commit-01}

The question: "Describe a time you pushed back on a decision from someone with more authority than you. What evidence did you bring, and how did you choose when and where to raise it?"

### A disagreement that moved someone {#alp-have-backbone-disagree-and-commit-02}

The question: "Give an example of a technical disagreement that ended with you changing your position, or with the group reaching a better answer than either side started with. What shifted?"

### Backing a choice you argued against {#alp-have-backbone-disagree-and-commit-03}

The question: "Tell me about a direction you supported fully after your preferred option was not chosen. What did you do to help it succeed, and what happened to the concerns you had raised?"

## Deliver Results

Delivery is judged by outcomes that matter to the people depending on the work, not by effort or activity. For an engineer that starts with agreeing on what done means, then protecting the few things that must ship when everything cannot. It continues with adapting the plan when a dependency slips, a requirement shifts or an estimate proves wrong. Getting results sometimes means cutting scope openly or telling people early that a date will move. A result achieved by hiding a quality compromise or exhausting the team has been postponed, not delivered.

**Editorial note.** Strong evidence states the commitment and why it mattered, the obstacle, the options you considered and the one you chose, and a result someone else could verify. Say what was traded away and whether the people affected knew. A missed target can make a strong story if the account of what you communicated and changed is honest. Describe a team effort as one, and be precise about your own part.

### Delivering through a setback {#alp-deliver-results-01}

The question: "Tell me about a commitment that looked at risk partway through because of something unexpected. What options did you weigh, and what did you deliver in the end?"

### Deciding what would not get done {#alp-deliver-results-02}

The question: "Describe a stretch when the work on your plate exceeded what could be finished. How did you choose what to drop or delay, and how did you tell the people affected?"

### A target you did not hit {#alp-deliver-results-03}

The question: "Give an example of falling short of a result you had promised. What did you tell people and when, and what changed in the way you plan or deliver afterwards?"

## Strive to be Earth’s Best Employer

At the scale of one team, this principle is about the working conditions you can influence: whether people can raise a concern without penalty, whether the workload is sustainable, whether people from different backgrounds get the same chance to contribute and grow, and whether a struggling teammate gets help rather than a label. Engineers without a management title still shape these things through the tone of code review, how meetings run, how on-call is shared and who gets the interesting work. Delivery and people are not in opposition, since teams that wear people out tend to pay for it later in turnover and avoidable mistakes.

**Editorial note.** Strong evidence is concrete about what was uneven or wrong (a rotation that fell on a few people, a review culture that silenced newer engineers), what you changed, and how you learned it helped, ideally from what colleagues told you or a visible shift rather than your own impression. Describe conflicts and personal difficulties without identifying or disparaging anyone. If the fix relied on you giving up your own time, say whether it was sustainable.

### Making it easier to speak up {#alp-strive-to-be-earths-best-employer-01}

The question: "Describe a change you made so that quieter or newer teammates could contribute more fully, whether in reviews, meetings, on-call or planning. How did you notice the problem, and what changed?"

### A conflict handled with people in mind {#alp-strive-to-be-earths-best-employer-02}

The question: "Give an example of a team conflict that threatened both the delivery and someone's willingness to take part. How did you handle it so that the work and the people were both protected?"

### Noticing an unsustainable workload {#alp-strive-to-be-earths-best-employer-03}

The question: "Walk me through a case where you noticed that a colleague's workload was becoming unsustainable. What did you see in the work or in the team's practices, what did you change, and how did you check that it helped?"

## Success and Scale Bring Broad Responsibility

Software that succeeds reaches people, systems and situations its authors never pictured. This principle asks you to look past a feature's own goals to its second-order effects: who bears the cost when traffic grows, what a privacy shortcut means once the data set is large, who cannot use the interface, what the next on-call rotation inherits, and what happens to users in the unusual case. In practice that habit looks like threat modelling, data minimization, accessibility checks and abuse and load thinking before launch, repeated afterwards because some effects only appear at scale. It is a matter of proportion, not a reason to refuse to ship.

**Editorial note.** Strong evidence names a specific party beyond your own team (users with disabilities, a downstream service, the people whose data was held, the on-call engineers), how you came to see the effect (a review, an incident, a question someone asked) and what you did: a change before release, a mitigation, or raising it with whoever owned the risk. Show the weighing, including what the short-term cost was and who agreed to bear it. Concern that blocks all progress is not the goal; show how you sized the response to the risk.

### A success that caused trouble elsewhere {#alp-broad-responsibility-01}

The question: "Describe a case where a feature or system that was working well for its own users created an unexpected risk or cost for someone else, such as another team, a downstream service or a group of users. How did you find out, and what did you do?"

### Building in privacy, security or access {#alp-broad-responsibility-02}

The question: "Give an example of shipping a technical change while taking care of privacy, security, accessibility or safety. What did you consider that was not in the original requirements, and what did it cost?"

### The long-term effect against the quick win {#alp-broad-responsibility-03}

The question: "Walk me through a choice in which the short-term benefit pointed one way and the wider or longer-term effects pointed another. How did you weigh them, and who was involved?"
