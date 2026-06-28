---
title: Portable Question Package
sidebar_position: 4
---

Portable Question Package (PQP) is the richest question import format supported by the app. Use it when plain pasted text or a simple JSON list is not enough.

A PQP file can include:

- Question stems, choices, answers, solutions, and nested parts.
- Point values and question type.
- Curriculum class, unit, and section placement.
- Tags.
- Image references.
- Algorithmic question metadata.
- Graph metadata.
- Import diagnostics and provenance notes.

Use the `.pqp.json` extension for package files.

## When to Use PQP

Use PQP when you want a repeatable import file that preserves structure:

| Need | Why PQP helps |
|---|---|
| Move a full unit or chapter into the app | Keeps questions, points, tags, and curriculum placement together. |
| Import multiple-choice questions | Preserves choice IDs and answer keys. |
| Import questions with diagrams | Tracks asset filenames and question-to-image relationships. |
| Import generated or variable questions | Carries algorithm metadata used by the app's variant controls. |
| Review import quality | Carries diagnostics without blocking the whole batch. |

For quick one-off entry, **Bulk Import** is usually faster. For repeatable import or richer metadata, use PQP.

## File Shape

The app recognizes a PQP file by this top-level structure:

```json
{
  "format": "portable-question-package",
  "version": "1.0",
  "producer": {
    "app": "test-generator",
    "exportedAt": "2026-06-23T00:00:00Z"
  },
  "questions": []
}
```

The `producer` object is informational. The importer does not require a specific producer name.

## Minimal Free-Response Question

Each question needs a `content.stem` object with text. Other fields are optional.

```json
{
  "format": "portable-question-package",
  "version": "1.0",
  "producer": {
    "app": "test-generator",
    "exportedAt": "2026-06-23T00:00:00Z"
  },
  "questions": [
    {
      "id": "q-1",
      "kind": "free-response",
      "content": {
        "stem": {
          "format": "typst",
          "text": "Evaluate $ integral_0^1 x^2 dif x. $"
        },
        "solution": {
          "format": "typst",
          "text": "$ 1 / 3 $"
        }
      },
      "scoring": {
        "points": 5
      },
      "classification": {
        "tags": ["calculus", "integrals"]
      }
    }
  ]
}
```

## Multiple Choice

For multiple choice, use `kind: "mcq"`, a `content.choices` array, and an `answer` object.

```json
{
  "id": "q-2",
  "kind": "mcq",
  "content": {
    "stem": {
      "format": "typst",
      "text": "What is $1 + 1$?"
    },
    "choices": [
      { "id": "A", "body": { "format": "typst", "text": "$1$" } },
      { "id": "B", "body": { "format": "typst", "text": "$2$" } },
      { "id": "C", "body": { "format": "typst", "text": "$3$" } }
    ],
    "solution": {
      "format": "typst",
      "text": "The value is $2$."
    }
  },
  "answer": {
    "type": "choice",
    "value": "B"
  },
  "scoring": {
    "points": 2
  }
}
```

Choice IDs should be stable letters such as `A`, `B`, `C`, and `D`. The app maps those IDs into its normal MCQ choice fields.

## Multi-Part Questions

Use `content.parts` when one prompt has subquestions.

```json
{
  "id": "q-3",
  "kind": "free-response",
  "content": {
    "stem": {
      "format": "typst",
      "text": "Let $f(x) = x^2 - 4x$."
    },
    "parts": [
      {
        "label": "a",
        "body": {
          "format": "typst",
          "text": "Find the zeros of $f$."
        }
      },
      {
        "label": "b",
        "body": {
          "format": "typst",
          "text": "Find the vertex."
        }
      }
    ],
    "solution": {
      "format": "typst",
      "text": "The zeros are $0$ and $4$. The vertex is $(2, -4)$."
    }
  },
  "scoring": {
    "points": 6
  }
}
```

The importer preserves nested parts so the Test Builder can render them as structured Typst content.

## Curriculum Metadata

PQP can carry placement metadata under `classification`.

```json
{
  "classification": {
    "questionType": "mcq",
    "tags": ["arithmetic", "practice"],
    "classId": "algebra-1",
    "className": "Algebra 1",
    "unitId": "1",
    "unitName": "Linear Equations",
    "sectionId": "1.1",
    "sectionName": "Solving One-Step Equations"
  }
}
```

If IDs are omitted, the importer can derive IDs from the class, unit, and section names. The import review screen can also create missing classes, units, and sections before committing questions to the bank.

## Assets and Images

Top-level `assets` entries describe files referenced by questions. A question links to those assets by ID.

```json
{
  "assets": [
    {
      "id": "asset-1",
      "kind": "image",
      "filename": "diagram-1.png",
      "storage": {
        "mode": "external",
        "path": "assets/diagram-1.png"
      }
    }
  ],
  "questions": [
    {
      "id": "q-4",
      "kind": "free-response",
      "content": {
        "stem": {
          "format": "typst",
          "text": "Use the diagram to answer the question."
        }
      },
      "assets": ["asset-1"]
    }
  ]
}
```

During import, the app maps asset IDs to image names so questions know which files they need. If image bytes are not already available to the browser, keep the original files and upload them when prompted.

## Algorithmic Metadata

Algorithmic questions use `extensions.algorithmModel` and, optionally, `extensions.algorithmEvaluation`.

```json
{
  "id": "q-5",
  "kind": "free-response",
  "content": {
    "stem": {
      "format": "typst",
      "text": "Find the slope of $y = a x + b$."
    },
    "solution": {
      "format": "typst",
      "text": "The slope is $a$."
    }
  },
  "extensions": {
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
}
```

After import, open the question preview and use the algorithm controls to calculate seeded variants. See [Algorithmic Questions](./algorithmic-questions.md).

## Graph Metadata

If a question includes a generated graph, PQP can preserve graph-related extensions:

| Key | Purpose |
|---|---|
| `graphTypst` | Typst source used to render the graph. |
| `graphModel` | Structured graph data preserved for inspection and future editing. |

Questions can include graph metadata together with algorithm metadata so generated values update graph expressions.

## Diagnostics

Use diagnostics to communicate import warnings without rejecting an entire package.

```json
{
  "extensions": {
    "diagnostics": [
      {
        "level": "warning",
        "code": "IMAGE_MISSING",
        "message": "diagram-1.png was referenced but not included."
      }
    ]
  }
}
```

The app may show diagnostics during review or in the question preview. Use them for issues a teacher should check, such as missing images, unsupported expressions, or uncertain answer keys.

## Current Import Behavior

The importer appends valid PQP questions to the active bank. It does not replace the bank, and it does not import Gradebook data.

The importer currently reads:

- Question stem, narrative, solution, and nested parts from rich content text.
- MCQ choices and choice answer keys.
- Point values from `scoring.points`.
- Tags and curriculum placement from `classification`.
- Image references through question asset IDs.
- Supported algorithm, graph, and diagnostic extensions.

Unsupported or invalid questions may be skipped during import review. Import a small sample first when preparing a new package format.

## Practical Authoring Checklist

Before importing a large PQP file:

1. Confirm `format` is `portable-question-package`.
2. Confirm every question has a stable `id`.
3. Use `format: "typst"` for text that is already written for the app.
4. Include point values under `scoring.points`.
5. Include curriculum names if you want the app to create or match placement automatically.
6. Keep asset filenames simple and unique.
7. Put algorithm and graph data under `extensions`.
8. Import a small sample and inspect the review screen before committing the full set.

## Related Pages

- [Import and Back Up Questions](./import-export-sync.md)
- [Algorithmic Questions](./algorithmic-questions.md)
