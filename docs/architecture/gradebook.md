---
title: Gradebook Architecture
sidebar_position: 5
---

# Gradebook Architecture

The Gradebook is experimental and local-first. It is built around stable IDs and immutable assessment snapshots so it can later sync/export to other systems.

## Main Files

- `src/components/GradebookView.svelte`: Gradebook UI.
- `src/lib/gradebook.svelte.ts`: reactive store and persistence operations.
- `src/lib/gradebook-model.ts`: normalization, snapshots, score helpers, category helpers.
- `src/lib/gradebook-roster-import.ts`: PowerSchool-style roster import parser.
- `src/lib/types.ts`: Gradebook data types.

## Data Model

Core entities:

- `GradebookSection`
- `GradebookStudent`
- `GradebookEnrollment`
- `GradebookAssessment`
- `GradebookAssessmentQuestionSnapshot`
- `GradebookScore`
- `GradebookSettings`

## Snapshot Rule

Saved tests are mutable templates. Gradebook assessments are administered snapshots. When a saved test is added to a section, the Gradebook stores frozen question IDs, labels, order, point values, bonus flags, totals, saved test metadata, and administered date.

## Section Trash

Section deletion is modeled as archive/trash through `archivedAt`. Trashed sections are hidden from active lists but can be restored. Scores, enrollments, and assessments remain in local storage.

## Future Sync

Gradebook data should remain explicit and student-data-aware. Future Google Classroom export should be one-way grade passback first, using local Gradebook as source of truth and Classroom `draftGrade` values for teacher review.
