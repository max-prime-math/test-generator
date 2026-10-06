---
title: Pre-Calculus 40S provincial generator audit
---

# Pre-Calculus 40S provincial exam generator: initial audit

Date: 2026-10-05. This is a design and coverage study, not an implementation or a claim of complete exam reproduction.

## Sources and scope

The local `manitoba-precalculus-40s-provincial-exams-documents` checkout contains **967 question records across 21 exam sittings** (January/June 2013–2019, January 2020, January/June 2024–2026). The `manitoba-precalculus-40s-provincial-exams` checkout contains 699 records, all identical to their counterparts in the larger checkout. They are overlapping copies, not 1,666 distinct questions. The larger checkout also holds the image assets; the smaller checkout's local images directory is empty.

The corpus has 557 relations/functions, 281 trigonometry, and 129 counting/binomial questions. Its format metadata reports 779 written response, 186 multiple choice, and 2 matching questions. Matching tasks also occur inside records tagged `frq`, so format metadata is not a complete description of the task. 103 records are tagged calculator-active and 864 no-calculator. All have solution text. 292 have nonempty image metadata, which includes supplied graphs, blank response grids, decorative images, and occasionally assets not referenced in the prompt. This is not a count of 292 mathematically essential diagrams.

Method: inventoried the complete corpus; read all prompts/choices in January 2013, June 2025, January 2026, and June 2026; sampled contextual/reasoning tasks across every remaining sitting; visually inspected the supplied graphs for June 2026 Q9 and June 2025 Q14. Inspected generator metadata, generated one sample at each of three levels for all 127 PC40S generators, and read the relevant implementations to investigate specific gaps. Sample generation demonstrates execution, not mathematical or rendering validation.

The existing bank [audit dashboard](../../../../../banks/pre-calculus-40s-banks/audits/provincial-manual/PROGRESS.md) documents unresolved source/OCR repairs. Use reviewed prompts and independently checked mathematics as reference cases; do not automatically turn raw solution text into a trusted answer oracle. This study did not recheck every marking guide or visually inspect every diagram.

Supporting files:

- [exam-index.csv](exam-index.csv): all 967 IDs, source paths, outcomes, marks, formats, calculator tags, image flags, and generators sharing an outcome. These are **topic candidates only**, not verified matches. Most entries remain explicitly unassessed for detailed reproduction.
- [june-2026-mapping.csv](june-2026-mapping.csv): initial task mapping for every question in the latest sitting, with related generator IDs and concrete work required. `related-existing` means the same broad task family exists; `extend` means a nearby generator needs a new task/form/model; `new` means a new family or substantial mathematical model is needed. These labels are design judgments, not acceptance-test results or a ready-to-generate percentage.

## Main finding

The existing generator is broad: **127 PC40S problem types with 272 option specifications**, including graphs, identity proofs, worked solutions, and some error analysis. We should build on it. Provincial-style coverage requires much greater depth within those topics and the ability to reuse one mathematical model across several related tasks.

The exams change the direction of a task: calculate a feature, construct a function with that feature, explain why the feature must hold, identify a student's mistake, or use that feature in a graph. Outcome overlap alone does not demonstrate coverage. Difficulty levels cannot substitute for explicit task selection.

A quick text scan finds 32 records with error-related words and 101 with explanation/justification wording; those flags overlap and are heuristic, not exhaustive classifications. Seventy-two contain a literal first-part `a)` marker, again a lower-bound signal rather than a full multipart census.

## Concrete gaps and reusable starting points

| Family | Exam evidence | Current starting point | Work required |
| --- | --- | --- | --- |
| Exact trig expressions | June 2026 Q25; January 2026 Q37 | `ratio-exact` | Combine several ratios, powers, sums and products into one exact expression; simplify radicals correctly. |
| Two-angle identities | June 2026 Q31; June 2025 Q35; January 2025 Q31 | `ratio-given-one`, `id-exact-sum-diff` | Given ratios of two unknown angles, infer signs from quadrants, recover missing ratios, and calculate a sum/difference. The current sum/difference generator uses explicit angles and recognition templates. |
| Binomial task variety | June 2026 Q4/Q11; January 2026 Q2; June 2025 Q3; June 2016 Q26 | `bin-term`, `bin-term-power`, `bin-expand` | General monomials including negative powers; numbered/middle/specified-power/constant terms; coefficient versus full-term answers; count signs and justify absent powers. |
| Annuities and payment counts | June 2026 Q3; June 2014 Q3; June 2016 Q4; January 2019 Q3 | `exp-finance` | Repeated deposits, present-value loans, withdrawals, and whole-payment/partial-payment interpretation. The existing generator models a single invested principal. |
| Contextual exponential models | January 2026 Q3; June 2025 Q2 | `exp-growth-decay`, `exp-logs` | Continuous exponential models, vertical shifts, infer rate from observations, and linked evaluation/time tasks. |
| Graph operations | June 2026 Q9/Q13; June 2025 Q14; January 2013 Q39 | `op-abs-reciprocal`, `op-sketch`, `op-from-graphs`, transformation generators | Combined absolute value/reflection/stretch, graph products, linked quotient/graph tasks, and solving for an input from a graph. `op-sketch` currently provides sums/differences; products require more than connecting resulting vertices. |
| Polynomial depth | June 2026 Q15/Q33; January 2026 Q10; June 2025 Q16 | `poly-sketch`, `poly-factor`, `poly-divide` | Degree-five graphs, characteristics-first prompts, higher multiplicities, a supplied factor, coefficient-order/omitted-zero error analysis, and irreducible quadratic factors. |
| Rational model breadth | June 2026 Q6/Q29; June 2025 Q8; January 2024 Q29 | `rat-features`, `rat-sketch` | Construct from constraints; positive quadratic denominators with no real poles; repeated poles; range reasoning. Current rational models use lists of real linear factors. |
| Radical tasks | June 2026 Q7/Q37; June 2025 Q11; January 2026 Q26 | `rad-domain-range`, `rad-sqrt-f-domain`, `rad-sketch-sqrt-f` | Construct from domain/range, infer range from arbitrary supplied graphs, and matching sets. Formula-based square-root graph support already exists. |
| Counting conditions | June 2026 Q2/Q40/Q41; June 2025 Q34; January 2026 Q24 | `pc-combinations`, `pc-conditions`, `pc-factorial`, `pc-ncr-equation` | Required/forbidden people, alternating letters, repeated-letter reasoning, shifted factorial equations, symmetry equations, and factorial-expression answers. Existing vowel conditions ask for together/first, not alternation. |
| Open-ended reasoning | June 2026 Q6/Q7/Q38; January 2026 Q15/Q42 | Features, domain, identity and proof generators | Constraints plus a valid example and explanation; multiple acceptable answers; counterexamples and proof-versus-numerical-verification tasks. |
| Error diagnosis | January 2026 Q10/Q30; June 2026 Q36; June 2024 Q34 | `te-find-error` and underlying skill generators | Explicit mistake libraries for synthetic division, logs, transformations, counting, identities and graphing, beyond trig-equation mistakes. |
| Linked parts | January 2026 Q3/Q11/Q14; June 2026 Q13/Q30/Q35 | Individual generators plus existing question-parts support | One shared model, separate task answers/marks, consistent graphs, no answer leakage between parts. |

## A concrete graph recreation

June 2026 Q9 supplies a piecewise-linear graph with vertices `(0,0), (1,3), (2,0), (3,-3), (4,0)` and asks students to sketch `2|f(-x)|`. The inspected image makes these points and its closed endpoints explicit.

A reusable family can generate a vertex list, reflect the input, insert every zero crossing, apply absolute value to the output, and scale it. This reference case has transformed vertices, in left-to-right order:

`(-4,0), (-3,6), (-2,0), (-1,6), (0,0)`.

Teacher controls can choose reflection, stretch, horizontal/vertical shift, absolute value inside/outside, vertex count, and domain endpoints. The graph, answer, and explanation all come from the same data. Questions can ask for the whole sketch, a transformed point, domain/range, invariant points, or an error diagnosis.

June 2025 Q14 supplies two line graphs and asks for their product. Multiplying linear pieces generally produces quadratic pieces; taking products only at the original vertices and connecting them with straight lines would be wrong. Generate actual piecewise function models and evaluate the product on each common interval.

## Suggested generator architecture

Separate the mathematical model from the question asked about it, while preserving existing generator IDs and saved seeds.

1. **Model:** exact coefficients, expressions, domains, graph segments/endpoints, context units and parameters. Use fractions and exact radicals internally, not formatted strings as the mathematical source of truth.
2. **Task:** evaluate, solve, sketch, infer equation, construct, explain, compare, find error, verify, prove, or match. Each task has preconditions and a clear answer contract.
3. **Presentation:** calculator policy, exact/approximate output, specified rounding, given formula, lettered parts, marks, workspace, graph window, labelled points and source/example links.
4. **Solution:** answer per part, worked reasoning and marking steps, original restrictions, and alternate valid answers where appropriate.
5. **Variants:** seeded parameter generation constrained to valid, instructionally useful cases. “Make a similar question” keeps the task and structure; it must not randomly turn a sketch into an evaluation task.

The current `GeneratedProblem` contract has body, answer, distractors and solution strings; `Generator` has a fixed point value and metadata/options. Question-parts support exists elsewhere in the app, but the generator contract does not represent shared models, per-part answers/marks, calculator policy, rubric steps, or source exemplars. Add these incrementally rather than replacing the existing registry.

A teacher-facing task picker should expose the distinctions that matter: “given one ratio”, “given two ratios”, “evaluate a full expression”; “nth term”, “middle term”, “term containing x^k”; “sketch”, “read features”, “construct from features”, “explain an error”. Retain difficulty presets and use named exam examples to show what each task produces.

Two modes would serve the long-term goal:

- **Reference recreation:** fixed parameters reproduce the mathematical structure of a particular bank question and establish an acceptance case. Faithful layout is a separate acceptance criterion.
- **Practice variants:** change parameters/context under constraints while retaining the reference task, solution path and intended marks.

Initially, a reference can be developer-authored structured data. Do not promise that arbitrary OCR text or an image can already be converted automatically into a generator.

## Construction and correctness rules

- Construct polynomial equations from roots/factors; retain multiplicities and supply a chosen factor when appropriate.
- For trig equations, control interval endpoints, frequency, angle units, exact versus approximate solutions, repeated roots and impossible ratio values. Both `0` and `2π` belong in the answer when a closed domain admits them. For coupled-angle problems, verify quadrant compatibility.
- For binomial terms `(a x^p + b x^q)^n`, term `r+1` has exponent `p(n-r)+qr` and coefficient `C(n,r)a^(n-r)b^r`. Use that expression to choose reachable powers, deliberately unreachable powers, middle terms and sign patterns.
- Retain the original domain through cancellations, composition and logarithmic transformations. A cancelled factor creates an excluded point; it does not restore that point to the domain.
- For annuities, periodic interest is annual decimal rate divided by periods per year. Choose financially feasible parameters. Test the count just below/at the proposed answer; distinguish rounding up to reach a savings target from counting full payments and a final partial payment.
- Derive context values, graphs, answers and marking steps from one model. Labelled coordinates, holes, extrema and intercepts must fit the printed window. A blank response grid must not show the answer.
- Generate wrong work from named misconceptions, then verify it is wrong for the selected parameters. A distractor needs mathematical distinctness, not just a different text string; equivalent sine/cosine equations can both be valid answers.
- Construct/proof/explanation tasks should remain written where multiple-choice choices would make several answers valid or flatten the intended task.

## Implementation sequence

1. **First family: exact trigonometry.** Add compound exact-value expressions and two-angle ratio/quadrant tasks. Use June 2026 Q25/Q28/Q31, June 2025 Q28/Q35/Q46 and January 2025 Q31 as concrete reference cases. Build/reuse exact arithmetic, quadrant constraints and shared solution steps. Include a written two-part sum/difference plus reciprocal task.
2. **Binomial and counting depth.** General monomials, all term requests, sign reasoning, required individuals, alternating letters, factorial equations and answer-form choices.
3. **Graph models and linked parts.** Arbitrary piecewise graphs, products, composed transformations, degree-five polynomials, rational functions without real poles, matching sets and construction tasks. Reuse the existing Typst graph renderer, which already supports sampled curves, vertex lists, open dots, asymptotes and labels.
4. **Exponential/log contexts and finance.** Continuous/shifted models, infer-rate tasks, annuities/loans and practical rounding; add log/exponential error diagnosis and graph-to-equation tasks.
5. **Full corpus coverage.** Review every inventory entry into a family/task/parameter case. Mark it covered only after a reference recreation and valid parameter variants pass the relevant checks. Allow several exam questions to share one family while retaining individual provenance and acceptance cases.

For each implemented family, verify exact/numeric mathematics, solution completeness and original domains; run multiple seeds and every supported task/option; check MCQ uniqueness where applicable; compile and visually inspect representative question/answer diagrams; and exercise the Generate → Build → edit/reload flow. Track coverage by task, source question, format, calculator policy and graph dependence, not merely by curriculum outcome.

This study changes no generator behavior or question-bank data. The two CSVs and this document establish the starting inventory, specific gaps, and a proposed first implementation tranche.

## First implementation tranche

Implemented two additional PC40S types, bringing the course to 129 generators:

- **Evaluate compound exact trigonometric expressions** (`mb-40s-ratio-expression`): sums/differences, products, and mixed expressions; all six ratios; powers through cubes; degrees/radians; negative and multi-turn special angles. Written response and multiple choice, with exact worked substitution and distinct numerical choices.
- **Exact sum and difference ratios from two given ratios and quadrants** (`mb-40s-id-two-angle`): all six given/target ratios; sum/difference identities; explicit or inferred shared quadrant; one ratio or a ratio/reciprocal pair. Written response with quadrant reasoning, recovery of missing ratios, identity substitution and denominator rationalization.

Each type offers Practice variants and three fixed mathematical exam references. Compound references: June 2026 Q25, January 2026 Q37, June 2025 Q28. Two-angle references: June 2026 Q31, June 2025 Q35, January 2025 Q31. Reference mode locks the practice controls; switching back restores them. These recreate the mathematical values/task, not the original page layout or per-part marking scheme. Practice uses the existing seeded generation and worksheet/Build flow. Paired questions currently use lettered text within one generated question; semantic per-part marks remain future work.

The new mathematical models reuse `Q` and `Surds`; two-term radical division is rationalized through conjugates. Undefined original ratios and invalid target reciprocals are excluded. Existing generator IDs and their algorithms are unchanged.

Validation commands:

- `npm run test:generator:exact-trig`: six independently calculated provincial answers and 10,260 option/seed cases compared with numerical trig from independently reconstructed angles; all quadrants/given ratios; exact MCQ answer uniqueness; seed reproducibility.
- `npm run test:generator:exact-trig:browser`: 234 question/solution layouts compiled with the app's Typst compiler; cards, fixed/practice settings, worksheet reload and transfer to Build.
- The focused arithmetic checks are also imported by `test:generator`; the new browser checks are included in `test:generator:browser`.

The original CSV assessments remain the initial-audit snapshot. These six reference cases are implemented mathematically; the remaining corpus has not been declared covered.
