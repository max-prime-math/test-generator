# Kuta Infinite reverse-engineering notes (2026-10-11)

Source: Kuta Infinite Pre-Algebra, Algebra 1, Algebra 2, Precalculus, Calculus v3.05 (Qt 6.11, x64), in C:\Program Files\Kuta Software LLC.

- `<Product>-tree.txt`: topic tree strings. Includes chapter headings, item titles, index keywords and `M<Name>Generator` class names (136 / 117 / 187 / 168 / 77 classes).
- `<Product>-spec.txt`: per-generator options dialogs (`=== <Name>`), worksheet titles, directions and option labels from the compiled .ui forms.
- `tree.mjs`, `spec.mjs`, `strs.mjs`: extractors (`node spec.mjs <exe>`).
- `rea-run.mjs`: runs REA MCP tool calls with the local Ghidra/JDK from bnk-decoder/.tools (`node rea-run.mjs calls.json out.json`). Alg1 auto-analysis takes about 3.5 min.

## Decisions (from the user)
- Placement: add Kuta-style generator courses (Pre-Algebra, Algebra 1, Algebra 2, Precalculus, Calculus) with Kuta's chapter structure, and also tag matching types with Manitoba outcomes.
- Features: build the high-value missing ones.

## Kuta features missing from Test-Generator (from Qt slots and toolbar resources)
- Print many: multiple versions, each with regenerated or scrambled questions and its own answer key.
- Scramble question order. Only MCQ choice shuffle exists today.
- Spiral review (`MSpiral`): a mixed review across topics.
- Per-question and per-set increase/decrease space, distribute dead space, change start number, show/hide numbers, answer lines.
- Presentation mode (one question at a time). Per-question regenerate, convert to MC/FR, and change directions.
- Merge worksheets. Add graph to a question or choice (`MAddGraphToQuestionDlg`).
- Out of scope: Kuta Works/Acuity online assignments, licensing.

## Status (2026-10-11)
- Done: five U.S.-style generator courses in `src/lib/generator/us-catalog.ts` (units = Kuta chapters, sections = topics). All 456 topics of the five programs have at least one generator: 200 new `us-*` generators in `src/lib/generator/generators/us/`, plus existing Manitoba generators listed with `uses`.
- Done: 47 new generators are also listed in Manitoba catalogues and tagged with those outcomes (`MB_CROSS_LISTINGS`).
- Done: Generate → **Save versions** (Kuta's print many), Build → **Shuffle order** (scramble questions) and **First question number** (change start number).
- Not built: Kuta Works/Acuity online assignments, presentation view, per-question "dead space" redistribution, construction (compass) problems, custom-question editor (the bank editor covers it).
- Some types have three multiple-choice options by nature (yes/no, orthogonal/parallel/neither, correlation direction); `npm run test:generator` lists them as notes.
