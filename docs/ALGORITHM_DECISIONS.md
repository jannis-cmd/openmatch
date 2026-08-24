# Algorithm decision log

Every decision has a status, evidence basis, uncertainty, and falsification path.

| Decision | Status | Basis | What would change it |
|---|---|---|---|
| Hard constraints are mutual and evaluated before scoring | Adopted | Dating is reciprocal; boundaries express consent/feasibility rather than predicted taste | Safety or usability evidence showing a better boundary representation |
| Gender discovery uses public self-description, overlapping self-selected routing groups, and private reciprocal preferences | Provisional inclusive baseline | Binary/“other” forms erase people; dating identity data creates outing and harassment risks; orientation labels cannot safely or completely infer who someone wants to meet | Participatory research may change labels, number of groups, visibility, or abandon grouped routing; OpenMatch still must never infer gender or silently migrate an account |
| Candidate-side fit uses their explicit current preferences | Adopted | Reciprocal recommendation cannot be derived from one person's preferences; invented defaults would make the explanation false | A candidate can omit a soft factor, which is represented by zero weight—not an inferred substitute |
| Candidate factor traces are private unless explicitly shared | Adopted privacy baseline | Open algorithms do not require publishing personal preference data; privacy and transparency are separate properties | Specific consent research may support opt-in sharing; aggregate-score coarsening remains under review |
| Use explicit, user-set soft weights | Adopted for baseline | User control and scrutability; weak evidence for opaque prematch chemistry prediction | Prospective evidence that another transparent method improves mutually wanted later outcomes |
| Combine directed fit using harmonic mean | Hypothesis | Prevents a high one-sided score masking low fit for the other person; simple and auditable | Preregistered comparison against minimum, geometric mean, and eligibility-only lottery |
| Use coarse proximity with ideal/maximum radii and linear decay | Hypothesis | Geographic opportunity matters; linear form is comprehensible, not scientifically privileged | User research and outcome calibration across rural/urban cohorts |
| Admit prototype accounts only on exact normalized self-entered region equality | Temporary non-production constraint | The service has no privacy-reviewed geocoder, so inventing kilometer distances would make eligibility and explanations false; a separate reversible directory opt-in is required | Replace with researched coarse-region identifiers only after privacy, triangulation, inclusion, rural-opportunity, and usability review |
| Keep profile visibility on until the person pauses or hides it | Product simplification replacing prototype hypothesis | The earlier 30-day renewal added comprehension and accessibility burden without evidence that 30 days was optimal. A direct visibility control is understandable and avoids public last-active tracking. | Research stale-profile experience before a pilot; add a clearly explained check-in only if evidence shows it is needed. |
| Five-person batches reserve one public-seed exploration slot and seeded position; smaller batches reserve none | Hypothesis | Choice-overload/rejection evidence plus need to prevent feedback loops; 20% is deliberately round and inspectable, not scientifically privileged; a durable snapshot prevents repeated redraws | Preregistered comparisons on useful introductions, position effects, safety, wellbeing, and equitable opportunity; do not infer benefit from engagement proxies |
| Preference learning only proposes weight edits | Adopted safety constraint | Stated/revealed preferences differ, while exposure makes behavior observationally biased | Strong prospective causal evidence and governance approval; automatic changes still require opt-in |
| No personality-similarity score | Adopted | Couple studies find little/no incremental satisfaction effect | Independent prospective evidence on a defined prematch outcome |
| Never learn global desirability | Adopted mission constraint | Risks popularity concentration, discrimination, and treating people as inventory | Not subject to performance optimization; mission amendment would be required |
| Do not use message content or dwell time | Adopted privacy/mission constraint | Highly intimate surveillance and engagement proxy risk | Only a separately consented safety use with ethics review; never matching |

## Why the first learner is simple

A swipe is a response to a whole profile, position, moment, and exposed candidate pool. It is not a clean label for any single factor and cannot establish what creates a good relationship. The first learner therefore reports a shrunk association, corrects only known randomized exposure probability, and asks the user. Its code is small enough to inspect line by line.

## Required evaluation

Before production, generate synthetic populations and test invariants: hard boundaries never leak; swapping A/B preserves reciprocal score; increasing either directed fit cannot lower reciprocal fit; exposure uplift stays bounded; sparse feedback produces no suggestion; suggestions never mutate stored weights; deleting feedback fully removes its effect; protected and hidden fields never enter score traces.
