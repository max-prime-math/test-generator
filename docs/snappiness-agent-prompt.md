---
title: Responsiveness Agent Prompt
description: Implementation brief for the next Test Generator responsiveness improvements.
---

# Improve Test Generator Responsiveness

You are working in `max-prime-math/test-generator`, a Svelte 5 + TypeScript + Vite, local-first math test generator. Improve responsiveness when opening questions, switching banks, and working with thousands of questions and images.

## Working constraints

- Read applicable AGENTS.md instructions and inspect the current implementation first.
- Preserve existing changes. Use at most two narrowly scoped subagents, only when independent work warrants the token cost.
- Prefer incremental changes; do not add a server database or a competing source of truth.
- Preserve question IDs, drafts, saved tests, Gradebook, imports, graphs, images, Typst, local folders, Git/GitHub sync, and Google Drive backup.
- Report a concise implementation sequence, then implement and validate it. Measure improvements rather than assuming them.

## Existing performance work

Review the recently added Typst worker, repository export worker, bounded image-free SVG cache, incremental per-bank catalog updates, unchanged-autosave guards, increased repository limits, and reduced draft serialization. Reuse these changes rather than repeating them. Bank switching still reloads the app.

Inspect app navigation, bank/workspace persistence, editor drafts, image storage and thumbnails, preview queues, workspace catalogs, saved-test snapshots, synchronization, and large question/import lists.

## 1. Switch banks without reloading

Replace the reload/image-copy cycle with an explicit state transition. Keep the application shell and compiler alive, safely flush outgoing edits, and load incoming records without leaking drafts, images, selections, or settings between banks. Preserve workspace-wide tests and Gradebook. Handle rapid switching, synchronization, and failures; retain usable outgoing state if switching fails.

Move active questions and drafts toward individual IndexedDB records keyed by bank and record ID. Provide a versioned, verified migration with recovery copies until success. Test interruption, reload, storage failure, and bank isolation. Preserve compatible folder/Git formats and conflict protection.

## 2. Prioritize the latest preview

Give each preview consumer an identity and request revision. Replace its obsolete queued jobs without canceling other consumers or explicit PDF/batch exports. Ignore stale results and errors; settle canceled promises and release resources. If active compilation cannot be interrupted safely, let it finish and skip obsolete queued requests afterward.

Bound queued work and caches. Keep the last successful preview visible with an updating indicator, but never mislabel the previous question's preview as the newly selected question. Invalidate image previews after replacement, rename, deletion, and bank switching.

## 3. Load image bytes only when needed

Separate lightweight metadata from payloads so initialization does not read every image. Migrate existing records safely. Fetch bytes only for visible thumbnails, previews, and explicit exports. Limit concurrent thumbnail work, bound caches, and revoke unused object URLs. Preserve supported formats, graph images, imported assets, saved-test snapshots, and reference consistency.

## 4. Make saving proportional to edits

Track changed questions, drafts, tests, curriculum records, and assets. Save individual records rather than serializing every draft on each keystroke. Avoid rebuilding all saved-test snapshots for unrelated edits; reuse unchanged export entries and hashes where safe. Batch folder synchronization and retain failed changes for retry.

Capture save revisions so edits arriving during saves remain pending. Distinguish local durability from synchronization. Navigation and refresh must retain edits; background synchronization must not silently overwrite external changes.

## 5. Keep lists and search lightweight

Audit Bank, Editor, imports, image library, and Test Builder. Paginate or virtualize large lists, including drafts. Preserve selection, keyboard access, focus, and scroll position. Search the entire collection, not only displayed rows. Maintain reusable search text/indexes rather than rebuilding them per keystroke. Avoid expensive effects in inactive modes and preserve narrow-screen usability.

## 6. Give immediate visual feedback

Highlight selection immediately and display editable content before rendering finishes. Keep navigation and typing responsive. Use unobtrusive indicators for bank loading, previews, and sync; accurately distinguish “Saving locally,” “Saved locally,” and “Syncing to folder.” Provide actionable errors and retries without unnecessary blocking overlays, dialogs, or layout shifts.

## 7. Add opt-in performance diagnostics

Add a bounded, local, disabled-by-default recorder for selection-to-editable-content time, preview latency, bank-switch phases, local saves, synchronization, long main-thread tasks, and render queue/discard counts. Allow copying/exporting the report. Record timings and counts, not question bodies, student information, or image contents.

## Validation and acceptance

Use isolated synthetic fixtures, never the user's real banks. Compare before/after measurements for several banks totaling at least 10,000 questions, thousands of drafts, image-heavy banks, rapid navigation, concurrent editing/rendering/sync, cold startup, and warm navigation. Aim for visible input/selection feedback within 100 ms on the test machine; report long tasks and remaining bottlenecks, not just averages.

Test IDs and serialization compatibility; MCQ/written-response round trips; draft navigation/reload recovery; migration recovery; bank isolation; image/cache invalidation; queue correctness; concurrent PDF export; edits during saves; failure retries; folder conflicts; permission loss; test snapshots; and Gradebook preservation. Verify production worker/WASM loading under the GitHub Pages base path.

Run `npm run check`, `npm run build:app`, and relevant existing and new regression/browser tests. Do not suppress errors to pass checks.

## Completion

Summarize changes, user-visible benefits, measured results, migration/persistence behavior, checks, and limitations. Respect existing commit/push authorization. When publishing is authorized, commit reviewed changes, push, and verify the GitHub build/deployment before reporting completion.
