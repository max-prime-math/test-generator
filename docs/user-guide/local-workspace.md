---
title: Independent Local Workspace
sidebar_position: 4
---

# Independent local workspace

Open the folder button in the header and choose **Open workspace root** in the
**Workspace folder** section. Do not use **Choose single-bank folder** below it;
that is the legacy workflow for writing one bank directly into the selected
directory. The legacy workflow refuses roots that already contain `banks/`.
Use a private local directory, including a directory managed by a desktop sync
client. File-system permission is granted through the browser; no local TestGen
server is needed. Use the folder controls directly in the deployed web app.

```text
My TestGen Workspace/
  banks/
    bank-a/          # questions, curriculum, narratives, images; no saved tests
    bank-b/          # another independent bank, possibly the same class
  tests/
    pre-calculus-40s/
      test-id/       # test settings + frozen questions, narratives, images
    calculus/
      another-test-id/
    _unclassified/   # tests without a class
  gradebook/
    gradebook.json  # students, sections, enrollments, assessments, scores
```

Each bank and test has its own manifest. The root has no shared data manifest or
cross-folder asset dependencies. If a workspace converted from the older
single-bank layout still has a bank manifest and bank data at the root, TestGen
ignores those root-level legacy files once a `banks/` directory exists; it does
not delete them. Gradebook uses the existing backup format.
The empty `tests/index.json` inside a bank is retained for bank-format
compatibility; it contains no saved-test content.

## Working with many banks

The Build Test question picker shows 100 matches per page. Use Previous/Next
to browse more; searching still covers every bank in the selected scope, and
selections are kept when you change pages. **All** and **Random** use the entire
matching pool, not just the current page.

Autosave checks for browser edits roughly every 2.5 seconds, but skips expensive
data/image processing when nothing has changed. Explicit **Save workspace** still
runs a full save pass. External folder changes still require **Reload workspace**.

## Class folders for tests

TestGen chooses a test's folder from its saved **class tag**, using the stable
class ID rather than its display name. Two banks with that same class tag feed
the same class test folder. A display-name change does not rename the directory.
Changing a saved test's class moves its active saved copy into the new class's
folder; a test with no class goes under `_unclassified/`.

To share only Pre-Calculus 40S tests, share `tests/pre-calculus-40s/`, not all of
`tests/` or the workspace root. A colleague can place that actual class directory
under their own workspace's `tests/`, keeping the same class-ID folder name, then
choose **Reload workspace**. All required question snapshots and images travel
inside the test folders. Their banks and gradebook are not needed or included.
Copying a folder is a one-time transfer, not live synchronization by itself.

Windows Google Drive shortcuts are not the same as actual directories. The
class-folder layout is implemented and tested with real browser directory
handles; a live Drive-for-Windows shortcut setup has not been verified. There is
not yet a separate folder picker to redirect an individual class to a shared
folder elsewhere on disk. Do not assume a `.lnk` file provides that connection.

Existing flat `tests/<test-id>/` saves remain readable. On the next save, TestGen
copies them into the appropriate class directory and archives the old location
with a `deleted.json` marker. Class changes use the same copy-and-archive process.
Old files remain recoverable and may remain visible to people who had access to
the old folder; moving a test does **not** revoke their access to prior copies.
Moving back to a previously used class reactivates that known archived location.
Duplicate active IDs or a class directory that disagrees with the test's class
are reported as errors rather than silently merged. Keep a backup before migrating.

## Multiple banks and searching

An existing workspace registers the banks found in `banks/`. A new workspace
starts with the active browser bank, not every unrelated browser bank. Create or
switch to another bank with the header controls, then use **Add active bank to
workspace** in the folder panel. Existing bank files can also be copied into a
new child of `banks/`, followed by **Reload workspace**. A bank copied this way
must have an empty saved-test library; legacy bundled tests are not silently
discarded or moved into a shared folder.

Use **All workspace banks** in the Build Test question selector. The separate
cross-bank search dropdown in the Question Bank view has been removed; a new
bank-organization design is deferred. Class filtering spans all those
banks: two banks with the same Pre-Calculus 40S class ID both contribute questions.
Units and sections with the same IDs are combined. Identical display names with
different class IDs remain distinct; use the same class tag when combining banks.

Search results identify the source bank. Bank/question pairs get separate stable
IDs in the combined catalog, so duplicate original IDs do not collide. Image
copies are namespaced too. To edit an original question, switch to its source
bank in the header; aggregated results are read-only. Use **Add to test** to
build a mixed-bank test without moving or editing the originals.

## Tests and gradebook are independent

Saved tests freeze their selected question and narrative content and retain
their own required images. Later edits to a source bank do not change a saved
test. Class folders can be copied into another root's `tests/` without their source
banks or gradebook. Gradebook assessments also keep their own question/point
snapshots. Switching banks while using a workspace does not replace the shared
test library or gradebook.

An old saved test that only has question IDs needs its original questions
available when first converted to a workspace snapshot. Missing questions cause
an explicit error rather than silently producing an incomplete test.

The current implementation does not merge old bank-scoped gradebooks or test
libraries automatically. Their browser snapshots are retained. Back up valuable
browser data before connecting an existing workspace: the confirmation explains
which active copies will be replaced. Missing `tests/` or `gradebook/` data in a
loaded workspace starts empty, never with another workspace's private records.

## Sharing and safety

### Loading and file changes

On ordinary startup, the app opens the cached browser workspace and checks the
folder manifests in the background. A small status bar at the bottom reports
progress. You can browse, edit questions, and work on tests during the check;
those changes are saved in the browser and reach the folder once its baseline
is verified. Bank switching waits until the check finishes. **Stop checking**
keeps the browser copy usable and pauses folder saving until you resume.

The cross-bank search index and required saved-test images are cached in
IndexedDB. An unchanged workspace does not reread question files, recalculate
all catalog IDs, or rewrite already available image assets on every launch.
If the cache is absent, the index is rebuilt in the background from the stored
browser bank copies. Inactive bank snapshots also live in IndexedDB, avoiding
the small localStorage quota across many banks.

New banks can be registered in the background. Changes to existing bank, test,
or gradebook folders are held for review; they never replace work while you are
editing. **Review changes** lists the affected folders. **Check again** retries
without replacing browser data. **Reload workspace** explicitly adopts folder
contents and replaces local bank/test/gradebook changes, so export any local work
you want to retain first. Browser-only Editor drafts remain local.

Choosing a different workspace or explicitly reloading folder contents still
uses the blocking progress screen while browser data is replaced. Ordinary
startup and autosaves do not cover the app.

Edits made in TestGen autosave roughly every 2.5 seconds while permission is
available. Adding or changing files in Explorer/Drive does **not** automatically
refresh or merge the open app. Wait until copying/sync is finished, then use the
folder button → **Reload workspace**. Restarting the app also rescans the root;
new banks are registered in the bank selector as well as cross-bank search.
If existing folder content and browser content disagree, autosave pauses and a
visible warning offers **Review workspace**. Explicit reload replaces the browser
copy (including unsaved changes); disconnect instead to preserve it for recovery.

Missing or invalid files from a partial sync stop loading with an error rather
than silently skipping questions. The loading overlay clears so you can review
the issue and retry. There is still no live directory watcher, automatic conflict
merge, or simultaneous-editing lock.

TestGen writes files; it does not change Google Drive or other sharing
permissions. Verify access in your sync service. Keep the parent root private
and share only the intended children. Do not assume putting `gradebook/` inside
an already-shared root makes it private. Tests include answer/solution content
as well as questions; share them with appropriate recipients.

Autosave runs while the app is open and permission is available. A save checks
previous file contents before overwriting managed data. If external changes or
browser/folder disagreements are detected, autosave pauses. Reload to accept
folder contents, or disconnect to retain the browser copy for recovery. There
is no automatic conflict merge or collaborative locking; avoid simultaneous
editing of the same files. An interrupted multi-file save may need recovery
from the browser copy or your sync service's history.

Untracked files are not deleted. Deleted tests get a `deleted.json` tombstone
and are skipped on import; their question files remain recoverable until you
deliberately remove the archived test directory. Disconnecting keeps both folder
files and browser data. Workspace-wide tests/gradebook stay independent in the
browser after disconnect, rather than reverting to old per-bank snapshots.

The original single-bank **Choose folder** workflow remains available when no
workspace is connected. It is mutually exclusive with the new root connection.
No existing folder is automatically migrated or overwritten.
