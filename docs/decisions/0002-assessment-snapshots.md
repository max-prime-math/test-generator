---
title: "0002: Assessment Snapshots"
sidebar_position: 2
---

# 0002: Assessment Snapshots

## Status

Accepted for the experimental Gradebook MVP.

## Context

Saved tests are reusable templates and can be edited after use. Questions can also change point values or content. Gradebook records must remain historically accurate.

## Decision

When a saved test is added to a Gradebook section, create a `GradebookAssessment` snapshot. The snapshot stores selected question IDs, labels, order, point values, bonus flags, total points, saved test metadata, and administered date.

Later saved-test edits do not resnapshot questions or point values. Test type/category changes can propagate to matching Gradebook assessments because they affect current weighting rather than historical question content.

## Consequences

- Old grades are protected from mutable saved-test and question-bank data.
- Assessment snapshots are slightly denormalized.
- Future sync/export can treat assessments as administered instances.
