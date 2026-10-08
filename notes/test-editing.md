---
title: Reliable test editing
---

Opening a saved test starts an autosaved editing session. Changes to its title,
question selection/order, layout, and other settings update that same test after
a short debounce. “Saved locally” means the test library write completed; folder
and remote sync retain their own status indicators. Save (Ctrl/Cmd+S) flushes now.
Use Save As for a separate copy.

Build keeps the test ID when navigating away or reopening the app. Every edit
also writes an immediate browser recovery copy, so closing during image capture
or before the autosave timer completes retains the latest settings. On reopening,
pending changes are saved back to the original test. Older drafts without an ID
remain unnamed: the app cannot safely infer which test they belonged to.

Switching tests waits for pending saves. An unnamed draft is retained while
working on named tests and is available with Resume draft. New asks before
replacing an unfinished unnamed draft. Class filters only filter questions;
they no longer overwrite test titles.

Save errors are visible with Retry save. A failed save keeps the active test and
its edits rather than switching to another test. If the saved test was deleted
or its configuration changed elsewhere in the running app (for example by sync),
Save As preserves the local work separately. If browser recovery storage itself
fails, leaving the page triggers the browser's unsaved-work warning.

## Persistence

- `src/lib/test-editor.svelte.ts` owns session identity, recovery, serialized
  autosaves, transitions, and frozen question/image capture.
- Recovery uses the existing `tg-test-draft-v1` key. The configuration stays at
  the top level, with an optional `_editor` context containing the test ID, last
  committed configuration, and retained unnamed draft. This key keeps its
  existing bank-local/shared-workspace scoping. Context never enters TestConfig,
  SavedTest, repository files, or sync serialization.
- The existing test-library APIs commit configuration and frozen content in a
  single browser write, after image assets are stored. Failed writes don't
  publish a successful in-memory result. Overlapping saves are serialized.
- Existing folder/workspace watchers and Git/Drive serialization consume the
  same library as before. A slow workspace write cannot attach obsolete content
  snapshots to a more recently edited configuration.
- Bank switches initiated by the app flush test changes before saving folders
  and switching the active browser snapshot. The outgoing session cannot write
  into the incoming bank during page shutdown.

The browser recovery copy protects this browser. Folder or remote writes still
need to finish before the latest changes are available on another computer.

## Regression coverage

`npm run test:builder:browser` exercises actual Build controls and persistence:
unchanged test identity and creation date, nested config changes, mode changes,
custom title retention, immediate reload and closed-tab recovery, delayed image
capture with overlapping edits, quota failure/retry, old-draft compatibility,
conflict copies, retained unnamed drafts, and both folder backends.
