# Algebra 1 word-problem reconstruction

Status: first independent implementations for Mixture, Distance/Rate/Time, and Work are in TestGen.

## Observed artifact behavior

The installed Algebra 1 artifact identifies the native generators as `MMixtureGenerator`, `MDistanceRateTimeGenerator`, and `MWorkGenerator` (`Alg1-tree.txt`, addresses `0x442510`, `0x442d20`, and `0x442d78`). Extracted UI and prompt strings establish these externally visible dimensions:

- Distance/rate/time varies opposite-direction, round-trip, and catch-up scenarios; asks for time or speed; and can supply one value or a difference (`Alg1-spec.txt:481-540`, `660-672`).
- Mixtures vary solutions, alloys, fruit drinks, soils, nuts, and price blends. They ask for resulting concentration, an amount to add, an unknown source concentration, or both component amounts (`Alg1-spec.txt:1462-1542`).
- Work problems ask for combined time or an individual time and use multiple task narratives (`Alg1-spec.txt:2182-2196`).

These are shipped-artifact string observations, not proof of exact branch weights or arithmetic constraints.

## Independent TestGen design

`word-problems.ts` implements named structural families rather than copying prompt text:

- Mixtures: 17 form/context families across resulting concentration, amount added, source concentration, component split, and price blends.
- Travel: 16 scenario/unknown/givens families covering time and speed questions for opposite-direction, round-trip, catch-up, and current problems.
- Work: 10 scenario/context families covering combined rates, an unknown individual rate, delayed starts, and fill/drain problems with people, machines, or pipes.

Parameters are constructed from valid solutions so answers remain exact or deliberately formatted. Each family owns misconception-based distractors and an equation-based explanation.

`scripts/test-generator-word-problems.ts` checks all selectable option combinations, reproducibility, complete output, distractor uniqueness, family coverage, and prompt duplicate rate.

## Unknowns and next evidence

- Exact Kuta branch probabilities and numeric ranges have not been recovered.
- The native mixture and work control-flow graphs have not yet been decompiled.
- Runtime worksheet sampling is still needed to measure family frequencies and unusual edge cases.
- This pass intentionally reconstructs behavior rather than matching Kuta wording.
