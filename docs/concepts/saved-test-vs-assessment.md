---
title: Saved Tests and Gradebook Assessments
sidebar_position: 3
---

# Saved Tests and Gradebook Assessments

A saved test and a Gradebook assessment are intentionally different.

## Saved Test

A saved test is a reusable template in the Test Builder. It can change over time as a teacher edits:

- Name
- Curriculum metadata
- Test type
- Selected question IDs
- Layout settings
- Answer-key settings
- Bonus question flags

## Gradebook Assessment

A Gradebook assessment is an administered instance of a saved test. When a saved test is added to the Gradebook, the app freezes a snapshot of the test at that moment.

The snapshot protects old grades from later edits to the saved test or question bank.

## Why Snapshots Matter

Question point values, selected question order, and bonus flags can change later. If old grade records pointed directly at mutable saved-test data, historical grades could become corrupted.

The Gradebook snapshot stores the old question order, labels, point values, total points, bonus points, and administered date so old scores remain meaningful.
