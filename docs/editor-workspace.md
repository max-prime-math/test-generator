---
title: Editor workspace
---

Bank is for finding, organizing, selecting and viewing questions. Editor is for authoring. Open Editor from the main navigation, a Bank Edit/New/Duplicate action, or a Build question's Edit action. `#/editor/<question-id>` opens an existing question in the active bank; unfinished drafts also have local routes.

## Daily workflow

- Set **New-question defaults** once for a run of questions. Class, unit, section, points and tags apply to subsequent new questions, without changing existing questions.
- Write Question and Solution in Typst. Both fields offer the existing graph and picture insertion tools. The preview includes an optional solution, debounces rendering, reports errors, and keeps the last successful result while source is invalid.
- For MCQs, fill choice rows and mark the correct radio button. Add, remove or reorder choices; the correct answer follows the choice content. The current rendering system supports A–E.
- **Save** publishes to the bank and leaves the question open. **Save & New** or Ctrl/Cmd+Enter publishes and focuses a fresh question using the defaults. Ctrl/Cmd+S saves. **Duplicate** starts a new local draft without modifying the source.
- Search the navigator by question text, tags or ID, or filter the bank by curriculum. On small screens, Questions, Write and Preview become separate panels.
- **Bulk Entry / Import** retains the existing text, LaTeX, Typst, JSON and PQP parsing/review pipeline. **Stage in Editor** transfers selected questions to local drafts. Select drafts to assign shared curriculum, points or tags, then save selected questions. Invalid entries remain drafts and report individual errors.

## State and persistence

`src/lib/editor/editor-model.ts` owns draft construction, validation, conversion, duplication and commits. An editor draft extends the existing import fields with optional points, a local ID, MCQ mode and an original-question snapshot. Bank serialization remains the existing `Question` shape. No numeric or expression answer model is introduced: `answer` is only an MCQ letter and `solution` remains written markup.

`editor-drafts.ts` reads/writes a versioned browser session under `tg-editor-v1:<bank-id>`. It includes drafts, defaults and the active draft. `editor-state.svelte.ts` keeps that state reactive and flushes changes synchronously after editing updates and on pagehide. The originating bank ID is fixed for the session so the reload at a bank switch cannot write drafts into the next bank. Storage failures are surfaced; unreadable sessions are not overwritten.

Drafts can be incomplete or invalid Typst. Publishing requires a nonempty question and nonnegative points; an MCQ also requires at least two complete choices and a valid correct choice. Curriculum and solution are optional. A compile error does not discard or prevent saving source.

Publishing uses `bank.add` or `bank.update`. Existing IDs and creation dates remain stable; updates receive `updatedAt`. Folder autosave, workspace saves, Git serialization and backup continue to read the authoritative bank. No Editor-specific folder or sync writer exists. Drafts are browser-local and are **not included in Git/Drive/folder backups**. Save them to the bank to include them in normal persistence.

Original multipart structure survives unchanged edits; changing its flattened source converts it to ordinary Typst, matching the previous editor. Graphs, narratives, image declarations and algorithm definitions are retained. Edits clear stale validation results. Duplicates additionally clear generated algorithm evaluation, seed and variant identity; they keep the currently visible source and definitions. Draft image references count as used during Bank image cleanup.

A draft records its original bank question. If the original is removed or its content changes elsewhere, saving reports a conflict instead of recreating or overwriting it. Duplicate the draft to keep its content as a new question, or discard and reopen the current bank version. Changes only to render/check status do not cause conflicts.

## Boundaries

The proven ingest review dialog remains a dialog launched from Editor. Whole-bank JSON restoration and image/curriculum library management remain available in Bank. Algorithm generation stays in Bank; Editor preserves algorithm metadata and edits its rendered source. Open saved questions retain a local editing snapshot in the draft navigator. Drafts do not merge across browser tabs or devices.

## Verification

- `npm run test:editor`: identity, duplication, metadata, MCQ operations, incomplete drafts, defaults, conflicts, multipart source and repository serialization.
- `npm run test:editor:browser`: navigation/reload, rapid entry, MCQ reorder, import staging, batch metadata, both folder persistence backends, bank-switch draft isolation and mobile layout using isolated browser storage.
- Existing regression, repository data model, sync, Gradebook, workspace, workspace sync, local/remote Git and Git panel tests; existing workspace browser regression.
- `npm run check` and `npm run build:app`.

## File inventory

Added:

- `src/components/editor/EditorView.svelte`
- `src/components/editor/QuestionNavigator.svelte`
- `src/components/editor/QuestionForm.svelte`
- `src/components/editor/MarkupEditor.svelte`
- `src/components/editor/ChoiceEditor.svelte`
- `src/components/editor/CurriculumPicker.svelte`
- `src/components/editor/QuestionPreview.svelte`
- `src/components/editor/BulkQuestionEditor.svelte`
- `src/lib/editor/editor-model.ts`
- `src/lib/editor/editor-drafts.ts`
- `src/lib/editor/editor-state.svelte.ts`
- `scripts/test-editor.ts`
- `scripts/test-editor-browser.mjs`
- `docs/editor-workspace.md`

Changed: `src/App.svelte`, `src/components/BankView.svelte`, `src/components/TestView.svelte`, `src/components/IngestModal.svelte`, `src/components/QuestionEditor.svelte`, `src/lib/bank.svelte.ts`, and `package.json`.
