# Kuta Infinite reverse-engineering notes (2026-10-11)

Source: Kuta Infinite Pre-Algebra, Algebra 1, Algebra 2, Precalculus, Calculus v3.05 (Qt 6.11, x64), in C:\Program Files\Kuta Software LLC.

- `<Product>-tree.txt`: topic tree strings. Includes chapter headings, item titles, index keywords and `M<Name>Generator` class names (136 / 117 / 187 / 168 / 77 classes).
- `<Product>-spec.txt`: per-generator options dialogs (`=== <Name>`), worksheet titles, directions and option labels from the compiled .ui forms.
- `tree.mjs`, `spec.mjs`, `strs.mjs`: extractors (`node spec.mjs <exe>`).
- `rea-run.mjs`: runs REA MCP tool calls with the local Ghidra/JDK from bnk-decoder/.tools (`node rea-run.mjs calls.json out.json`). Alg1 auto-analysis takes about 3.5 min.

## Decisions (from the user)
- Placement (revised 2026-10-12): no U.S. courses. Every type sits in a Manitoba course under the outcomes it assesses, or beside the closest outcome with a tag naming its Kuta course (e.g. "Algebra 1").
- Features: build the high-value missing ones.

## Kuta features missing from Test-Generator (from Qt slots and toolbar resources)
- Print many: multiple versions, each with regenerated or scrambled questions and its own answer key.
- Scramble question order. Only MCQ choice shuffle exists today.
- Spiral review (`MSpiral`): a mixed review across topics.
- Per-question and per-set increase/decrease space, distribute dead space, change start number, show/hide numbers, answer lines.
- Presentation mode (one question at a time). Per-question regenerate, convert to MC/FR, and change directions.
- Merge worksheets. Add graph to a question or choice (`MAddGraphToQuestionDlg`).
- Out of scope: Kuta Works/Acuity online assignments, licensing.

## Status (2026-10-12)
- Placement: `src/lib/generator/kuta-topics.ts` keeps Kuta's chapters and topics (for roadmap/kuta-topics.html) and `HOMES`, which places each of the 200 new types (`us-*` ids kept, since saved worksheets use them; code in `generators/kuta/`). 99 assess a Manitoba outcome; 101 are tagged (Pre-Algebra 31, Algebra 1 6, Algebra 2 20, Precalculus 12, Calculus 32).
- Added the two Grade 12 45S courses from the 2019 framework (Introduction to Calculus, IC.1.1–IC.4.3; Advanced Mathematics, AM.1.1–AM.7.3) with official outcome wording. Introduction to Calculus excludes trigonometric, exponential, and logarithmic functions, so those calculus types are tagged.
- Advanced Mathematics also lists the Grade 10 enrichment types (matrices, systems, lines and planes) under its real outcomes, and four new generators cover AM.2.2, AM.2.3, AM.3.2, AM.3.3 (`generators/am45s/`).
- Features: Generate → **Save versions** (Kuta's print many), Build → **Shuffle order** (scramble questions) and **First question number** (change start number).
- Not built: Kuta Works/Acuity online assignments, presentation view, per-question "dead space" redistribution, construction (compass) problems, custom-question editor (the bank editor covers it).
