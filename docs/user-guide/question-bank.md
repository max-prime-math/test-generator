---
title: Question Bank
sidebar_position: 1
---

# Question Bank

The Question Bank stores reusable math questions in the browser. Questions can be written directly in Typst, imported from supported formats, organized by curriculum, previewed, edited, and selected later in the Test Builder.

## Layout

The bank view has three resizable panels:

- Curriculum sidebar on the left
- Question list in the center
- Live preview panel on the right

Drag the divider handles to resize panels. Click a divider to collapse or expand the adjacent panel.

## Curriculum Organization

Questions can be assigned to a **curriculum class -> unit -> section** hierarchy. This is a math-course organization such as Algebra 2 or AP Calculus, not a rostered class period.

The sidebar lets you browse and filter by unit or section. Units are listed in numeric order. Clicking a unit or section filters the question list, and **Add Question** pre-fills the curriculum fields from the current selection.

The app ships without built-in production curriculum classes. You can create custom classes during Bulk Import or by assigning a question to a new class name in the editor.

Each class in the sidebar has an info button that opens a class info panel with question counts by unit and section. Custom classes, units, and sections can be renamed from that panel.

## Adding Questions

Each question has:

| Field | Description |
|---|---|
| Curriculum | Optional class, unit, and section assignment. |
| Body | Question text in Typst markup. |
| Choices | Optional MCQ choices A-E. Enter at least two to activate MCQ mode. |
| Correct answer | For MCQs, the correct letter. |
| Explanation / Solution | Optional written explanation or full solution. |
| Points | Numeric point value. Decimals such as `0.5` are allowed. |
| Tags | Comma-separated labels used for filtering. |

## MCQ Questions

If two or more choices are filled, the question is treated as multiple choice. Choices are laid out in a two-column grid in the generated PDF. Setting the correct answer enables the answer key.

## Editing and Deleting

Use **Edit** or **Delete** on any question card. Question deletion is permanent, so export a JSON backup first if the question may be needed later.

## Algorithmic BNK Questions

Questions imported from ExamView BNK packages can include an `algorithmModel`. When usable algorithm definitions exist, the bank card and preview panel show calculation controls:

- Generate a random seeded variant for one question.
- Enter a numeric seed to reproduce a variant.
- Store the generated seed and materialized values back on the question.

This recalculation is Test Generator-side. It does not need to match ExamView's exact random generator, but it depends on the decoder preserving algorithm definitions, sample values, graph models, and diagnostics.

## Searching and Filtering

- The search bar performs fuzzy search across body, tags, solution, and answer.
- Class tabs filter by curriculum class when multiple classes exist.
- Type tabs filter by All, MCQ, FRQ, or Graph.
- The sidebar tree drills down to a unit or section.

## Preview

Click a question card to preview it in the right panel. Use `j`/`k` or arrow keys to navigate between questions. Press `Escape` to close the preview.
