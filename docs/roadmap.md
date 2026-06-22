---
title: Roadmap
sidebar_position: 1
---

# Roadmap

This roadmap tracks likely directions, not committed release dates.

## Bug Fixes

- **Fix drag-and-drop reordering**: The drag handle for reordering questions in the selected list is not working reliably.
- **Answer-space button overlap**: The answer-space plus/minus buttons can overlap the reset button when a non-default value is chosen.
- **Responsive question picker**: The right pane is cramped on small screens; improve layout or add a drawer/modal picker.

## Recently Completed

- Duplicate question.
- Create units and sections from the question editor.
- Sort options in the question bank.
- Bulk operations in the question bank.
- MCQs-first reflected in the selected list.
- Answer-space override reset button.
- Copy-to-clipboard in source view.
- Render-check progress bar.
- Experimental local Gradebook.
- PowerSchool-style roster import.
- Gradebook section trash/restore.

## Near Term

- **Custom theme import**: Paste a JSON object of CSS variables to create a saved custom theme.
- **Undo/Redo**: Track changes to test config, selected questions, and question content.
- **Page breaks and spacing**: Add page break or `#vfill()` controls between selected questions.
- **MCQ answer box**: Render a dedicated answer area for MCQ letter responses.
- **Better Typst export formatting**: Make generated Typst more modular and easier to edit.
- **Question type support in importer**: Add True/False, fill-in-the-blank, matching, short answer, long answer, essay, and numeric response.
- **Question type tags**: Auto-detect and label imported question types.
- **TikZ diagram handling**: Detect TikZ blocks and prompt for compiled SVG/PDF uploads.

## Medium Term

- **OCR / image import**: Paste or drag a photo of a printed question, send to Mathpix with a user-supplied API key, and convert to Typst.
- **QTI / Moodle GIFT import**: Parsers for Canvas, Blackboard, Moodle, and related assessment formats.
- **Google Classroom grade export**: Add one-way grade passback from local Gradebook to Classroom. Link Gradebook sections to Classroom courses, create or link Classroom coursework, match local students to Classroom submissions by stable IDs/email, then export normal numeric scores as Classroom `draftGrade` values for teacher review. Missing, excused, absent, and incomplete scores should be skipped with explicit warnings. Keep local Gradebook as source of truth until conflict rules for two-way sync are designed.

## Long Term

- **Used in tests tracking**: Record which saved tests each question has appeared in.
- **Question-level version history UI**: Surface git history per question with one-click revert.
- **OAuth login**: Replace PAT-based GitHub setup with OAuth through a small token-exchange service.
- **Cloud backend option**: Consider Supabase/Postgres for optional multi-device Gradebook sync after the local-first model stabilizes.
