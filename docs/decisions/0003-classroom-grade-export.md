---
title: "0003: Future Classroom Grade Export"
sidebar_position: 3
---

# 0003: Future Classroom Grade Export

## Status

Planned, not implemented.

## Context

Teachers may want to pass local Gradebook scores into Google Classroom. Classroom grade updates are tied to Classroom coursework and OAuth permissions, and arbitrary manually-created assignments may not be writable by this app.

## Decision

The planned first version should be one-way grade export:

- Local Gradebook remains source of truth.
- Gradebook sections link to Classroom courses.
- Assessments create or link to Classroom coursework.
- Local students match to Classroom submissions by stable IDs/email.
- Normal numeric scores export as Classroom `draftGrade` values for teacher review.
- Missing, excused, absent, and incomplete scores are skipped with warnings.

Two-way grade sync is out of scope until conflict rules are designed.

## Consequences

- Teacher review remains in Classroom before grades are returned/published.
- The local model needs stable remote IDs for courses, coursework, submissions, and export timestamps.
- OAuth scopes and student-data privacy must be explicit.
