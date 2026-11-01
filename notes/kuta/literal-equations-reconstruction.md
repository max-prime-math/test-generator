# Literal Equations reconstruction pilot

Status: first clean TestGen implementation and diversity regression are in place. This is a behavioral reconstruction, not a source transplant.

## Artifact and scope

- Target: `Alg1.exe` from Infinite Algebra 1-Site
- SHA-256: `01b62fb4bdd588c0707f0ee7f669fbcc91262186ccf979f31a6d82c70b764f61`
- Architecture: PE x86-64
- Kuta class: `MLiteralEquationsGenerator`
- TestGen target: `us-a1-literal`

The installed license contains a reverse-engineering restriction. This work therefore records externally meaningful behavior and independently implements algebraic families in TypeScript; it does not copy decompiler output or attempt to reproduce private source line-for-line.

## Observed shipped-artifact behavior

These are direct observations from the installed executable. Evidence IDs are stable REA records in the adjacent `*.rea.json` files.

- The class is registered as `MLiteralEquationsGenerator`, with factory `0x1400ca130` (`ev_8eb210013339e932adf83b29bd2773746d5dc4d9e62f3f95b372e40e0daf2784`).
- The factory allocates a 3,488-byte object and installs the Literal Equations vtable (`ev_49e004af3c3372a103fb69c75df2acd17844aabbf7fefefa4880709a02495928`).
- Student-facing text is "Solving Literal Equations" and "Solve each equation for the indicated variable." (`ev_275f286a2124bb2011fed0e3ebcad398f25e0076e8d30156b0ac88aa47a0473f`).
- The options UI exposes:
  - Number of variables: Few / Some / Many
  - No numbers
  - One variable always isolated to one side
  - Complexity: No factoring required / Factoring required
  (`ev_23856d051a329172cb180eab30e89d7172bbd2ba288618c4b1a403db68ff6e51`, `ev_1b9020012acf2d80ad7c61e5b8efff220b9e08ac7b433428bad2dab85a62c0ae`).
- The primary generation routine dispatches the three variable-count choices to three different builders, rather than one builder with three coefficient ranges (`ev_eecaba63b9ebc87b8be102db07ad560b58cc42a865d6d61d69a69d3b884f6b41`).
- Those builders are distinct, branch-heavy algebraic composition routines:
  - builder A, `0x1400ca360`: `ev_f284e9258a344ebf25eb4d477eeff585cd61c91bb0410f7767922bc461a003f3`
  - builder B, `0x1400cb6d0`: `ev_cf8e2108abc5919948a293512bf1be5675515c991a93569a34ed530a32bfe357`
  - builder C, `0x1400ca700`: `ev_3844d85d1935a68498ade1651d0667b34cb7dfa782203a9fad11554a2d416247`
- A separate routine derives and validates the requested-variable form and applies several special-case simplifications (`0x1400cca00`, `ev_a00e0995d5085243bcf041cd86d6a820992fbb508a3e02bddbe0e06fb16ec78a`).
- Multiple-choice alternatives are constructed with randomized transformations and checked against the original, rather than selected from one static list (`ev_faab7397ee4be33a63b95bee1debc818f3618a01750a9d86cebe15640a962a7e`).

## Inference

The shipped product's perceived variety is substantially structural. The separate builders compose equations from different operator shapes, then solve/simplify them. Coefficient and variable changes add surface variety, but they are not the only source of variation.

This explains the previous TestGen weakness: `a1Literal` selected one of 14 fixed formulas and returned a fixed answer/distractor set. Repeated worksheets therefore revisited the same skeletons very quickly.

## Independent TestGen design

The new `literal-equations.ts` builder deliberately models the behavior at a higher level:

1. Select a structural family compatible with the teacher's variable-count, factoring, numbers, and isolated-side settings.
2. Assign fresh variable names and optional coefficients.
3. Randomize equation orientation.
4. Produce a solved form and misconception-based distractors defined for that algebraic family.

The initial pilot has 18 family definitions spanning products, quotients, sums and differences, grouped expressions, two-product/two-ratio equations, nested quotients, and common-factor forms. Family IDs are retained as test metadata so diversity can be measured directly instead of guessed from output strings.

`scripts/test-generator-literal-equations.ts` checks every selectable option combination, determinism, distractor uniqueness, no-number and isolated-side constraints, and a minimum number of structural families per default level.

## Unknowns and next evidence

- Static analysis does not establish the exact probability distribution among Kuta's internal branches.
- The exact semantic boundary between Few, Some, and Many should be measured from generated worksheets, not inferred solely from object fields.
- The executable's internal expression node types and simplification helpers are not yet named.
- Runtime sampling is still needed to compare distributions for each UI option and to identify any important family absent from the pilot.
- Before expanding to other topics, add a reusable diversity metric: structural-family coverage, normalized-shape entropy, and duplicate rate across a fixed seed corpus.

## Reusable workflow for the next topic

1. Record artifact hash, title/instruction strings, options, factory, and primary dispatch.
2. Recover only enough builder behavior to identify structural families and constraints.
3. Separate observations, inferences, and unknowns in a topic note.
4. Implement the mathematical behavior independently behind a typed builder.
5. Add correctness, option-matrix, determinism, and structural-diversity regressions.
6. Validate against runtime samples without targeting byte-for-byte output identity.
