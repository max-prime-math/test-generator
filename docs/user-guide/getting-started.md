---
title: Getting Started
sidebar_position: 1
---

Use this page when you are setting up Test Generator for the first time or bringing existing questions into the app.

## Create Your First Bank

1. Open **Question Bank**.
2. If you already have a bank selected, use the bank switcher to create a new local bank for the course or unit you are working on.
3. Decide on a curriculum structure before importing a large set:
   - **Class**: course or subject, such as Algebra 2 or AP Calculus.
   - **Unit**: major topic or chapter.
   - **Section**: smaller lesson, standard, or textbook section.

You can create classes, units, and sections during import review, or later while editing a question.

## Choose an Import Path

| Starting material | Best path |
|---|---|
| A few questions you want to type by hand | **Add Question** in the Question Bank |
| Pasted text, LaTeX, Typst, or mixed exam content | **Bulk Import** |
| A prepared `.pqp.json` package | **Import PQP / JSON** |
| A simple JSON list of questions | **Import PQP / JSON** |
| Questions with images | **Bulk Import**, then upload the referenced image files when prompted |

If you are not sure which path to use, start with **Bulk Import**. It gives you a review step before anything is added to the bank.

## Onboard Existing Tests

For a test or worksheet you already have:

1. Copy the question text into **Bulk Import**.
2. Keep each question separated by a blank line or a clear question number.
3. Use recognizable choice labels for multiple choice, such as `A.`, `B.`, `C.`, and `D.`.
4. Keep solutions or answer notes close to the question they belong to.
5. Review the parsed questions in the import screen.
6. Assign the class, unit, section, points, tags, and type.
7. Commit the reviewed questions to the bank.

After import, select a few questions in the bank and check the preview. Fix formatting while the batch is still fresh in your mind.

## Onboard a Prepared Question Package

Use a Portable Question Package when you need more than plain text. PQP can carry choices, solutions, points, curriculum placement, images, algorithm metadata, graph metadata, and diagnostics.

1. Download or prepare a `.pqp.json` file.
2. Open **Question Bank**.
3. Click **Import PQP / JSON**.
4. Select the package.
5. Review any import warnings.
6. Confirm that classes, units, and sections were created or matched as expected.

See [Portable Question Package](./portable-question-package.md) for the file shape and examples.

## Check Imported Questions

Before using imported questions on a real assessment:

1. Search or filter to the imported batch.
2. Open the preview panel for representative questions.
3. Confirm the body, choices, answer, solution, points, and tags.
4. For image questions, confirm that images render in preview.
5. For algorithmic questions, generate a few seeded variants and check the answer key.
6. Duplicate any question before making a major variation.

## Build Your First Test

1. Open **Build Test**.
2. Use the picker filters to show the class, unit, or section you just imported.
3. Add questions to the selected list.
4. Choose layout, point display, answer key, and formatting settings.
5. Preview the PDF.
6. Use **Save As** if you want a reusable test template.
7. Download or print the test.

## Back Up Your Work

After importing or editing a meaningful batch:

- Use **Export JSON** in the Question Bank.
- Keep a copy of source images.
- If you use the Gradebook, use **Backup JSON** from the Gradebook area.
- If GitHub or Google Drive is configured in the app, use those backups only for data you intentionally want to sync.
