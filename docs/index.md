---
title: Introduction
slug: /
sidebar_position: 1
---

# Test Generator Documentation

Test Generator is a browser-based, local-first math test generator for teachers. It stores question banks in the browser, builds printable Typst/PDF tests from selected questions, and includes an experimental local Gradebook for administered saved tests.

The README is the project front door. These docs hold the workflow details, concepts, architecture notes, roadmap, and design decisions.

## Start Here

Use the user guide pages for teacher-facing workflows. Use the concepts and architecture pages when changing code or making product decisions.

| Goal | Page |
|---|---|
| Add and organize questions | [Question Bank](./user-guide/question-bank.md) |
| Build, save, preview, and export tests | [Test Builder and Saved Tests](./user-guide/test-builder.md) |
| Enter grades and manage rosters | [Gradebook](./user-guide/gradebook.md) |
| Import BNK, JSON, PQP, or pasted LaTeX | [Import, Export, and Sync](./user-guide/import-export-sync.md) |
| Understand browser-local storage | [Local-First Data](./concepts/local-first-data.md) and [Storage](./architecture/storage.md) |
| Understand Gradebook snapshots | [Saved Tests and Gradebook Assessments](./concepts/saved-test-vs-assessment.md) |
| Work on implementation | [Architecture Overview](./architecture/overview.md) |

## Documentation Principles

- Keep the README short and project-level.
- Put teacher workflows in user-guide pages.
- Put data-model and system behavior explanations in concepts.
- Put file-level implementation details in architecture.
- Record major product and architecture choices in decision records.

## Current Focus Areas

- Experimental local Gradebook.
- Gradebook backup and restore.
- Local-first privacy and storage.
- Future Google Classroom grade export as one-way grade passback.
- PQP as the shared workspace interchange format.
