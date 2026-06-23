---
title: Portable Question Package
sidebar_position: 5
---

# Portable Question Package

Portable Question Package (PQP) is the workspace interchange format for moving recovered or generated questions between tools. In this app, PQP files are imported through **Import PQP / JSON** or **Bulk Import**.

PQP is intended to be shared by `bnk-decoder`, `ocr-frq`, `ocr-mcq`, and `test-generator`. It is useful when a producer needs to preserve more than plain question text, such as curriculum placement, answer choices, scoring, image references, graph recovery metadata, algorithm metadata, diagnostics, and provenance.

## File Type

Use `.pqp.json` for PQP files.

The app recognizes a PQP file by this top-level shape:

```json
{
  "format": "portable-question-package",
  "version": "1.0",
  "producer": {
    "app": "bnk-decoder",
    "exportedAt": "2026-05-15T18:30:00Z"
  },
  "questions": []
}
```

The canonical workspace spec lives in `docs/pqp/PORTABLE_QUESTION_PACKAGE.md`, and the machine-readable schema lives in `docs/pqp/shared-question-package.schema.json` at the workspace root.

## Minimal Question

Each question needs a `content.stem` object with text. Other fields are optional.

```json
{
  "format": "portable-question-package",
  "version": "1.0",
  "producer": {
    "app": "example-exporter",
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
      { "id": "B", "body": { "format": "typst", "text": "$2$" } }
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

## Curriculum Metadata

PQP can carry placement metadata under `classification`.

```json
{
  "classification": {
    "questionType": "mcq",
    "tags": ["arithmetic", "practice"],
    "classId": "demo-class",
    "className": "Demo Class",
    "unitId": "1",
    "unitName": "Unit 1",
    "sectionId": "1.1",
    "sectionName": "Section 1.1"
  }
}
```

When IDs are omitted, the importer can derive stable-ish IDs from class, unit, and section names. The import review screen can also create missing classes, units, and sections from package metadata before committing questions to the bank.

## Assets

Top-level `assets` entries can name files referenced by questions. A question links to those assets by ID.

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
      "id": "q-3",
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

During import, the app maps asset IDs to image names so referenced images can be tracked in the question. If image bytes are not already available to the app, keep the original files and upload them when prompted.

## Extensions

Producer-specific recovered data belongs under `extensions`. The current importer recognizes these extension keys:

| Key | Purpose |
|---|---|
| `algorithmModel` | Recovered algorithm definitions and generation rules. |
| `algorithmEvaluation` | Calculated sample values and replacement details. |
| `graphModel` | Structured graph recovery data. |
| `graphTypst` | Typst source for a recovered graph. |
| `decodeDiagnostics` | Warnings, errors, and notes from the producer. |

Unknown extension keys should be preserved by producer tools when practical, but the current app only imports the keys above.

## Current Import Behavior

The importer appends valid PQP questions to the active bank. It does not replace the bank, and it does not import Gradebook data.

The importer currently reads:

- Question stem, narrative, solution, and nested parts from rich content `text`
- MCQ choices and choice answer keys
- Point values from `scoring.points`
- Tags and curriculum placement from `classification`
- Image references through question asset IDs
- Supported algorithm, graph, and diagnostic extensions

The importer does not currently validate every field against the full schema in the browser UI. Invalid or unsupported questions are skipped during import review.

## Related Pages

- [Import, Export, and Sync](./import-export-sync.md)
- [Algorithmic Questions](./algorithmic-questions.md)
