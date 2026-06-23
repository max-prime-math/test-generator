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
- **Google Drive real-time backup**: Promote the current manual Drive backup into a dependable near-real-time backup system:
  - Add a local change tracker for bank data, class-backed questions, saved tests, custom classes, image payloads, and sync metadata.
  - Keep Gradebook data explicitly excluded from bank backup and bank restore paths.
  - Replace one-shot "Upload Bank" behavior with a debounced background backup queue that coalesces rapid edits, retries transient failures, and survives navigation within the app.
  - Persist queued backup jobs and last-success state in browser storage so a reload can resume or clearly report unfinished Drive work.
  - Keep the visible user-selected Drive folder model, including folder change handling and manifest reset when the target folder changes.
  - Store Drive files in a stable, inspectable layout with predictable paths for indexes, classes, tests, images, and future format migrations.
  - Track per-file hashes, Drive file IDs, modified times, local dirty state, pending uploads, failed uploads, and last successful backup time.
  - Add token-expiry handling that pauses the queue, prompts for reconnect, and resumes pending uploads after Google reauthorization.
  - Add explicit offline handling, backoff, and "backup paused" states rather than silently dropping changes.
  - Add conflict detection for files changed or deleted directly in Drive, with a conservative default that preserves local data and creates downloadable conflict copies.
  - Expose full Drive restore for class/question data, images, and saved tests, not only saved-test restore.
  - Add a "backup now" command that flushes the queue and reports exactly which files uploaded, skipped, failed, or conflicted.
  - Add visible status in the app shell and Drive panel: connected folder, last backup time, pending count, failed count, reconnect needed, and conflict count.
  - Add user controls to pause/resume automatic Drive backup, change folders, disconnect Drive, and download the current backup manifest for troubleshooting.
  - Add integration tests for the sync manager queue, manifest updates, retry behavior, conflict cases, and restore paths with a mocked Drive provider.
  - Add browser-level smoke tests for connect, folder selection/create-folder flow, manual backup, automatic backup after edits, reconnect prompts, and restore UI.
  - Document the exact Drive backup scope, what is not backed up, privacy implications, expected latency, conflict behavior, and recovery steps.
  - Add a release checklist for Google Cloud configuration: Drive API, Picker API, OAuth web client, authorized origins, public Picker key restrictions, and GitHub Pages build variables.
- **Google Drive Gradebook sync**: Add a separate Drive sync path for Gradebook data with a hard boundary from question-bank backup:
  - Treat Gradebook sync as a distinct product surface with its own connection state, folder picker, manifest, status, conflicts, and restore UI.
  - Require Gradebook Drive sync to use a different Drive folder from every bank backup folder; block setup if the selected folder matches an existing bank backup folder.
  - Allow the same Google account as bank backup, but store Gradebook folder IDs, access state, and sync metadata under separate Gradebook-specific keys.
  - Allow a different Google account by supporting an independent Gradebook authorization flow and clear account labels for bank backup versus Gradebook sync.
  - Never write Gradebook files into the bank backup folder, never write bank files into the Gradebook folder, and never let a bank restore import Gradebook data.
  - Move toward a Gradebook identity model that is not accidentally tied to the active question-bank workspace before enabling cross-bank Gradebook sync.
  - Define a Gradebook Drive layout such as `manifest.json`, `gradebook.json`, optional per-section files, and export/audit metadata, all under the Gradebook folder only.
  - Sync the full restore-capable Gradebook payload: sections, students, enrollments, assessment snapshots, scores, score states, settings, and trashed sections.
  - Preserve the local-first Gradebook as the source of truth, with Drive as teacher-controlled backup/sync rather than a silent external authority.
  - Add near-real-time debounced backup for Gradebook mutations, including roster imports, score entry, section edits, assessment additions, trash/restore, and settings changes.
  - Add a manual "backup gradebook now" command and a restore flow that replaces only Gradebook data after explicit confirmation.
  - Add privacy-focused status and warnings because Gradebook files contain student information, including clear folder/account labels before upload or restore.
  - Add conservative conflict handling for edits from another browser or direct Drive changes, with local-preserving conflict copies and explicit teacher review.
  - Add tests proving bank sync and Gradebook sync cannot share manifests, folder keys, file paths, restore handlers, or queued jobs.
  - Update docs to explain that question banks and Gradebooks are separate Drive sync domains, even when they use the same Google account.
- **Algorithmic question improvements**: Add a dedicated development track for imported algorithmic questions:
  - Add an algorithm editor that exposes definitions, dependencies, sample values, and diagnostics without requiring JSON edits.
  - Add a non-destructive preview mode so teachers can generate variants without immediately mutating the saved question.
  - Store imported template text separately from materialized text, then regenerate from the template every time.
  - Add a variant history or "restore imported sample" command.
  - Include `algorithmSeed` and `algorithmVariant` in git repo serialization if variant state is meant to sync.
  - Add unit tests for `calculateAlgorithmicQuestionVariant(...)`, especially conditions, previous-value replacement, graph materialization, and unsupported fallback behavior.
  - Add a compatibility test corpus from representative BNK banks with expected decoded definitions and rendered variants.
  - Replace string replacement with a math-aware materializer for Typst math where practical.
  - Sort or validate definitions by dependency order, and warn when a definition uses a later unresolved dependency.
  - Expand expression support for common recovered ExamView functions that the decoder already recognizes, such as `list`, `fracs`, `chr`, and `lcm`.
  - Make condition attempts observable in diagnostics, including which attempt satisfied the constraints.
  - Separate choice scrambling from variant generation and reconcile recovered `scramble` controls with Test Builder choice shuffling.
  - Add group-aware calculation for narrative and matching-group scoped algorithms.
  - Add UI warnings when a computed value changed but no matching placeholder was replaced in body, choices, solution, or graph fields.
  - Document and version the seeded RNG contract if generated variants need long-term reproducibility across app releases.
- **Google Classroom grade export**: Add one-way grade passback from local Gradebook to Classroom. Link Gradebook sections to Classroom courses, create or link Classroom coursework, match local students to Classroom submissions by stable IDs/email, then export normal numeric scores as Classroom `draftGrade` values for teacher review. Missing, excused, absent, and incomplete scores should be skipped with explicit warnings. Keep local Gradebook as source of truth until conflict rules for two-way sync are designed.

## Long Term

- **Used in tests tracking**: Record which saved tests each question has appeared in.
- **Question-level version history UI**: Surface git history per question with one-click revert.
- **OAuth login**: Replace PAT-based GitHub setup with OAuth through a small token-exchange service.
- **Cloud backend option**: Consider Supabase/Postgres for optional multi-device Gradebook sync after the local-first model stabilizes.
