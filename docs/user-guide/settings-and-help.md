---
title: Settings, Help and Shortcuts
sidebar_position: 10
---

Open **Settings** with the gear button in the header. Most settings are stored in this browser; App Lock also keeps its password verifier in the connected local workspace.

## Theme

Choose the app's color theme.

## Test Builder Defaults

**New-test defaults** for the [Test Builder](./test-builder.md): default instructions, answer space, MCQs first, point values, answer key and full MCQ solutions, font size, paper, margin, and graph defaults (grid, grid color, axis and curve weight, asymptote color, width, height, and tick steps).

**Save Defaults** applies them when you start a new unsaved test. Existing drafts and saved tests keep their own settings. **Reset Defaults** restores the app's defaults.

Under **Workspace**, turn **Open tests in tabs** off to use one test editor at a time. Turning it on keeps several saved tests or independent drafts open and restores the open tab set after a reload.

## GitHub Credentials and Remotes

Shown when **Git and GitHub sync (advanced)** is on (see **More** below).

- **Token**: a GitHub token. Use an expiring, fine-grained token scoped to one repository with Contents read/write permission. It's kept for this session only unless you check **Persist token in browser storage**.
- **Repository**: choose an existing repository or create one from the current bank (**New repo...**), with its branch.
- **Repository visibility**: whether the repository is private and narrowly shared. Unless it's marked private, settings show a reminder that pushed content may include proprietary curriculum, unpublished assessments or student-identifying material.
- **Configured Remotes**: choose which remote the Sync panel uses for fetch, pull and push.
- **Clone Existing Repository**: replace the current browser bank with a repository's contents, after the remote snapshot is validated.

**Google Drive** opens Drive setup for backups. See [Import and Back Up Questions](./import-export-sync.md#google-drive-backup).

## More

- **App Lock**: after connecting a local workspace, turn on **Password-protect the app**, choose a password, and choose an inactivity timeout from 1 minute to 2 hours. The toggle and timeout are local to this browser; another browser opening the workspace remains unlocked until its own toggle is enabled. Turning the toggle off does not delete the password. The app starts locked after a reload when its local toggle is on, and **Lock Now** or the lock button in the header locks it immediately. Only a salted password verifier is stored in the inconspicuous `.workspace-view` file at the workspace root; banks, tests, and Gradebook records remain unencrypted. If the password is forgotten, delete `.workspace-view` and reopen the app to remove the configured password and disable the local lock.
- **Back up everything in this browser**: download one file with every saved test, draft, Gradebook record, bank, and image in this browser, exactly as stored. Nothing is changed, and GitHub sign-in tokens are left out. Keep it somewhere outside the browser. **Restore…** loads such a file back, after asking and after downloading a backup of this browser first.
- **Question generator (experimental)**: show the Generate tab for making practice problems from Manitoba curricular outcomes. See [Generate Practice Problems](./generate.md).
- **Gradebook (experimental)**: show the Gradebook tab and the saved-test Gradebook actions.
- **Git and GitHub sync (advanced)**: show the **Sync** button, GitHub credentials, and Git and Google Drive remotes. Turning it off hides them; saved tokens, remotes and repository history stay in this browser.
- **Performance diagnostics**: record timings and counts in this browser only (no question text, student data or images). Off by default. **Copy report** and **Download report** share the results when reporting a slowdown.
- **Help** and **Tutorial** (see below).

## Help and Tutorial

The **?** button in the header opens Help, with this documentation. **Open in New Tab** opens it in its own tab.

**Restart Tutorial** (in Help or **Settings → More**) runs the guided walkthrough again. The tutorial loads AP Calculus BC sample questions to demonstrate the Test Builder; at the end, choose **Keep sample questions** or **Remove them**.

## Keyboard Shortcuts

| Where | Key | Action |
|---|---|---|
| Bank | `j` / `↓`, `k` / `↑` | Next / previous question |
| Bank | `Esc` | Close the preview and clear the selection |
| Bank | Ctrl/Cmd+A | Select every visible question |
| Bank | Shift-click, Ctrl/Cmd-click | Select a range, toggle one question |
| Editor | Ctrl/Cmd+Enter | Save & New |
| Editor | Ctrl/Cmd+S | Save |
| Build | Ctrl/Cmd+S | Save the test now |
| Build | Alt+T | Open a new blank test tab |
| Build | Alt+W | Close the current test tab |
| Build | Alt+Shift+T | Reopen the last closed test tab |
| Import review | `↓` / `↑` | Next / previous question |
| Import review | Space | Select or deselect the question |
| Import review | Delete / Backspace | Remove the question from the import |
| Import review | Ctrl/Cmd+A | Select all or none |
| Image editor | Ctrl/Cmd+Z; Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z | Undo; redo |
| Image editor | Enter | Apply the crop |
| Image editor | `Esc` | Cancel the crop, or close the editor |
| Image editor | Ctrl/Cmd+scroll | Zoom |

The Gradebook score grid has its own keys; see [Gradebook](./gradebook.md#score-entry).
