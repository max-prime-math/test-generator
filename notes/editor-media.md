---
title: Pictures and Math Graph in Editor
---

## Pictures in a question

Question and Solution now have a **Pictures in this text** section. It starts
collapsed. Opening it shows compact thumbnail cards with:

- **Replace picture**, which picks another uploaded image or uploads a new one.
  Only that occurrence changes; other questions using the same image are untouched.
- **Remove from text**, which removes the image call without deleting the file.
- **Size & alignment**, with width as a percentage and left/center/right placement.
- **Edit graph** on images created by the integrated Math Graph tool.

Choices, inline narratives and recovered graph source use the same picture cards.
Ordinary `#image(...)` and `#align(center, image(...))` calls are recognized. Custom
Typst calls retain their arguments when replacing the image; complex layout
changes remain editable in the source. Cards show literal image calls, rather
than evaluating arbitrary Typst variables or macros.

## Image library

Open **Image library** from Editor or Bank. The library provides thumbnail search,
upload, rename, replacement previews and deletion.

Renaming updates image references in active-bank questions, Editor drafts,
narratives, saved-test snapshots/configs, the current test draft and import staging.
It uses the existing bank/narrative/test APIs. The destination image is written
first, and the old image is removed only after reference updates finish.

**Replace shared file** replaces the selected asset everywhere it is used. Its
preview and usage counts make that scope explicit. To vary just one question,
use **Replace picture** on the occurrence card instead.

Used files cannot be deleted. Remove/replace their references and save the
question first; then delete unused files from the library. Editing and removing
an image from question source also updates its saved `images` declarations, so
old graph versions can become unused. Assets in other bank workspaces are separate.

## Math Graph

**Add graph** opens an integrated browser version of the Math Graph 0.7.0 editor.
It supports the original explicit functions, points, lines, segments, domains,
endpoint styles, arrows, π ticks, dragging, snapping, panning and zooming. An empty
graph is the blank worksheet grid, replacing the old blank-graph-only workflow.

**Open .tkz** reads diagrams produced by Math Graph (including older `.tikz`
extensions); arbitrary TikZ and manually changed generated regions are not
silently imported. **Download .tkz** preserves interoperability with the original
LaTeX tool. Undo/Redo controls apply to graph changes; Ctrl/Cmd+S uses the graph.
Invalid graph inputs are retained as local dialog drafts and can be corrected on
reopening the same question draft.

**Use graph** stores a vector SVG through the existing image store and inserts a
normal Typst image call. The graph's validated model is embedded in SVG metadata,
so it remains visually editable after reload and after normal repository/folder
image serialization. Each occurrence edit creates a new asset; existing shared
images and frozen tests are not overwritten. Save the question normally to
include it in the authoritative bank and its folder/sync persistence.

The graph's sampling, discontinuity splitting, marks and arrows are from the
original tool. Canvas preview and SVG export call the same drawing routine.
Labels retain its browser typography and limited math-label behavior; this is
not a full LaTeX renderer or a general image/diagram annotation editor.

## Implementation and checks

The original `/home/max/dev/math-graph` checkout is unchanged. Its MIT-licensed
browser modules are vendored with provenance under `src/lib/math-graph/vendor`;
Test Generator does not require that sibling checkout to build. `math-graph.html`
is a second Vite entry point, used in an isolated editor iframe. The host adapter
handles graph drafts, undo/redo, import/export and origin/source-checked messages.

The image library and question media controls are in `src/components/media`;
reference mutations are in `src/lib/editor/image-references.ts` and
`image-library.ts`. Saved question types and sync formats do not gain new fields.

Run `npm run test:media` and `npm run test:media:browser` for graph SVG/model/TKZ/
repository round-trips, picture placement, reference updates, graph creation and
reopening, local graph draft recovery, replacement, removal and protected deletion.
The existing Editor and workspace browser regressions cover the persistence paths.
