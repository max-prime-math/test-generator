---
title: Question Bank
sidebar_position: 2
---

The Question Bank is where questions live. You can write questions in Typst, import them from supported formats, organize them by curriculum, preview them, edit them, and later pull them into the Test Builder.

![Question Bank with curriculum filters, question cards, and preview pane.](../assets/screenshots/question-bank.png)

## Layout

The bank view has three panels:

- Curriculum sidebar on the left
- Question list in the center
- Live preview panel on the right

Drag the divider handles to resize panels. Click a divider to collapse or expand the panel next to it.

## Curriculum Organization

Questions can be assigned to a **curriculum class -> unit -> section** hierarchy. This is a math-course organization such as Algebra 2 or AP Calculus, not a rostered class period.

The sidebar lets you browse and filter by unit or section. Units are listed in numeric order. Clicking a unit or section filters the question list. New questions are created in the **Editor** with **+ New Question**.

The app does not ship with production curriculum classes. Create your own classes during **Bulk Entry / Import** or while assigning a question in the Editor.

Each class in the sidebar has an info button with question counts by unit and section. Custom classes, units, and sections can be renamed there.

## Adding Questions

![Question editor with curriculum fields, Typst body, choices, and live preview.](../assets/screenshots/editor.png)

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

## Drafts and the Recycle Bin

Opening a bank question in the Editor does not create a draft. It becomes a draft only after you change something, and **Save** writes it back to the bank without leaving a draft behind. Unsaved drafts are kept in this browser and listed under **Drafts**.

To delete a draft, use **Delete draft** in the Editor toolbar or the delete icon on its row. Deleted drafts move to the **Recycle bin** below the draft list, where you can restore them or delete them permanently. Drafts in the Recycle bin are removed automatically after 30 days. Deleting a draft never changes the question saved in the bank.

## MCQ Questions

If two or more choices are filled, the question is treated as multiple choice. Choices are laid out in a two-column grid in the generated PDF. Setting the correct answer enables the answer key.

## Editing and Deleting

Use **Edit** or **Delete** on any question card. Question deletion is permanent, so export a JSON backup first if you might need the question later.

## Algorithmic Imported Questions

Questions imported from PQP or supported JSON files can include an `algorithmModel`. When usable algorithm definitions exist, the bank card and preview panel show calculation controls:

- Generate a random seeded variant for one question.
- Enter a numeric seed to reproduce a variant.
- Store the generated seed and materialized values back on the question.

This recalculation happens inside the app. The app uses the imported algorithm definitions, sample values, graph metadata, and diagnostics to create a materialized question variant.

See [Algorithmic Questions](./algorithmic-questions.md) for the full workflow, data model, expression support, examples, and manual review checklist.

## Adding Questions to a Test

Check one or more questions in the bank, then choose **Add to…**:

- **Current test** adds them to the end of the test open in Build, in the order the bank lists them. Questions already in the test are skipped, and the message says how many.
- **New test** starts a new unsaved test with just those questions. Nothing is lost: a named test is saved first, and an unsaved test that already had content is kept in **Saved Tests** as "Unsaved test – *date and time*", ready to rename or delete.

Use **Open in Build** in the message to continue in Build. The questions stay checked.

The Editor has the same **Add to…** button. There you can check drafts and bank questions. A draft of a bank question adds that bank question as it is saved in the bank; save the draft first to include your edits. New drafts that are not in the bank yet are skipped until you save them.

## Searching and Filtering

- The search bar performs fuzzy search across body, tags, solution, and answer.
- Class tabs filter by curriculum class when multiple classes exist.
- Type tabs filter by All, MCQ, FRQ, or Graph.
- The sidebar tree drills down to a unit or section.

## Preview

Click a question card to preview it in the right panel. Use `j`/`k` or arrow keys to navigate between questions. Press `Escape` to close the preview.
