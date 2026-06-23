---
title: Local-First Data
sidebar_position: 1
---

# Local-First Data

Test Generator works in the browser without a required server account. Core data is stored locally. Cloud and network actions are opt-in.

## What Local-First Means Here

- Questions, custom curriculum classes, saved tests, drafts, app settings, banks, and Gradebook data are browser-local.
- Uploaded images are stored in IndexedDB.
- PDF generation runs in the browser through Typst WebAssembly.
- Sync/export operations are explicit actions.
- Clearing browser site data can erase local work.

## Privacy Implications

Gradebook data contains student information and is treated separately from ordinary question-bank data. It is not currently included in GitHub sync or Google Drive backup.

Use Gradebook exports/backups for student data. Do not put private grade data into repository files.

## Backup Implications

Because the browser is the primary store, export backups periodically. If a bank includes images, keep the source image files or use an export path that preserves assets.
