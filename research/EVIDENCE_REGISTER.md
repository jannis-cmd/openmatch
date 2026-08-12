# Evidence register

This is a living claim ledger, not a marketing bibliography. Each product claim must link to a row, disclose limitations, and receive an evidence grade.

Grades: **A** systematic review/large multi-study evidence; **B** peer-reviewed field or multi-study evidence; **C** single/limited study; **D** descriptive survey/qualitative evidence; **H** unvalidated hypothesis.

| Claim | Evidence | Grade | Limitations | Product decision |
|---|---|---:|---|---|
| Existing matching-algorithm claims exceed demonstrated ability to predict long-term compatibility | Finkel et al. (2012), *Psychological Science in the Public Interest*, DOI 10.1177/1529100612436522 | A | Review predates modern systems; proprietary data unavailable | Never claim “scientifically proven”; require prospective validation |
| Pre-date romantic desire toward a particular person is difficult to predict from self-report traits | Joel, Eastwick & Finkel (2017), *Psychological Science*, DOI 10.1177/0956797617714580 | B | Speed-dating settings; initial desire, not long-term outcomes | Use algorithm for introductions, not predicted chemistry |
| Relationship-specific variables outperform individual differences for current relationship quality | Joel et al. (2020), PNAS, DOI 10.1073/pnas.1917036117 | A | Mostly established couples; predictive ceiling and causal meaning limited | Do not retrofit post-relationship predictors into pre-date claims |
| Personality similarity adds little/no relationship-satisfaction prediction | Van Scheppingen et al. (2023), *Journal of Research in Personality*, DOI 10.1016/j.jrp.2023.104336 | B | Two age-heterogeneous, primarily different-sex couple datasets | Exclude Big Five similarity from v0 |
| Dating recommendation is reciprocal rather than one-sided | Pizzato et al. (2013), *User Modeling and User-Adapted Interaction*, DOI 10.1007/s11257-012-9125-0 | B | Operational outcomes are not relationship success | Use mutual eligibility and harmonic two-sided fit |
| Large sets can reduce satisfaction and repeated rejection can create a rejection mindset | D’Angelo & Toma (2017), DOI 10.1080/15213269.2015.1121827; Pronk & Denissen (2020), DOI 10.1177/1948550619866189 | B | Lab/context effects; literature is not uniform | Finite default batches; test cadence and allow user control |
| Safety and harassment burdens are substantial and unequal | Pew Research Center (2023), “From Looking for Love to Swiping the Field” | D | U.S. self-report; limited categories and causality | Safety is a primary outcome; targeted participatory research |
| Location-based apps leak sensitive data and can enable precise location inference | Dhondt et al. (2024), USENIX Security, “Swipe Left for Identity Theft” | B | Sample of 15 apps and snapshot in time | Coarse location, bucketed distance, API adversarial testing |
| Stated preferences do not straightforwardly reveal individual choices | Zhao et al. (2025), DOI 10.1177/08902070241286254 | B | Speed-dating; design constraints affect observed correlations | Do not silently learn a hidden “true type”; research explicit feedback |
| Popularity-biased exposure can create unfair feedback loops | Abdollahpouri et al. (2019), arXiv:1910.05755; reciprocal-specific literature | C | Definitions of fairness are normative; much work uses non-dating domains | Publish exposure audits; exploration; community-set fairness goal |
| Moving offline is an important screening transition | Ramirez et al. (2015), *Journal of Computer-Mediated Communication*, DOI 10.1111/jcc4.12101 | C | Observational/self-report and older platform context | Support, never pressure, safe modality switching |
| App-store reviews reveal recurring experience themes but are not representative user-needs research | Zhang & Pan (2023), PLOS ONE, DOI 10.1371/journal.pone.0283896 | C | Review-selection bias; text-mining validity limits | Use as discovery input, not requirements proof |
| Unique pair-specific impressions after meeting predict later interest and dating | Eastwick et al. (2023), PNAS, DOI 10.1073/pnas.2206925119 | B | Signal is observed after brief interaction; speed-dating context | Help people interact; do not claim profiles contain chemistry |
| Sexual harassment crosses online and offline stages and takes multiple forms | Gillett (2023), *Trauma, Violence, & Abuse*, DOI 10.1177/15248380231162969 | A | Scoping review finds substantial definition/prevalence gaps | No image messaging at MVP; reports accept online and offline harm |
| Romance fraud is adaptive, multi-stage, and poorly served by victim-blaming warnings | Shepherd et al. (2023), *Interacting with Computers*, DOI 10.1093/iwc/iwad058 | A | Intervention effectiveness evidence remains limited | Contextual friction, human escalation, evidence support, recovery pathway |
| Closeted users face outing, photo misuse, extortion, and data-sharing fears | Li et al. (2024), PoPETs | C | Qualitative US sample | Separate identity/eligibility/visibility; no ads/contact discovery; neutral notifications |
| Disabled users face access barriers, stigma, disclosure dilemmas, and security concerns | Liddiard et al. (2023), *Sexuality and Disability*, DOI 10.1007/s11195-022-09771-x | A | Small heterogeneous evidence base, including grey literature | Co-design disclosure, accessibility, date needs, and fetishization reporting |
| A verification interface can raise perceived trust but does not demonstrate actual safety | Huang et al. (2013), “Bootstrapping Trust in Online Dating” | C | 161-person perception study; social-graph privacy cost | Badges state narrow assurance and limitations; no “safe user” badge |
| Online/offline meeting venue has inconsistent small associations with later outcomes | Cacioppo et al. (2013); Hu et al. (2024), DOI 10.1089/cyber.2024.0136 | C | Observational, selection/cohort effects, conflicting direction | Do not claim online formation is superior; measure local outcomes prospectively |
| Practical risk-reduction and scam guidance should be reachable before harm is reported | RAINN, “Tips for Safer Dating: Online & IRL” (2026); U.S. FTC, “What To Know About Romance Scams” (reviewed 2026) | D | Authoritative practice guidance, not evidence that warnings prevent harm; emergency and support services vary by location | Keep concise guidance always reachable; link maintained sources; state that the app cannot guarantee safety or provide emergency help |
| External-link and payment-request warnings may provide useful contextual friction | FTC romance-scam guidance (reviewed 2026); Rege (2009); Buchanan & Whitty (2014); Cross (2025) crime-script synthesis in the literature map | D | Scam tactics adapt; keyword rules have false positives and false negatives; no evidence here validates OpenMatch's wording or effectiveness | Publish exact rules; warn rather than accuse; allow human override; retain no suspicion label; never alter matching or visibility; prospectively evaluate safety and unintended effects |

## Preliminary user-needs synthesis

These are discovery themes to validate, not universal requirements:

- **Safety and control:** easy blocking/reporting, control over disclosure, reduced unwanted sexual contact, and trustworthy response processes. Supported by Pew’s uneven harassment findings and qualitative safety literature.
- **Authenticity and aligned intent:** clearer relationship intentions and fewer deceptive or inactive profiles. Frequently appears in app reviews and surveys, but needs representative local research.
- **Useful choice without exhaustion:** enough opportunity to find someone while avoiding repetitive high-volume rejection. Experimental findings are mixed enough that batch size must remain user-controllable and tested.
- **Fair opportunity:** avoid concentrating visibility among already popular profiles and show users how exposure works. The technical problem is established; the legitimate fairness target requires community governance.
- **Privacy:** minimize exact location and intimate-data exposure while making visibility legible. Security audits demonstrate concrete failures in existing apps.
- **A path off the app:** communication should support safe real-world assessment because profile compatibility cannot establish chemistry.
- **Price and ranking equality:** nobody should need to pay to be seen, express interest, inspect likes, filter on boundaries, communicate, block, or obtain support. This is principally a mission/governance requirement, not an empirical claim.

Needs research must explicitly include people who abandoned dating apps and people underserved by mainstream product assumptions; app-store reviews alone systematically miss them.

## Explicitly unsupported at v0

- “Our score predicts relationship success.”
- “More similar personalities make better couples.”
- “Attachment style matching improves outcomes.”
- “AI can identify chemistry from profiles, faces, or messages.”
- “A fixed number of daily matches is universally optimal.”
- “Verification makes dating safe.”

## Source policy

Prioritize preregistered studies, systematic reviews, longitudinal outcomes, diverse samples, validated measures, open materials/data where ethical, and independent replication. Record conflicts of interest and funding. Do not convert correlational findings into causal features. Never use a construct merely because it has a psychological label.
