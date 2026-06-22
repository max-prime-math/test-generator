---
title: Import, Export, and Sync
sidebar_position: 4
---

# Import, Export, and Sync

Test Generator is local-first. Import, export, and sync features are explicit actions initiated by the teacher.

## Portable Question Package

The app is the primary human-facing consumer of the workspace's **Portable Question Package (PQP)** format.

- Canonical spec: `PORTABLE_QUESTION_PACKAGE.md` in the workspace root.
- Machine-readable schema: `shared-question-package.schema.json` in the workspace root.

PQP is intended to become the shared interchange format for `bnk-decoder`, `ocr-frq`, `ocr-mcq`, and `test-generator`. It supports package metadata, rich content format tags, curriculum definitions, assets, diagnostics, provenance, and extensions.

## Export JSON

Use **Export JSON** to download a backup of the question bank. This is useful for backup, sharing, or version control. Image bytes are not included in the basic bank JSON export; keep original image files or use package formats that carry assets.

## Import PQP / JSON

Use **Import PQP / JSON** to append questions to the existing bank. Supported inputs include:

- Portable Question Package files such as `chapter-01.pqp.json`
- OCR pipeline exports such as `bulk_import.json`
- Plain JSON arrays of draft-style question objects

Minimal plain import shape:

```json
[
  {
    "body": "Evaluate $lim_(x -> 0) frac(sin x, x)$.",
    "points": 5,
    "tags": ["calculus", "limits"],
    "solution": "The limit equals $1$."
  }
]
```

MCQ example:

```json
[
  {
    "body": "What is $frac(d, d x)[sin x]$?",
    "points": 2,
    "choices": {
      "A": "$cos x$",
      "B": "$-cos x$",
      "C": "$-sin x$",
      "D": "$tan x$"
    },
    "solution": "A",
    "tags": ["derivatives", "trig"]
  }
]
```

## Import BNK Through Workspace Bridge

Inside the shared workspace, `test-generator` can call the sibling `bnk-decoder` repo and emit an importable JSON file without copying decoder logic into this app:

```bash
npm run import:bnk -- "../bnk-decoder/ignore/ExamView/Banks/Pre-Calculus 11/Chapter 01.bnk"
```

The bridge writes a `*.test-generator-import.json` file. Import it with **Import PQP / JSON** from the bank view.

This path preserves BNK algorithm models, graph models, point/ray graph objects, question diagnostics, curriculum data, and extracted bitmap assets when available.

## Bulk Import

Use **Bulk Import** to paste or drag in text, LaTeX, Typst, PQP, or JSON. The importer can:

- Detect LaTeX or Typst input
- Convert common LaTeX math to Typst
- Preserve exam-class parts/subparts/subsubparts as nested Typst lists
- Preserve LaTeX line breaks as Typst `#linebreak()` calls
- Split pasted content into individual questions
- Recognize MCQ answer choices
- Detect `\includegraphics{...}` references
- Prompt for image files
- Let you review and assign curriculum before committing

## Images During Import

If pasted LaTeX contains `\includegraphics[...]{name}`, the importer inserts an upload step. It lists referenced filenames and lets you upload corresponding files.

- Files are matched by basename, case-insensitive, ignoring extension.
- Supported extensions include `.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`, `.gif`, and `.pdf`.
- `width` and `height` options are translated to Typst `#image(...)` arguments.
- Missing images do not block import; they remain visible in the review sidebar.

Images are stored in IndexedDB and mounted into the Typst compiler's virtual filesystem at `/imgs/<name>.<ext>`.

## GitHub Sync

The sync panel supports browser-side git operations for the active bank:

- Refresh local git data from app state
- Commit
- Choose a configured remote
- Fetch
- Fast-forward pull
- Push

GitHub setup lives in **Settings -> GitHub Credentials**. Tokens are stored separately from repo data, default to session-only storage, and should be fine-grained, expiring tokens scoped to the selected repository with Contents read/write permission.

Pull is fast-forward only and requires a clean working tree. Diverged histories stop without modifying local refs or app data.

## Google Drive Backup

Google Drive setup can be shared across banks, while the chosen Drive folder and sync metadata are stored per bank. The Drive panel can upload class-backed questions and saved tests, refresh the remote class index, and restore saved tests.

Configure app-level Google values at build time if users should not enter them manually:

```bash
VITE_GOOGLE_CLIENT_ID=1234567890-abc123def456.apps.googleusercontent.com \
VITE_GOOGLE_API_KEY=AIza... \
VITE_GOOGLE_CLOUD_PROJECT_NUMBER=123456789012 \
npm run dev
```

The Google Cloud project needs the Google Drive API and Google Picker API enabled, an OAuth client ID for a web application, a public Picker API key, and the app origin listed under authorized JavaScript origins.
