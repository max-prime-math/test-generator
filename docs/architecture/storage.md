---
title: Storage
sidebar_position: 2
---

# Storage

Most app data is stored in browser storage. This page is a working map for developers.

## localStorage

Important localStorage keys include:

| Key | Purpose |
|---|---|
| `math-test-bank-v2` | Active question bank data. |
| `math-test-custom-classes-v1` | Custom curriculum classes. |
| `tg-test-library-v1` | Saved tests. |
| `tg-test-draft-v1` | Current test builder draft. |
| `tg-gradebook-v1` | Experimental Gradebook data. |
| `tg-bank:*` | Per-bank snapshots. |
| `tg-google-drive-*` | Google Drive folder/config metadata. |

The bank switcher snapshots active legacy keys into per-bank records when switching banks.

## IndexedDB

Uploaded images are stored in an IndexedDB database named `test-generator`. Per-bank image snapshots are stored alongside the active image store.

The Typst compiler mounts stored images into a virtual `/imgs/` path at compile time.

## Sensitive Data

Gradebook data is sensitive student data. It is local-only in the MVP and is not projected into GitHub sync or Google Drive backup.

GitHub tokens are stored separately from repo data. Persistent token storage requires explicit opt-in.

## Migration Considerations

Data models should preserve stable IDs for future export/sync:

- Question IDs
- Saved test IDs
- Gradebook section IDs
- Student IDs
- Enrollment IDs
- Assessment IDs
- Score IDs

Student names are not stable identifiers. SIS IDs and emails are optional matching aids, not primary keys.
