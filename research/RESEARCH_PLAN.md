# Open research program

## Research questions

1. What do people need to feel that an introduction was useful, fair, safe, and dignified?
2. Which pre-meeting information improves mutually desired introductions out of sample?
3. Which interface supports deliberate choice without suppressing opportunity?
4. Which safety interventions reduce harm without creating exclusion or false assurance?
5. How do outcomes and exposure differ across gender, orientation, ethnicity, disability, age, socioeconomic position, and relationship structure?

## Workstream A — evidence synthesis

Conduct a preregistered systematic/scoping review following PRISMA 2020 where applicable. Search PsycINFO, PubMed, Scopus/Web of Science, ACM Digital Library, IEEE Xplore, SSRN/arXiv for discovery, and citation chains. Cover 2000–present, with earlier foundational work.

Search blocks combine: online dating/dating application/speed dating; reciprocal recommendation/matching/compatibility; relationship formation/satisfaction/stability/second date; safety/harassment/scam/privacy; choice overload/rejection/ghosting; fairness/bias/exposure; user need/usability/accessibility.

Two reviewers independently screen and extract. Record population, geography, orientation inclusion, design, sample, preregistration, outcomes, effect/uncertainty, attrition, funding/conflicts, ecological validity, replication, and product relevance. Publish exclusions and update annually.

### Review streams

Run linked reviews rather than one unmanageably broad question:

1. pre-meeting predictors of mutual attraction, dates, second dates, and relationships;
2. long-term relationship predictors and whether they can validly transfer to prematch use;
3. reciprocal recommendation, market design, exposure concentration, and fairness;
4. choice volume, profile order, visual/text cues, messaging, and modality switching;
5. harassment, sexual violence, image abuse, fraud, impersonation, and reporting interventions;
6. privacy, location inference, identity/age/photo verification, and disclosure controls;
7. wellbeing, compulsive use, rejection, body image, and app abandonment;
8. experiences of LGBTQIA+, racialized, disabled, older, rural, and low-income users;
9. moderation, nonprofit governance, public-interest technology, and anti-engagement incentives.

For effectiveness questions, predefine comparison and outcome. “More matches” is not interchangeable with “more mutually wanted dates.” Maintain a structured database in which every result is tagged by funnel stage.

### Living-search cadence

- automated monthly alerts for systematic reviews and trials;
- quarterly title/abstract screen;
- annual full evidence and product-claim review;
- immediate review when a safety incident or proposed algorithm factor creates a new question;
- archived search strings, database dates, deduplication log, and versioned evidence snapshots.

## Workstream B — user needs

Use purposive maximum-variation sampling—not only existing power users.

1. Diary study with recent app users and people who stopped using apps.
2. Semi-structured interviews and journey mapping.
3. Participatory safety workshops conducted separately for groups with asymmetric risk.
4. Accessibility sessions with disabled users using assistive technology.
5. Concept testing of finite introductions, explanation designs, boundaries, reporting, and healthy exit.
6. Quantitative survey only after qualitative work establishes vocabulary; preregister instrument and analysis.

Recruit across genders, orientations, ages, relationship intentions/structures, urban/rural contexts, ethnicities, incomes, disability, and app success/failure histories. Compensate participants. Do not require disclosure in group settings.

Deliverables: needs taxonomy with prevalence uncertainty, harm map, jobs-to-be-done, excluded/non-user needs, ranked MVP requirements, and disagreement report. Public outputs are de-identified and disclosure-reviewed.

## Workstream C — instrument and signal validation

For each proposed signal:

1. define construct and causal hypothesis;
2. choose an existing validated, licensed measure if appropriate;
3. assess burden, cultural validity, accessibility, sensitive-data risk, and gaming;
4. preregister prospective outcome and minimum meaningful effect;
5. split development/validation cohorts by time or location;
6. compare against simple baselines: mutual constraints only, random eligible ordering, and user-selected priorities;
7. report calibration, discrimination, confidence intervals, missingness, subgroup performance, and harms;
8. ship only if benefit is practically meaningful, equitable, explainable, and independently reviewed.

Prefer ablation and simple models. Complexity must outperform the deterministic baseline on relationship-relevant outcomes—not clicks.

## Workstream D — algorithm experiments

Experiments are opt-in, preregistered, visible in the introduction explanation, and reviewed by an independent ethics body. No deception.

Candidate questions:

- finite batch sizes (1/3/5/10) and user-selected cadence;
- reciprocal harmonic score versus eligibility plus random order;
- soft-factor categories and user-set weights;
- explanation detail levels;
- exposure-balancing policies;
- profile information order;
- safe suggestions to move from chat to meeting.

Primary outcomes: mutually confirmed useful introduction/date/second-date intention. Safety events are guardrails. Engagement is diagnostic only and cannot win an experiment.

## Workstream E — long-term outcomes

Invite—but never require—matched pairs to separately report outcomes. Link pair reports using rotating study IDs; store contact data separately. Use short validated relationship measures only after ethics review, minimize cadence, and permit “prefer not to answer.” Never analyze message content.

Publish attrition, survivorship bias, selection effects, and the fact that users who leave are difficult to observe. Do not label breakup as algorithmic failure or continued relationship as success without participant-defined context.

## Workstream F — safety and privacy

- participatory threat modeling;
- red-team exact-location inference, enumeration, scraping, stalking, report abuse, and re-identification;
- test verification false acceptance/rejection across demographics;
- survivor-informed reporting evaluation;
- independent mobile/API security assessment;
- annual data-protection impact assessment;
- public incident postmortems.

## Open science artifacts

For every study publish protocol, preregistration link, analysis plan, synthetic schema, code, deviations, results including nulls, model card/algorithm sheet, and disclosure-reviewed aggregate data where consent and privacy permit. Use registered reports when feasible.

## Research gates

- No “science-based matching” marketing before prospective independent validation.
- No sensitive inferred trait enters production.
- No black-box model until a simple baseline is beaten on preregistered outcomes and an explanation can support meaningful user control.
- No broad launch before safety operations and subgroup opportunity thresholds pass.
