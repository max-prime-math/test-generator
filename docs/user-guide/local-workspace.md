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
      test-id/
        test.json    # the test: settings + frozen questions and narratives
        images/      # its images, named by content (never changed once written)
    calculus/
      another-test-id/
    _unclassified/   # tests without a class
  gradebook/
    records/
      settings.json          # settings and the order of sections
      students.json          # every student
      sections/<section>/
        section.json         # the section and its roster
        assessments/<id>.json  # one assessment and all of its scores
      superseded/            # versions replaced by a newer edit, kept for recovery
    gradebook.json  # the previous single-file Gradebook, kept as it was; no longer written
```

Each bank and test has its own manifest. The root has no shared data manifest or
cross-folder asset dependencies. If a workspace converted from the older
single-bank layout still has a bank manifest and bank data at the root, TestGen
ignores those root-level legacy files once a `banks/` directory exists; it does
not delete them. The Gradebook is described in [Gradebook in the folder](#gradebook-in-the-folder).
The empty `tests/index.json` inside a bank is retained for bank-format
compatibility; it contains no saved-test content.

## Working with many banks

The Build question picker shows 100 matches per page. Use Previous/Next
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
under their own workspace's `tests/`, keeping the same class-ID folder name; the
tests appear on their own. All required question snapshots and images travel
inside the test folders. Their banks and gradebook are not needed or included.
Copying a folder is a one-time transfer, not live synchronization by itself.

Windows Google Drive shortcuts are not the same as actual directories. The
class-folder layout is implemented and tested with real browser directory
handles; a live Drive-for-Windows shortcut setup has not been verified. There is
not yet a separate folder picker to redirect an individual class to a shared
folder elsewhere on disk. Do not assume a `.lnk` file provides that connection.

Test folders written by earlier versions (a `manifest.json` with `questions/`,
`tests/`, and other files, including the older flat `tests/<test-id>/` layout)
remain readable. TestGen writes `test.json` beside those files and leaves them in
place; it never writes them again. Class changes write the test into the new
class's folder and mark the old location with a `deleted.json` marker.
Old files remain recoverable and may remain visible to people who had access to
the old folder; moving a test does **not** revoke their access to prior copies.
Moving back to a previously used class reactivates that known archived location.
Duplicate active IDs or a class directory that disagrees with the test's class
are reported as errors rather than silently merged. Keep a backup before migrating.

## Multiple banks and searching

An existing workspace registers the banks found in `banks/`. A new workspace
starts with the active browser bank, not every unrelated browser bank. Create or
switch to another bank with the bank switcher in the Bank view, then use **Add active bank to
workspace** in the folder panel. Existing bank files can also be copied into a
new child of `banks/`, followed by **Reload workspace**. A bank copied this way
must have an empty saved-test library; legacy bundled tests are not silently
discarded or moved into a shared folder.

To remove a bank, delete its folder under `banks/` and choose **Reload
workspace**; it leaves the bank switcher. Renaming a bank with **✎** beside the
bank switcher updates its `bank-name.json`, and **Reload workspace** takes each
bank's name from its `bank-name.json`.

Every browser starts with a bank named **Local Bank**, saved in the workspace as
`banks/default`. While it has no questions, narratives or classes and the
workspace has other banks, it is left out of the bank switcher, the Build bank menu
and the Editor's **Save to** menu. It shows again once it holds something, and the switcher always
lists it while it is the active bank.

Switching banks keeps every workspace bank's pictures loaded, so a switch only
adds pictures the bank has never had loaded. The first visit to a large bank can
take a second or so; later switches are quick. A bank you leave without changes
is not saved to the folder again.

Use **All workspace banks** in the Build question picker. The separate
cross-bank search dropdown in the Question Bank view has been removed; a new
bank-organization design is deferred. Class filtering spans all those
banks: two banks with the same Pre-Calculus 40S class ID both contribute questions.
Units and sections with the same IDs are combined. Identical display names with
different class IDs remain distinct; use the same class tag when combining banks.

Search results identify the source bank. Bank/question pairs get separate stable
IDs in the combined catalog, so duplicate original IDs do not collide. Image
copies are namespaced too. To edit an original question, switch to its source
bank in the Bank view; aggregated results are read-only. Use **Add to test** to
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
which active copies will be replaced. Missing `tests/` data in a loaded workspace
starts empty. Switching to a different workspace shows that workspace's Gradebook
and never copies another workspace's students into it.

## Sharing and safety

### Loading and file changes

On ordinary startup, the app opens the cached browser workspace and checks the
folder in the background. A small status bar at the bottom reports progress. You
can browse, edit questions, and work on tests during the check. **Stop checking**
keeps the browser copy usable and pauses folder syncing until you resume.

The cross-bank search index and required saved-test images are cached in
IndexedDB. An unchanged workspace does not reread question files, recalculate
all catalog IDs, or rewrite already available image assets on every launch.
If the cache is absent, the index is rebuilt in the background from the stored
browser bank copies. Inactive bank snapshots also live in IndexedDB, avoiding
the small localStorage quota across many banks.

### Banks in the folder

Banks keep themselves in step with `banks/` on their own, like saved tests and
the Gradebook, and need no review or reload:

- Each question and narrative is its own file, so edits merge question by
  question. A bank's `questions/index.json`, `narratives/index.json` and
  `manifest.json` are rebuilt from its questions after every change, so the folder
  always stays readable; their conflict copies from a sync tool do not matter.
- Changes are written within a few seconds, writing only the files that changed.
  The app checks each bank's manifest every few seconds while open, and in turn
  checks every file of one bank, catching files that arrive before their manifest.
  Changes made on another computer appear on their own, in the open bank and in
  the others; a bank created there and added to the workspace appears here too.
- If the same question was edited on two computers before the folder caught up,
  the newer edit is kept on both and **Changed on both computers** (in the
  workspace panel, and noted in the status bar) offers the other.
- A question or narrative is removed from the folder only when you delete it in
  the app; the bank's `deleted.json` records which version was deleted, so an
  edit made elsewhere still wins. A missing or half-synced file, or cleared
  browser storage, removes nothing. Removing more than half of a bank's questions
  at once waits for confirmation: **Remove them from the folder** or **Keep them**.
- **Check folder now** checks every bank in full immediately. Banks whose folders
  were removed leave the bank menu; their copies stay in this browser's storage.

Choosing a different existing workspace takes its banks as they are (each bank's
previous copy in this browser is kept as a backup) and reopens the app. The first
time a browser connects after this version, its banks and the folder's are
combined: the newer version of each question is kept, and nothing is removed.

### Saved tests in the folder

Saved tests keep themselves in step with `tests/` on their own, separately from
banks, and need no review or reload:

- Each saved test is one file, `test.json`, written about a second after a change.
  One file per test means a clash between two computers is always between two
  complete versions of the test, never a mix of files from each.
- While the app is open it checks the folder every few seconds and whenever you
  return to the tab. A test changed on another computer updates here on its own,
  including the one open in Build, unless you have unsaved edits to it here.
- If the same test was changed on two computers before the folder caught up, the
  newer version keeps the test and the other is kept as a separate test named
  "… (other version)", on both computers. A test you are editing here always keeps
  its place. Sync tools' conflict copies (such as `test.json.conflict1`) are
  handled the same way, once, and recorded in the folder's `merged.json`.
- Tests are removed only when you delete them in the app (`deleted.json`). An edit
  on the other computer wins over a deletion. A missing folder or cleared browser
  storage removes nothing; the browser refills from the folder.
- The first time a browser connects, its tests and the folder's are combined. A
  test that differs between the two is kept in both versions, the newer under its
  own name, so nothing edited on either side is lost.

### Gradebook in the folder

The Gradebook keeps itself in step with `gradebook/records/` on its own, separately
from banks and tests, and needs no review or reload:

- Every change is written to the folder about a second after you make it, to the
  small file it belongs to. Entering marks for different assessments touches
  different files.
- While the Gradebook is open, it checks the folder every few seconds and whenever
  you return to the tab, so changes made on another computer appear on their own.
  The status line at the top of the Gradebook's left pane shows when it last checked.
- Each student, roster entry, assessment, and score merges on its own. If the same
  record was changed on two computers before the folder caught up, the newer edit is
  kept, and **Changed on both computers** offers the other one in case it was right.
  Sync tools' conflict copies (such as `students.json.conflict1`) are merged the same way.
- Records are removed only when you delete them in the app. A missing or partly
  synced file, or cleared browser storage, never removes anything; the browser
  refills from the folder.
- Versions replaced by a newer edit are kept in `records/superseded/`.

The first time a browser connects, its Gradebook and the folder's (including the old
`gradebook.json`) are combined: nothing in either is dropped, and the newer version
of each record is kept. `gradebook.json` is left exactly as it was.

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
