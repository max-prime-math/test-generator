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

### `rand(min, max)` and `rand()`

`rand(min, max)` returns a seeded decimal number between `min` and `max`.

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

Returns true when all arguments are distinct. The app also treats an `isunique(...)` definition as a condition: if it is false, that internal attempt is rejected and the evaluator tries another attempt.

### Arithmetic and Boolean Expressions

Supported operators and conversions include:

| Input | Meaning |
|---|---|
| `^` | Exponentiation. |
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

The constant `pi` is available.

## Conditions

Conditions are definitions that must evaluate truthy for a variant to be accepted. A definition is treated as a condition when:

- its name is `isunique`,
- its name matches `condition_1`, `condition_2`, and so on,
- it evaluates to a boolean and its expression looks like a predicate, or
- it is imported as a control or predicate rule.

If no acceptable attempt is found, the app records a warning and falls back to imported sample values when possible.

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

Algorithmic questions may also include graph metadata. When values are calculated, both `graphTypst` and structured graph fields are materialized.

The generated test uses the materialized `body` plus `graphTypst`. The structured graph metadata is preserved for inspection, future editing, and export.

## Import and Storage Behavior

Algorithmic metadata is preserved in several paths:

| Path | Behavior |
|---|---|
| PQP import | Reads `algorithmModel` and `algorithmEvaluation` from question `extensions`. |
| Plain JSON import | Reads `algorithmModel` and `algorithmEvaluation` from each question object. |
| Local bank storage | Stores algorithm fields in the active bank and bank snapshots. |
| Export JSON | Includes algorithm fields because it serializes user questions. |
| Git repo data | Preserves core algorithm, graph, and diagnostic fields as JSON-safe question data. |

`algorithmSeed` and `algorithmVariant` are preserved by local JSON import/export. They are currently not included in every sync path, so use JSON export if you need a complete variant-state archive.

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
- Unsupported functions may fall back to sample values or remain unresolved.
- The replacement pass is string-based, not AST-based, so it can miss expressions like `4a+b` or produce awkward output in edge cases.
- Definition order matters. Dependency metadata is not used to sort definitions.
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
