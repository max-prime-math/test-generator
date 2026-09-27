---
title: Algorithmic Questions
sidebar_position: 5
---

Algorithmic questions are imported questions that carry rules for generating new numeric or symbolic variants. A single question can include the original question text, choices, solution, graph data, algorithm rules, sample values, and diagnostics.

The app can calculate many common variants, then writes the calculated values back into the question so the normal preview, Test Builder, answer key, JSON export, and sync paths can use the materialized result.

## Import Workflow

1. Import a PQP or supported JSON file that contains algorithm metadata.
2. Open an imported question in the Question Bank preview panel.
3. Use **Calculate values** or **Random seed** when the preview shows algorithm controls.
4. Check the rendered question, choices, answer key, solution, and graph output before using it on a test.

PQP imports carry algorithm metadata under question `extensions`. Plain JSON imports can include the same fields directly on each question object.

## When Controls Appear

The Question Bank preview panel shows algorithm controls when a selected question has an `algorithmModel` with at least one definition containing either:

- a `rawExpression`, or
- a `sampleValue`.

The controls are:

| Control | Behavior |
|---|---|
| **Seed** | Optional integer seed from `0` through `4294967295`. Empty means generate a random seed. |
| **Calculate values** | Calculate using the entered seed, or a random seed if the field is empty. |
| **Random seed** | Clear the seed field and calculate with a new random seed. |
| Variant label | Shows the number of times this question has been materialized in the current bank record. |

After calculation, the app updates the question in the bank. This is not just a preview overlay.

## What Calculation Changes

Calculating a variant can update:

- Question body.
- Narrative text.
- Nested parts.
- MCQ choices.
- Correct answer.
- Solution.
- Graph Typst.
- Graph metadata.
- Algorithm evaluation diagnostics.
- Stored seed and variant count.
- Render-check state.

The question remains linked to its original `algorithmModel`, so it can be recalculated later with a new seed.

## Basic Example

Imported question:

```json
{
  "body": "Find the slope of the line $y = a x + b$.",
  "solution": "The slope is $a$.",
  "points": 1,
  "tags": ["linear"],
  "algorithmModel": {
    "scope": { "kind": "question" },
    "definitions": [
      {
        "id": "alg-1",
        "name": "a",
        "kind": "variable",
        "rawExpression": "range(-5, 5)",
        "sampleValue": "2"
      },
      {
        "id": "alg-2",
        "name": "b",
        "kind": "variable",
        "rawExpression": "range(-9, 9)",
        "sampleValue": "3"
      }
    ],
    "sequence": []
  }
}
```

Possible result after calculation:

```json
{
  "body": "Find the slope of the line $y = -4 x + 7$.",
  "solution": "The slope is $-4$.",
  "algorithmSeed": 12345,
  "algorithmVariant": 1,
  "algorithmEvaluation": {
    "entries": [
      { "name": "a", "status": "resolved", "value": "-4" },
      { "name": "b", "status": "resolved", "value": "7" }
    ]
  }
}
```

The exact values depend on the seed and on the order of definitions.

## Seed Behavior

Seeds are 32-bit unsigned integers. The UI accepts integers from `0` to `4294967295`.

If a seed is supplied, the same question and same algorithm definitions should produce the same values in this app version. If no seed is supplied, the app uses browser randomness.

Conditions can make seed behavior less direct. For each requested seed, the evaluator may try multiple internal attempts to satisfy all conditions. The visible `algorithmSeed` stays the requested seed, but the accepted values may come from one of those internal attempts.

## Supported Expressions

The evaluator supports a practical subset of common expressions.

### `range(min, max[, step])`

Returns a seeded random number from `min` to `max` using `step`.

```json
{
  "name": "a",
  "rawExpression": "range(2, 10, 2)",
  "sampleValue": "6"
}
```

Possible values are `2`, `4`, `6`, `8`, and `10`.

### `rand(min, max)`, `rand(n)` and `rand()`

`rand(min, max)` returns a seeded decimal number between `min` and `max`.

`rand(n)` returns a seeded whole number from `1` to `n`, as in ExamView.

`rand()` returns a seeded decimal number from `0` up to but not including `1`.

### `choose(...)`

Returns one of the supplied arguments.

```json
{
  "name": "trig",
  "rawExpression": "choose(\"sin\", \"cos\", \"tan\")",
  "sampleValue": "sin"
}
```

### `if(condition, whenTrue, whenFalse)`

Chooses between two expressions.

```json
{
  "name": "sign",
  "rawExpression": "if(a < 0, \"negative\", \"positive\")",
  "sampleValue": "positive",
  "dependencies": ["a"]
}
```

### `isunique(...)`

Returns true when all arguments are distinct. It can be used on its own or inside a larger condition such as `abs(a) > 1 and isunique(ans, dis1, dis2)`. The app also treats an `isunique(...)` definition as a condition: if it is false, that internal attempt is rejected and the evaluator tries another attempt.

### Arithmetic and Boolean Expressions

Supported operators and conversions include:

| Input | Meaning |
|---|---|
| `^` | Exponentiation. Negative values work: `e^4` with `e = -6` is 1296. |
| `!` after a value | Factorial: `n!`, `(n - r)!`. |
| `mod` | Remainder: `degrees mod 360`. |
| `AND`, `OR`, `NOT`, `&`, `\|` | Boolean operators. |
| `+` with text | Joins text: `"(0, " + str(k) + ")"`. |
| `<>` | Not equal. |
| `=` | Equality when used as a comparison. |
| `<`, `<=`, `>`, `>=` | Comparisons. |

Supported built-in functions include:

| Function | Meaning |
|---|---|
| `abs` | Absolute value. |
| `sin`, `cos`, `tan`, `csc`, `sec`, `cot` | Trig functions (radians). |
| `asin`, `acos`, `atan` (also `arcsin`, `arccos`, `arctan`) | Inverse trig functions. |
| `acsc`, `asec`, `acot` | Inverse reciprocal trig functions. |
| `ceil`, `ceiling`, `floor` | Rounding up or down. |
| `int` | Integer part (truncates toward zero: `int(-2.7)` is `-2`). |
| `round(x)`, `round(x, d)` | Round to a whole number, or to `d` decimals. |
| `sigfig(x, n)` | Round to `n` significant figures. |
| `ln`, `exp` | Natural logarithm and exponential. |
| `log`, `log10` | Base-10 logarithm. |
| `max`, `min` | Maximum and minimum. |
| `pow`, `sqrt` | Power and square root. |
| `sgn` | Sign: `-1`, `0` or `1`. |
| `comb(n, r)`, `perm(n, r)` | Combinations and permutations. |
| `gcf`, `gcd`, `lcm` | Greatest common factor and least common multiple. |
| `prime(low, high)` | A seeded random prime between `low` and `high`. |
| `fracs(n, d)` | The fraction in lowest terms, as Typst math: `fracs(-10, 6)` is `-frac(5, 3)`, `fracs(8, 4)` is `2`. |
| `mixfracs(n, d)` | As a mixed number: `1 frac(2, 3)`. |
| `sqrs(x)` | The square root in simplest radical form: `sqrs(12)` is `2 sqrt(3)`. |
| `chr(code)`, `str(x)` | A character by code, and a number as text. |
| `range`, `rand`, `isunique` | Also usable inside larger expressions: `2*range(1, 3)`. |

The constant `pi` is available.

Definitions are evaluated in dependency order, so a rule may use a variable defined further down the list. If a rule can't be evaluated, the app keeps the imported value and records an `ALGORITHM_RULE_UNSUPPORTED` warning.

## Conditions

Conditions are definitions that must evaluate truthy for a variant to be accepted. A definition is treated as a condition when:

- its name is `isunique`,
- its name matches `condition_1`, `condition_2`, and so on,
- it evaluates to a boolean and its expression looks like a predicate, or
- it is imported as a control or predicate rule.

Each calculation tries up to 20,000 internal attempts, because some conditions are rarely true (a zero discriminant holds for about 1 in 200 random draws). Values that are impossible, such as the square root of a negative number, division by zero, or `comb(n, r)` with `r > n`, also reject the attempt.

If no acceptable attempt is found, the app records a warning and falls back to imported sample values when possible.

## Value Slots

A question can list exactly where each value is shown in `algorithmModel.slots`. Each slot names the variable, the field (`body`, `narrative`, `solution` or `choice:A`), the text currently shown there, and which occurrence of that text it is (counting from 0):

```json
"slots": [
  { "name": "k", "field": "body", "text": "+ 5", "occurrence": 0 },
  { "name": "units", "field": "choice:A", "text": "5", "occurrence": 0 }
]
```

When slots are present, calculation replaces exactly those places and nothing else, then updates the slots so the question can be recalculated. This is what makes questions like "k is 5 and |k| is 5" work: value search can't tell the two 5s apart, slots can. Questions imported from ExamView banks by bnk-decoder include slots.

A definition's optional `display` controls how its value is printed:

| `display` | Prints |
|---|---|
| `{ "sign": "always" }` | A signed term: `+ 4`, `- 9` (also for text values such as `fracs()` results). |
| `{ "decimals": 2 }` | Exactly two decimals: `0.50`. |
| `{ "group": true }` | Digit groups for 5+ digit numbers: `20 712`. |

If the text was edited so the slots no longer match, the app falls back to the value replacement below and records an `ALGORITHM_SLOTS_STALE` warning.

## Text Replacement Rules

Without slots, the app materializes fields by replacing placeholders and old values after evaluation.

It builds two maps:

- previous values from `algorithmModel.definitions[].sampleValue` and `algorithmEvaluation.entries[].value`
- next values from the current calculation

Then it performs two passes:

1. Replace whole-word occurrences of definition names with generated values.
2. Replace old displayed values with new displayed values so a previously materialized question can be recalculated.

The app skips these independent variable names when replacing by name:

```text
x, y, t, n, theta, pi
```

This avoids turning ordinary math variables into random numbers.

Replacement is intentionally simple string materialization. It does not parse Typst math into an abstract syntax tree.

## Multiple Choice Example

Algorithmic MCQs can update the stem, choices, answer, and explanation.

```json
{
  "body": "What is $a + b$?",
  "choices": {
    "A": "$s$",
    "B": "$s + 1$",
    "C": "$s - 1$",
    "D": "$a b$"
  },
  "answer": "A",
  "solution": "$a + b = s$.",
  "points": 1,
  "tags": ["algorithmic", "arithmetic"],
  "algorithmModel": {
    "scope": { "kind": "question" },
    "definitions": [
      { "id": "alg-1", "name": "a", "kind": "variable", "rawExpression": "range(2, 9)", "sampleValue": "3" },
      { "id": "alg-2", "name": "b", "kind": "variable", "rawExpression": "range(2, 9)", "sampleValue": "5" },
      { "id": "alg-3", "name": "s", "kind": "variable", "rawExpression": "a + b", "sampleValue": "8" }
    ],
    "sequence": []
  }
}
```

Possible materialized result:

```json
{
  "body": "What is $6 + 4$?",
  "choices": {
    "A": "$10$",
    "B": "$10 + 1$",
    "C": "$10 - 1$",
    "D": "$6 4$"
  },
  "answer": "A",
  "solution": "$6 + 4 = 10$."
}
```

This example shows why review matters: because replacement is text-based, `$a b$` becomes `$6 4$`, not `$24$`, unless the import includes a separate computed definition for the product.

## Graph Questions

A graph that depends on the values can be redrawn for each variant. `algorithmModel.graphs` lists graph templates: each names the image the question currently shows for it (`image`) and gives a Math Graph document (the format the built-in graph editor saves) as `graph`, in which:

- number settings and coordinates may be expressions, such as `"xmin": "h - 9"` or a point's `"x": "hole"`;
- function expressions may use the variables: `"(x - h)^2 + k"` (`sec`, `csc`, `cot` and `log` are also accepted);
- domain bounds may be expressions, or `"-inf"` / `"inf"`;
- any object may have `"visibleIf": "<condition>"`, to show one of several alternatives;
- label text may contain `{expression}` placeholders, such as `"({h}, {k})"`.

```json
"graphs": [{
  "image": "pc12-ch01-03",
  "graph": {
    "version": 1,
    "settings": { "xmin": -9.5, "xmax": 9.5, "ymin": -9.5, "ymax": 9.5, "xtick": 1, "ytick": 1, "xlabelEvery": 2, "ylabelEvery": 2, "grid": true, "equal": false, "width": 7.62, "height": 7.62, "xlabel": { "text": "x", "math": true }, "ylabel": { "text": "y", "math": true } },
    "objects": [
      { "id": "f", "type": "function", "expression": "(x - h)^2 + k", "min": "-inf", "max": "inf", "color": "#ff0000", "width": 1.4, "dashed": false, "visible": true }
    ]
  }
}]
```

### Keeping Roots and Asymptotes in View

New values can move a curve's key features outside the window the graph was drawn for. Add `"showFeatures": true` to a template's `settings` to have each drawing keep them in view:

- The window grows (it never shrinks) to include every x-intercept, vertical asymptote, horizontal asymptote and point, with a tick of margin. If it grows a lot, the tick spacing is re-picked so the labels stay readable.
- Vertical and horizontal asymptotes are drawn as grey dashed lines captioned `x = 3` or `y = -2`. An asymptote on an axis (such as `y = 0` for an exponential) isn't drawn again.
- x-intercepts get a point labelled `(2, 0)` when there are at most four, each is a whole number or has at most two decimals, and all the labels fit without overlapping. Otherwise none are labelled, so all the choices of a question look alike. The origin isn't labelled.
- Curves with many roots or asymptotes, such as `sin(x)` or `tan(x)`, are left as authored.

Graphs imported from ExamView banks by bnk-decoder have `showFeatures` on.

When values are calculated, each template is drawn with the new values as an SVG image in the Image Library (named after the original image plus a content hash, such as `pc12-ch01-03-gb6759c72`), and the question's image references point to it. The drawings are ordinary Math Graph images, so they can be opened in the graph editor. If a graph can't be drawn for some values, the previous picture stays and the app records an `ALGORITHM_GRAPH_FAILED` warning.

Older imports may carry `graphTypst` and structured `graphModel` metadata instead; those are materialized by value replacement and appended to the body.

## Import and Storage Behavior

Algorithmic metadata is preserved in several paths:

| Path | Behavior |
|---|---|
| PQP import | Reads `algorithmModel` and `algorithmEvaluation` from question `extensions`. |
| Plain JSON import | Reads `algorithmModel` and `algorithmEvaluation` from each question object. |
| Local bank storage | Stores algorithm fields in the active bank and bank snapshots. |
| Git repo data | Preserves core algorithm, graph, and diagnostic fields as JSON-safe question data. |

`algorithmSeed` and `algorithmVariant` are preserved by local JSON import. They are currently not included in every sync path.

## Import Inspector

The Question Bank preview includes an import inspector for imported algorithmic and graph questions.

For algorithms it shows:

- scope
- definitions with kind, expression, and sample value
- imported sequence entries

For graph questions it shows:

- graph family
- object count
- object kinds and expressions

For diagnostics it shows:

- level
- code
- message

Use this inspector when a calculated variant looks wrong. It often reveals whether the issue is a missing rule, unsupported expression, stale sample value, graph metadata problem, or Typst rendering problem.

## What to Check Manually

Algorithmic questions are currently an import and materialization feature, not a full authoring system.

Keep these behaviors in mind after import:

- There is no form UI for creating or editing `algorithmModel` definitions by hand.
- Calculation mutates the saved question content in place.
- There is no one-click restore to the exact imported sample text except by recalculating from available previous values or re-importing.
- Unsupported functions fall back to sample values (with a warning) or remain unresolved.
- Without slots, the replacement pass is string-based, not AST-based, so it can miss expressions like `4a+b` or produce awkward output in edge cases.
- Matching-group and narrative-scoped algorithms are preserved, but the current UI calculates a selected question record rather than coordinating a whole group.
- Seed reproducibility is app-engine reproducibility.
- Some sync paths preserve core algorithm metadata but not `algorithmSeed` or `algorithmVariant`.

## Practical Review Checklist

Before using an algorithmic question on an assessment:

1. Open the question in the Question Bank.
2. Expand the import inspector.
3. Check for unresolved or unsupported definitions.
4. Generate several random variants.
5. Enter one seed manually and confirm it reproduces the same variant.
6. Preview the rendered question after calculation.
7. Check choices, answer key, and solution together.
8. For graph questions, inspect the graph output after calculation.
9. Duplicate a question first if you want to keep the imported sample variant unchanged.
