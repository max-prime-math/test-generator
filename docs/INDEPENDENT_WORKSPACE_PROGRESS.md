# Independent local workspace folders

Implemented and locally verified, 2026-09-15, branch
`feature/independent-workspace-folders`. User authorized committing and pushing
this feature branch on 2026-09-15. Check branch history/upstream for publication
status. Not deployed to testgen.dev.

Goal: select a local root with independent `banks/`, `tests/`, and `gradebook/`.
Keep legacy single-bank folder connections working. Commit/push is authorized;
merging to main or deploying requires separate direction.

Acceptance: separate files and manifests, no student data in banks/tests,
self-contained saved tests, bank switching does not replace workspace tests or
gradebook, permission/error handling and external-change protection, regression
tests and build. Google Drive sharing is configured outside TestGen; never share
the root when a child is meant to remain private.

## Delivered behavior

- Folder modal offers a root workspace separately from legacy single-bank mode.
- `banks/<bank-id>/`: one independent bank-format manifest per bank, no saved-test
  content or gradebook records. Several banks can use the same class ID.
- `tests/<class-id>/<test-id>/`: one self-contained manifest with frozen questions,
  narratives, configuration, required images, and curriculum. Source banks are
  not needed when opening a shared test folder.
- No-class tests use `tests/_unclassified/`. Legacy flat saves are readable and
  migrate on save by copying into the class folder and archiving the previous
  location. Class changes and moving back preserve snapshots and stable test IDs.
- `gradebook/gradebook.json`: existing backup format, no data copied into the
  bank/test folders. Existing browser-backed gradebooks are not auto-merged.
- Cross-bank search in the Build Test picker, class/unit/section
  merging by stable ID, source-bank labels, collision-safe catalog question IDs.
- Combined catalog is read-only; edit originals in the source bank. Snapshot
  content keeps existing tests stable after source edits.
- Root handle persists in IndexedDB. Workspace-wide tests/gradebook survive bank
  switching. An unrelated browser bank is not written until explicitly added.
- Optimistic external-change checks pause autosave instead of overwriting another
  copy. Reload/disconnect provide explicit recovery choices. Not collaborative
  locking or automatic merging; multi-file writes are not fully atomic.
- Untracked files are preserved. Test deletions use recoverable tombstones.

## Verification

- `npm run check`: zero errors; 48 pre-existing style/accessibility warnings in
  eight existing components. No warnings in the new workspace components.
- `npm run test:workspace`: passed (separation, snapshots, image references,
  missing-question rejection, class merging, path safety, conflicts, untracked files).
- `npm run test:repo-data-model`, `npm run test:gradebook`, `npm run test:sync`: passed.
- `npm run build:app`: passed; existing large-bundle warning remains.
- `npm run test:workspace:browser`: passed with its own fresh localhost Vite server
  in an isolated Chromium profile with origin-private fixture directories. Checks:
  two banks sharing a class and original question ID; same image filename with
  different bytes; aggregate search; mixed-bank snapshot export; no student-data
  leakage; switching banks preserves tests/gradebook; tests-only workspace loads
  without source banks; missing gradebook loads empty; external changes preserved;
  new root creates exactly banks/tests/gradebook; another bank is explicitly added;
  permission loss pauses saves and regrant resumes them.
- Browser page-error list empty. Representative search screenshot inspected at
  `/tmp/testgen-workspace-multibank.png`.
- `git diff --check`: passed.

The browser runner now starts and closes its own dev server to avoid duplicate
store instances from a long-running Vite server's stale hot-reload URLs. An
intermediate rerun timed out for that harness reason; the final expanded suite
passed with a fresh module graph. Do not use that timeout as an unresolved app
failure. To use TESTGEN_TEST_URL instead, restart the external dev server first.

Browser tests simulate picker permissions with real browser-private directory
handles. A physical Google Drive desktop folder, native picker permission renewal,
and cloud sharing permissions have not been manually tested. TestGen does not set
Drive permissions. Keep the root private; share selected child folders only.

## Entry points and continuation

### Bank dropdown removal (2026-09-15)

At the user's request, removed the separate “Search all workspace banks” dropdown
from Question Bank, its component, and its unused add-to-test event listener.
The standard active-bank selector and Build Test's bank/class filtering remain.
No replacement bank-organization UI was added; that design is deferred.
The browser test now checks the removed panel stays absent and verifies combined
class results and individual-bank filtering in Build Test instead. The user
also explicitly approved uploading source/documentation to
`max-prime-math/test-generator`; push the follow-up with the prior workspace
commit to the feature branch, not main. Deployment is still not authorized.

### Responsiveness follow-up (2026-09-15)

Replaced repeated full-list duplicate/look-up scans with first-wins ID maps in
the question picker and portable snapshot creation. Frozen saved-test questions
still take precedence over originals. Image deduplication is also linear.
The picker renders 100 matching rows per page, with Previous/Next controls;
search, All, and Random still use the entire filtered pool. Changing filters
returns to the first page. Selection survives page navigation. Hidden Build
tabs no longer enqueue speculative question preview compilations.

Idle workspace autosave compares existing serialized storage values plus a small
image-change token before parsing/exporting/hashing or reading image bytes.
Image put/remove and bulk restore invalidate the token, including other tabs
when localStorage is available. Permission is still checked on each tick;
explicit Save workspace always runs the existing save checks. At most one background
save is queued. The saved-input baseline is captured BEFORE asynchronous work,
so edits arriving during a save remain dirty for the following pass. Conflict
checks and manual external-folder reload behavior are unchanged.

`npm run test:workspace:performance` uses six synthetic banks / 3,000 questions
in an isolated browser. A before/after run measured catalog + reactive update
at 1,166 ms before and 80 ms after; mounted picker rows fell from 3,000 to 100.
These are synthetic measurements, not an end-to-end Drive or real-bank speed
guarantee. Tests verify page navigation, selection retention, and finding a
question beyond the first page. Browser workspace tests additionally verify
zero image-database reads across two idle autosave ticks, gradebook autosave,
and image-only invalidation. All workspace, repo model, gradebook, sync, and
browser tests pass; check has 0 errors / 48 existing warnings; app build passes.

### Loading-progress follow-up

Added a foreground `loadingProgress` state and `WorkspaceLoadingOverlay` that
starts before file reads, keeps background UI inert, blocks app shortcuts, and
shows actual per-stage bank/file/question/image counts. Pending writes finish
before loading; autosave is paused during replacement. Ordinary saves do not
flash a loading screen. Errors/permission problems now have an always-visible
main-app notice with a path into the workspace settings. Startup comparisons
run before publishing catalog/image changes; newly copied bank IDs are also
installed into the browser registry, then the bank selector is refreshed.

No automatic file watcher or merge was added. External file changes still need
Reload workspace or startup scanning; disagreement pauses autosave. Reload
confirmation warns to finish copying/syncing and that browser edits are replaced.

Tests verify real file progress totals, overlay/background inertness, observed
loading phases, overlay dismissal on success/failure, visible conflict notices,
unchanged browser data after malformed-file rejection, and newly copied banks
appearing in the selector after restart. The loading screenshot was visually
inspected at `/tmp/testgen-workspace-loading.png`.

Final loading-pass verification: `npm run check` reports 0 errors (48 existing
warnings); workspace, repo-data-model, gradebook, sync, and workspace-browser
tests all pass. `npm run build:app` succeeds with the existing large-chunk
warning, and `git diff --check` is clean. This verification preceded the user's
commit/push authorization; deployment remains a separate step.

### Class-folder follow-up

Added `workspace-tests.ts` for `tests/<class-id>/<test-id>/` storage. Tests cover
legacy flat-layout reading and migration, changing class and moving back,
unclassified tests, tombstone-based deletion, class-folder-only import, rejecting
duplicate/misplaced tests, and external source edits blocking a move. The browser
suite also exercises class changes in both directions and loads a copied single
class folder without banks/gradebook. Windows `.lnk` files in tests/ are rejected
explicitly, not silently treated as empty classes; per-class folder overrides
are still not implemented. Live Google Drive/Windows sharing remains unverified.

Migration does not erase files: old locations retain recoverable tombstones.
Prior shared copies can still be read by their previous recipients. An interrupted
copy can leave two active copies; the reader reports the duplicate for explicit
recovery rather than selecting a winner and risking data loss.

`src/lib/local-workspace.svelte.ts` orchestrates root I/O; `folder-io.ts` validates
and writes manifests; `workspace-format.ts` separates bank/test data and snapshots;
`workspace-catalog.svelte.ts` builds the cross-bank index. UI: LocalWorkspacePanel,
and TestView. User instructions: `user-guide/local-workspace.md`.

To test manually, run `npm run dev -- --host 127.0.0.1 --port 5187 --strictPort`,
open the folder button, and choose a NEW private root. Add another bank explicitly
through the folder panel. Existing checkout and AP Calculus bank repository were
not changed. No real question bank, student data, or Drive folders were used in
automated tests. After the authorized feature-branch commit/push, the next step
is user testing/review, then an explicitly authorized merge/deployment—not
silently deploying this branch. The deployment workflow runs on pushes to main,
not pushes to this feature branch.
