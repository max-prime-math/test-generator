---
title: Introduction
slug: /
sidebar_position: 1
---

Test Generator is a browser-based math test generator for teachers. It helps you build a local question bank, organize questions by curriculum, generate printable tests, and optionally track scores in the experimental Gradebook.

These docs are a how-to guide for using the app. Project setup and implementation details belong in the README.

## Start Here

| Goal | Page |
|---|---|
| Set up your first bank and import existing material | [Getting Started](./user-guide/getting-started.md) |
| Add, edit, organize, and preview questions | [Question Bank](./user-guide/question-bank.md) |
| Paste, review, import, export, and back up questions | [Import and Back Up Questions](./user-guide/import-export-sync.md) |
| Prepare a `.pqp.json` package for richer imports | [Portable Question Package](./user-guide/portable-question-package.md) |
| Generate seeded variants from imported algorithmic questions | [Algorithmic Questions](./user-guide/algorithmic-questions.md) |
| Write math and multi-part questions in Typst | [Typst Authoring](./user-guide/typst-authoring.md) |
| Build, save, preview, and export tests | [Test Builder and Saved Tests](./user-guide/test-builder.md) |
| Enter rosters, scores, and backups | [Gradebook](./user-guide/gradebook.md) |

## How the App Stores Work

The normal workflow is local-first. Questions, saved tests, drafts, settings, uploaded images, and Gradebook data are stored in this browser unless you explicitly export, sync, or back up.

Because browser storage is the primary workspace, make a backup after meaningful changes:

- Use **Export JSON** from the Question Bank for question-bank backups.
- Keep image files that you import into questions.
- Use Gradebook **Backup JSON** for student and score data.
- Use GitHub sync or Google Drive backup only when you intentionally connect them in the app.

## Suggested First Workflow

1. Open **Question Bank**.
2. Add a small set of questions manually, or use **Bulk Import** to paste existing material.
3. Review the imported questions before committing them to the bank.
4. Assign questions to a curriculum class, unit, and section.
5. Open **Build Test**, filter to that class or section, and add questions.
6. Preview the PDF, then download or print it.
7. Export a JSON backup of the bank.
