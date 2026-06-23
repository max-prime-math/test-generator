---
title: Algorithmic Questions
sidebar_position: 2
---

# Algorithmic Questions

Algorithmic questions are imported questions that carry rules for generating new numeric or symbolic variants. They are most often produced by the workspace BNK bridge from ExamView banks. A single question record can include the original question text, choices, solution, graph data, decoded algorithm rules, sample values, and diagnostics.

This feature is powerful, but it is not a full ExamView runtime. Test Generator preserves recovered algorithm metadata and can calculate many common variants, then writes the calculated values back into the question so the normal Typst preview, test builder, answer key, JSON export, and sync paths can use the materialized result.

## Where They Come From

The normal path is:

1. Decode a BNK file with the workspace bridge:

```bash
npm run import:bnk -- "../bnk-decoder/ignore/ExamView/Banks/Pre-Calculus 11/Chapter 01.bnk"
```

2. Import the generated `*.test-generator-import.json` file with **Import PQP / JSON**.
3. Open an imported question in the Question Bank preview panel.
4. Use **Calculate values** or **Random seed** when the preview shows algorithm controls.

The bridge expects the sibling `bnk-decoder` repo to exist at `../bnk-decoder`. It calls `decodeBnkFile(...)`, converts decoded questions with `toTestGeneratorQuestions(...)`, and writes a Test Generator JSON import file. That conversion preserves:

- `algorithmModel`
- `algorithmEvaluation`
- `graphModel`
- `graphTypst`
- `decodeDiagnostics`
- extracted image references and importable image bytes when available

PQP imports can also carry the same metadata under question `extensions`. Plain JSON imports can include these fields directly on each question object.

## What Makes a Question Algorithmic

A question becomes algorithmic when it has an `algorithmModel` with at least one definition. The model shape is:

```json
{
  "algorithmModel": {
    "scope": { "kind": "question" },
    "definitions": [
      {
        "id": "alg-1",
        "name": "a",
        "kind": "variable",
        "rawExpression": "range(2, 9)",
        "sampleValue": "4",
        "dependencies": [],
        "source": "pre-display-string-sequence"
      }
    ],
    "sequence": [
      {
        "id": "alg-seq-1",
        "order": 1,
        "text": "a",
        "kind": "variable-name",
        "ownerKind": "question",
        "definitionName": "a",
        "source": "pre-display-string-sequence"
      },
      {
        "id": "alg-seq-2",
        "order": 2,
        "text": "range(2, 9)",
        "kind": "rule",
        "ownerKind": "question",
        "definitionName": "a",
        "source": "pre-display-string-sequence"
      }
    ],
    "source": "pre-display-string-sequence"
  }
}
```

The important fields are:

| Field | Meaning |
|---|---|
| `scope.kind` | The decoded owner of the rules: `question`, `narrative`, or `matching-group`. |
| `definitions` | Named variables, constants, conditions, user functions, or unknown recovered rules. |
| `definitions[].rawExpression` | The expression Test Generator tries to evaluate when calculating a variant. |
| `definitions[].sampleValue` | The decoder's recovered value from the original BNK question. Used as an initial display value and as a fallback. |
| `definitions[].dependencies` | Other definition names found in the expression. This is metadata; evaluation still follows definition order. |
| `sequence` | The raw recovered algorithm stream, useful for debugging import quality. |
| `source` | Where the decoder found the algorithm sequence. |

Definitions are evaluated in the order they appear. If `b` uses `a`, `a` must appear first.

## When Controls Appear

The Question Bank preview panel shows algorithm controls when a selected question has an `algorithmModel` with at least one definition containing either:

- a `rawExpression`, or
- a `sampleValue`

The controls are:

| Control | Behavior |
|---|---|
| **Seed** | Optional integer seed from `0` through `4294967295`. Empty means generate a random seed. |
| **Calculate values** | Calculate using the entered seed, or a random seed if the field is empty. |
| **Random seed** | Clear the seed field and calculate with a new random seed. |
| Variant label | Shows the number of times this question has been materialized in the current bank record. |

After calculation, the app updates the question in the bank. This is not just a preview overlay.

## What Calculation Changes

`calculateAlgorithmicQuestionVariant(...)` evaluates algorithm definitions and returns an update for the question. `BankView` applies that update with `bank.update(...)`.

The update can change:

- `body`
- `narrative`
- nested `parts`
- `choices`
- `answer`
- `solution`
- `graphTypst`
- `graphModel`
- `algorithmEvaluation`
- `algorithmSeed`
- `algorithmVariant`
- `checked`
- `renderError`

The question remains linked to its original `algorithmModel`, so it can be recalculated later with a new seed.

Example before calculation:

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
        "sampleValue": "2",
        "dependencies": [],
        "source": "example"
      },
      {
        "id": "alg-2",
        "name": "b",
        "kind": "variable",
        "rawExpression": "range(-9, 9)",
        "sampleValue": "3",
        "dependencies": [],
        "source": "example"
      }
    ],
    "sequence": [],
    "source": "example"
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
    ],
    "diagnostics": [
      {
        "level": "info",
        "code": "ALGORITHM_VALUES_CALCULATED",
        "message": "Calculated algorithm values with seed 12345."
      }
    ]
  }
}
```

The exact values depend on the seed and on the order of definitions.

## Seed Behavior

Seeds are 32-bit unsigned integers. The UI accepts integers from `0` to `4294967295`.

If a seed is supplied, the same question and same algorithm definitions should produce the same values in this app version. If the algorithm engine changes in a future version, exact seeded output may change unless compatibility is deliberately preserved.

If no seed is supplied, the app uses `crypto.getRandomValues(...)` when available. If browser crypto is unavailable, it falls back to `Math.random()`.

Conditions complicate seed behavior. For each requested seed, the evaluator may try up to 80 internal attempts by mixing the seed with attempt numbers. The visible `algorithmSeed` stays the requested seed, but the accepted values may come from one of those mixed internal attempts.

## Supported Expressions

The evaluator supports a practical subset of recovered ExamView-style expressions.

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

`range(2, 5)` uses step `1`, so possible values are `2`, `3`, `4`, and `5`.

### `rand(min, max)`

Returns a seeded decimal number between `min` and `max`.

```json
{
  "name": "r",
  "rawExpression": "rand(0, 1)",
  "sampleValue": "0.25"
}
```

Decimal values are formatted to at most six decimal places, with trailing zeroes removed.

### `rand()`

Returns a seeded decimal number from `0` up to but not including `1`.

```json
{
  "name": "u",
  "rawExpression": "rand()",
  "sampleValue": "0.5"
}
```

### `choose(...)`

Returns one of the supplied arguments.

```json
{
  "name": "trig",
  "rawExpression": "choose(\"sin\", \"cos\", \"tan\")",
  "sampleValue": "sin"
}
```

This can be useful when the question text contains a symbolic placeholder:

```json
{
  "body": "Differentiate $trig(x)$.",
  "solution": "Use the derivative rule for $trig(x)$."
}
```

If the generated value is `cos`, the text becomes:

```typst
Differentiate $cos(x)$.
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

The condition uses the same comparison and boolean rules as other expressions.

### `isunique(...)`

Returns true when all arguments are distinct. The app also treats an `isunique(...)` definition as a condition: if it is false, that internal attempt is rejected and the evaluator tries another attempt.

```json
{
  "name": "isunique",
  "kind": "condition",
  "rawExpression": "isunique(a, b, c)",
  "dependencies": ["a", "b", "c"],
  "source": "example"
}
```

### Arithmetic and Boolean Expressions

The evaluator can also evaluate many plain expressions:

```json
[
  { "name": "a", "rawExpression": "range(1, 5)", "sampleValue": "2" },
  { "name": "b", "rawExpression": "a^2 + 3", "sampleValue": "7", "dependencies": ["a"] },
  { "name": "ok", "kind": "condition", "rawExpression": "b <> 12 AND b > 4", "dependencies": ["b"] }
]
```

Supported operators and conversions include:

| Input | Meaning |
|---|---|
| `^` | Exponentiation. Converted to JavaScript `**`. |
| `AND`, `OR`, `NOT` | Boolean operators. |
| `<>` | Not equal. |
| `=` | Equality when used as a comparison. |
| `<`, `<=`, `>`, `>=` | Comparisons. |

Supported built-in functions include:

| Function | Meaning |
|---|---|
| `abs` | Absolute value. |
| `acos`, `asin`, `atan` | Inverse trig functions. |
| `ceil`, `ceiling` | Ceiling. |
| `cos`, `sin`, `tan` | Trig functions. |
| `floor`, `int` | Floor. |
| `ln` | Natural logarithm. |
| `log` | Base-10 logarithm. |
| `max`, `min` | Maximum and minimum. |
| `pow` | Power. |
| `round` | Round to nearest integer. |
| `sqrt` | Square root. |

The constant `pi` is available as `Math.PI`.

## Conditions

Conditions are definitions that must evaluate truthy for a variant to be accepted. A definition is treated as a condition when:

- its name is `isunique`,
- its name matches `condition_1`, `condition_2`, and so on,
- it evaluates to a boolean and its expression looks like a predicate, or
- it is a recovered control/predicate rule from the decoder.

Example:

```json
{
  "algorithmModel": {
    "scope": { "kind": "question" },
    "definitions": [
      {
        "id": "alg-1",
        "name": "a",
        "kind": "variable",
        "rawExpression": "range(-5, 5)",
        "sampleValue": "2",
        "dependencies": [],
        "source": "example"
      },
      {
        "id": "alg-2",
        "name": "condition_1",
        "kind": "condition",
        "rawExpression": "a <> 0",
        "dependencies": ["a"],
        "source": "example"
      }
    ],
    "sequence": [],
    "source": "example"
  }
}
```

This rejects variants where `a` is `0`. If no acceptable attempt is found after 80 tries, the app records an `ALGORITHM_CONDITIONS_NOT_SATISFIED` warning and falls back to the recovered sample values when possible.

## Text Replacement Rules

After evaluation, the app materializes fields by replacing placeholders and old values.

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

This avoids turning ordinary math variables like `x` into random numbers.

Example:

```typst
Find the vertex of $y = a x^2 + b x + c$.
```

With `a = 2`, `b = -4`, and `c = 1`, this becomes:

```typst
Find the vertex of $y = 2 x^2 - 4 x + 1$.
```

The app also normalizes common sign artifacts:

| Before | After |
|---|---|
| `+ -4` | `- 4` |
| `- -4` | `+ 4` |
| `- +4` | `- 4` |
| `^ +2` | `^2` |

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
      {
        "id": "alg-1",
        "name": "a",
        "kind": "variable",
        "rawExpression": "range(2, 9)",
        "sampleValue": "3",
        "dependencies": [],
        "source": "example"
      },
      {
        "id": "alg-2",
        "name": "b",
        "kind": "variable",
        "rawExpression": "range(2, 9)",
        "sampleValue": "5",
        "dependencies": [],
        "source": "example"
      },
      {
        "id": "alg-3",
        "name": "s",
        "kind": "variable",
        "rawExpression": "a + b",
        "sampleValue": "8",
        "dependencies": ["a", "b"],
        "source": "example"
      }
    ],
    "sequence": [],
    "source": "example"
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

This example also shows a current limitation: because replacement is text-based, `$a b$` becomes `$6 4$`, not `$24$`, unless the source uses a separate computed definition for the product.

## Parts Example

Nested parts are materialized recursively.

```json
{
  "body": "Use the function below.",
  "parts": {
    "stem": "Let $f(x) = a x^2 + b$.",
    "items": [
      { "label": "a", "body": "Find $f(0)$." },
      { "label": "b", "body": "Find $f(2)$." }
    ]
  },
  "solution": "$f(0)=b$ and $f(2)=4a+b$.",
  "points": 2,
  "tags": ["algorithmic", "quadratic"],
  "algorithmModel": {
    "scope": { "kind": "question" },
    "definitions": [
      {
        "id": "alg-1",
        "name": "a",
        "kind": "variable",
        "rawExpression": "range(1, 4)",
        "sampleValue": "2",
        "dependencies": [],
        "source": "example"
      },
      {
        "id": "alg-2",
        "name": "b",
        "kind": "variable",
        "rawExpression": "range(-5, 5)",
        "sampleValue": "1",
        "dependencies": [],
        "source": "example"
      }
    ],
    "sequence": [],
    "source": "example"
  }
}
```

Possible result:

```json
{
  "parts": {
    "stem": "Let $f(x) = 3 x^2 - 2$.",
    "items": [
      { "label": "a", "body": "Find $f(0)$." },
      { "label": "b", "body": "Find $f(2)$." }
    ]
  },
  "solution": "$f(0)=-2$ and $f(2)=4a+b$."
}
```

The question stem is materialized, but `4a+b` remains partly symbolic because the current evaluator does not derive new expressions during text replacement. Add a computed definition such as `f2 = 4*a + b` if the final numeric answer must appear.

## Graph Example

Algorithmic questions may also include graph metadata. When values are calculated, both `graphTypst` and structured `graphModel` fields are materialized.

Simplified example:

```json
{
  "body": "Graph $y = a x + b$.",
  "graphTypst": "#line-plot((x) => a * x + b)",
  "graphModel": {
    "family": "cartesian",
    "objects": [
      {
        "id": "g1",
        "kind": "function",
        "expression": "a * x + b",
        "typstMath": "a x + b",
        "variables": ["a", "b"]
      }
    ],
    "variables": {
      "a": "2",
      "b": "1"
    },
    "rawExpressions": ["a * x + b"],
    "source": "example"
  },
  "points": 1,
  "tags": ["algorithmic", "graph"],
  "algorithmModel": {
    "scope": { "kind": "question" },
    "definitions": [
      {
        "id": "alg-1",
        "name": "a",
        "kind": "variable",
        "rawExpression": "range(-4, 4)",
        "sampleValue": "2",
        "dependencies": [],
        "source": "example"
      },
      {
        "id": "alg-2",
        "name": "b",
        "kind": "variable",
        "rawExpression": "range(-6, 6)",
        "sampleValue": "1",
        "dependencies": [],
        "source": "example"
      },
      {
        "id": "alg-3",
        "name": "condition_1",
        "kind": "condition",
        "rawExpression": "a <> 0",
        "dependencies": ["a"],
        "source": "example"
      }
    ],
    "sequence": [],
    "source": "example"
  }
}
```

Possible materialized graph fields:

```json
{
  "body": "Graph $y = -3 x + 5$.",
  "graphTypst": "#line-plot((x) => -3 * x + 5)",
  "graphModel": {
    "family": "cartesian",
    "objects": [
      {
        "id": "g1",
        "kind": "function",
        "expression": "-3 * x + 5",
        "typstMath": "-3 x + 5",
        "variables": ["a", "b"]
      }
    ],
    "variables": {
      "a": "-3",
      "b": "5"
    },
    "rawExpressions": ["-3 * x + 5"],
    "source": "example"
  }
}
```

The generated test uses the materialized `body` plus `graphTypst`. The structured `graphModel` is mainly preserved for inspection, future graph editing, and later export/sync work.

## Import and Storage Behavior

Algorithmic metadata is preserved in several paths:

| Path | Behavior |
|---|---|
| BNK bridge import | Writes algorithm fields directly onto Test Generator question objects. |
| PQP import | Reads `algorithmModel` and `algorithmEvaluation` from question `extensions`. |
| Plain JSON import | Reads `algorithmModel` and `algorithmEvaluation` from each question object. |
| Local bank storage | Stores algorithm fields in `math-test-bank-v2` and per-bank snapshots. |
| Export JSON | Includes algorithm fields because it serializes user questions. |
| Git repo data | Preserves `algorithmModel`, `algorithmEvaluation`, `graphModel`, and diagnostics as JSON-safe question fields. |

`algorithmSeed` and `algorithmVariant` are preserved by local JSON import/export. They are currently not included in the git repo sanitization path, so git-backed question repo data should not be treated as a complete variant-state archive.

## Decoder Inspector

The Question Bank preview includes a **Decoder inspector** for imported algorithmic and graph questions.

For algorithms it shows:

- scope
- definitions with kind, expression, and sample value
- raw recovered sequence entries

For graph questions it shows:

- graph family
- object count
- object kinds and expressions

For diagnostics it shows:

- level
- code
- message

Use this inspector when a calculated variant looks wrong. It often reveals whether the issue is a missing rule, unsupported expression, stale sample value, graph extraction problem, or plain Typst rendering problem.

## Diagnostics

Algorithm calculation can add diagnostics to `algorithmEvaluation.diagnostics`.

Important codes include:

| Code | Meaning |
|---|---|
| `ALGORITHM_VALUES_CALCULATED` | Calculation completed and records the seed used. |
| `ALGORITHM_RULE_UNSUPPORTED` | A rule could not be evaluated and no usable sample fallback existed. |
| `ALGORITHM_CONDITIONS_NOT_SATISFIED` | The evaluator could not find values satisfying all recovered conditions after 80 attempts. |
| `ALGORITHM_VARIABLE_INCOMPLETE` | The decoder recovered a symbol without a rule or sample value. |
| `ALGORITHM_SUPPORT_TOKEN` | The decoder found an opaque algorithm token that may need future support. |

Decoder diagnostics are separate from render errors. A question can calculate successfully and still fail Typst rendering, or render successfully while carrying warnings about partial algorithm recovery.

## Current Limitations

Algorithmic questions are currently a recovery and materialization feature, not a full authoring system.

Known limitations:

- There is no form UI for creating or editing `algorithmModel` definitions by hand.
- Calculation mutates the saved question content in place.
- There is no one-click restore to the exact imported sample text except by recalculating from available previous values or re-importing.
- Expression support is narrower than ExamView. Unsupported functions may fall back to sample values or remain unresolved.
- The replacement pass is string-based, not AST-based, so it can miss expressions like `4a+b` or produce typographically awkward output in edge cases.
- Definition order matters. Dependency metadata is not used to topologically sort definitions.
- Choice scrambling from recovered `scramble` controls is not equivalent to Test Builder choice shuffling.
- Matching-group and narrative-scoped algorithms are preserved, but the current UI calculates a selected question record rather than coordinating a whole group.
- Seed reproducibility is app-engine reproducibility, not ExamView reproducibility.
- Git repo sync currently preserves core algorithm metadata but not `algorithmSeed` or `algorithmVariant`.

## Practical Review Checklist

Before using an algorithmic question on an assessment:

1. Open the question in the Question Bank.
2. Expand **Decoder inspector**.
3. Check for unresolved or unsupported definitions.
4. Generate several random variants.
5. Enter one seed manually and confirm it reproduces the same variant.
6. Preview the rendered question after calculation.
7. Check choices, answer key, and solution together.
8. For graph questions, inspect the graph output after calculation.
9. Duplicate a question first if you want to keep the imported sample variant unchanged.
