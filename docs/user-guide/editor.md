---
title: Editor
sidebar_position: 3
---

The **Editor** is where questions are written, imported and changed. The **Bank** is for finding, organizing and previewing them. Open the Editor from its tab, with **Edit** or **Duplicate** on a bank question, or with **Edit** on a question in Build.

## Layout

- **Questions** on the left: search, drafts, the Recycle bin, and the bank.
- **Write** in the middle: the question form.
- **Preview** on the right: a live render of the question and its solution.

On small screens these become separate panels.

The toolbar has **+ New Question**, **Bulk Entry / Import**, **Image library**, **Duplicate**, **Delete draft** (or **Close** for an unchanged bank question), **Save**, and **Save & New**.

## Writing a Question

| Field | Notes |
|---|---|
| Question | The question in [Typst](./typst-authoring.md). **▦ Add graph** and **▣ Add picture** insert graphs and pictures. |
| Question type | **Written response** or **Multiple choice**. |
| Choices | For multiple choice: fill the choices and select the correct one. **+ Add choice** adds up to five (A–E). Reordering or removing choices keeps the correct answer with its choice. |
| Solution | Optional written solution, also in Typst. |
| Points | Zero or more; decimals such as `0.5` are allowed. |
| Tags | Comma-separated, such as `calculus, derivatives`. |
| Curriculum placement | Class, unit and section. **+ Unit** and **+ Section** create new ones. |
| Shared narrative / instructions | Text shared by several questions, such as a passage or a set of instructions. Choose one, or **New shared narrative** to create one. A question imported with its own narrative shows it as **Inline narrative**. |
| Recovered graph source | Graph code recovered during import, when present. |

The preview updates as you type. If the source has an error, the preview reports it and keeps the last good render; you can still save.

**Save** writes the question to the bank and leaves it open. **Save & New** saves and starts a new question with the defaults below.

### New-Question Defaults

**New-question defaults** sets the class, unit, section, points and tags for new questions. Use it when writing a run of questions for the same section. It doesn't change existing questions.

### Keyboard Shortcuts

| Key | Action |
|---|---|
| Ctrl/Cmd+Enter | Save & New |
| Ctrl/Cmd+S | Save |

## Drafts and the Recycle Bin

Opening a bank question doesn't create a draft. It becomes a draft only after you change something, and **Save** writes it back to the bank without leaving a draft behind. New questions and imported questions are drafts until saved. Drafts save automatically in this browser and are listed under **Drafts**.

Drafts are kept only in this browser. They aren't included in folder, Git or Drive backups, so save them to the bank to keep them.

To delete a draft, use **Delete draft** in the toolbar or the delete icon on its row. Deleted drafts move to the **Recycle bin** below the draft list, where you can **Restore** them or **Delete forever**. Drafts in the Recycle bin are removed automatically after 30 days. Deleting a draft never changes the question saved in the bank.

If the bank question behind a draft is deleted or changed elsewhere (for example by sync), saving reports a conflict instead of overwriting it. **Duplicate** the draft to keep your version as a new question, or discard it and reopen the current question.

## Working With Many Drafts

Check drafts in the navigator (or **Select all**) to work on them together:

- **Shared values** sets points or tags on all of them (**Batch points**, **Batch tags**, then **Apply to drafts**).
- **Save selected** saves them to the bank. Drafts with problems, such as a missing correct choice, stay drafts and say what's wrong.
- **Delete selected** moves them to the Recycle bin.
- **Add to…** adds them to a test. See [Adding Questions to a Test](./question-bank.md#adding-questions-to-a-test).

Imported questions arrive as drafts this way: **Bulk Entry / Import** → review → **Stage in Editor**. See [Import and Back Up Questions](./import-export-sync.md).

## Pictures and Graphs

### Adding a Picture

**▣ Add picture** opens the bank's pictures. Search and choose one, or upload a new PNG, JPEG, SVG, WebP or GIF file, then set its width and insert it.

### Pictures in This Text

Below each text field, **Pictures in this text** lists the pictures that field uses. Each card has:

- **Replace picture**: pick another picture or upload one. Only this use changes; other questions using the same file are untouched.
- **Remove from text**: remove the picture from this text. The file stays in the library.
- **Size & alignment**: width as a percentage, and left, center or right placement.
- **Edit graph**: for graphs made with Math Graph, reopen the graph editor.

### Math Graph

**▦ Add graph** opens the Math Graph editor. It draws functions, points, lines and segments, with domains, open and closed endpoints, arrows, π ticks, dragging, snapping, panning and zooming. A new graph starts as a blank worksheet grid.

- **Open .tkz** reads a diagram saved by the Math Graph LaTeX tool. **Download .tkz** saves one.
- Undo and Redo apply to graph changes.
- **Use graph** inserts the graph as a picture. The graph stays editable: **Edit graph** on its card reopens it, even after reloading or syncing. Each edit saves a new picture, so other questions and saved tests that use the old one don't change.

Graphs that change with algorithm values are described in [Algorithmic Questions](./algorithmic-questions.md#graph-questions).

### Image Library

**Image library** (in Bank and Editor) lists the bank's pictures with a search box. From there you can:

- **Upload images**.
- Select a picture, then:
  - **Rename and update references**: every question, draft, narrative and saved test that uses it is updated.
  - **Replace shared file**: replace it everywhere it's used, with a preview and a count of its uses. To change one question only, use **Replace picture** on that question's card instead.
  - **Delete unused file**: a picture still in use can't be deleted; remove or replace it in the questions, drafts or tests that use it first.
  - **View and edit** it in the image editor.

Each bank has its own pictures.

### Image Editor

The image editor has tools to **Pan**, **Brush**, **Eraser**, **Line**, **Rectangle**, **Fill** and **Crop**, with brush size, colour and fill tolerance settings. It can also rotate 90° left or right, flip horizontally, and **Extend…** the canvas by a margin on each side.

- Zoom with **−**, **+**, **Fit** and actual size, or Ctrl/Cmd+scroll.
- Undo with Ctrl/Cmd+Z, and redo with Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z.
- To crop, drag a rectangle with **Crop**, then press Enter or **Apply**. Esc cancels a crop, or closes the editor.
- **Save** replaces the picture; **Save as copy** keeps the original and saves a new picture.
- SVG pictures (including graphs) can't be painted directly. **Edit as PNG copy** converts a copy to PNG for editing, and the SVG stays unchanged.
