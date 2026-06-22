---
title: "0001: Local-First Gradebook"
sidebar_position: 1
---

# 0001: Local-First Gradebook

## Status

Accepted for the experimental Gradebook MVP.

## Context

The app is local-first and already stores question banks, saved tests, drafts, sync config, and uploaded images in browser storage. Gradebook data is sensitive student data and should not accidentally enter repo files, broad cloud sync, or shared backups.

## Decision

The first Gradebook version stores data locally under `tg-gradebook-v1`. It is gated behind **Settings -> More -> Gradebook (experimental)**.

The model uses stable IDs for sections, students, enrollments, assessments, and scores. Roster changes should not erase historical scores. Section removal is archive/trash based, not immediate hard deletion.

## Consequences

- Gradebook works without accounts or servers.
- Teachers must intentionally back up or export Gradebook data.
- GitHub sync and Google Drive backup do not include Gradebook data yet.
- Future cloud sync can map local entities to remote rows using stable IDs.
