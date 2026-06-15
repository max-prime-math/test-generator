# Test Generator

**[https://max-prime-math.github.io/test-generator/](https://max-prime-math.github.io/test-generator/)**

A lightweight, browser-based math test generator. Everything runs locally — no account, no server, no uploads. Questions are stored in your browser and the PDF is compiled on your machine using the Typst typesetting engine via WebAssembly.

## Shared Interchange Format

This app is the primary human-facing consumer of the workspace's shared question package format: the **Portable Question Package (PQP)**.

- Canonical spec: [`../PORTABLE_QUESTION_PACKAGE.md`](../PORTABLE_QUESTION_PACKAGE.md)
- Machine-readable schema: [`../shared-question-package.schema.json`](../shared-question-package.schema.json)

PQP is intended to become the common import/export format shared by `bnk-decoder`, `ocr-frq`, `ocr-mcq`, and `test-generator`. It is richer than the app's current `DraftQuestion` import shape and includes:

- versioned package metadata
- rich text content with explicit `latex` / `typst` / `plain` format tags
- curriculum hierarchy definitions
- first-class asset records
- diagnostics and provenance
- forward-compatible `extensions`

`test-generator` should continue to support manual Typst authoring and best-effort imports, but PQP is the target format for reliable cross-tool interchange.

---

## Quick Start

1. Go to the **Question Bank** tab and add questions (or bulk-import from text/LaTeX).
2. Switch to the **Build Test** tab, fill in the test settings, and select questions.
3. Click the preview pane — the first compile loads the Typst engine (~28 MB, cached after that).
4. Download the `.typ` source or print the PDF directly from the preview pane.

## Settings

Click the gear icon in the top-right header to open Settings.

![Settings](https://raw.githubusercontent.com/max-prime-math/test-generator/main/screenshots/settings.png)

Settings collects preferences and setup work that should not crowd the day-to-day editing screens:

- **GitHub Credentials** — Connect or clear a token, choose the token owner, load repositories and branches, create a new remote repo from the current browser bank, or clone/import an existing repo. Clone/import requires an explicit acknowledgement because it replaces the current local browser bank after validating the remote snapshot.
- **Theme** — Choose any built-in theme. The standalone theme button was removed from the header so theme selection lives with other preferences.
- **Test Builder** — Set defaults for new unsaved tests, including instructions, answer space, page formatting, answer key behavior, MCQ ordering, and graph defaults. Existing drafts and saved tests keep their own settings.
- **More** — Help, tutorial restart, and space for future app-level settings.

## Multiple Banks

Use the **Bank** selector in the top header to switch between local banks, or click **+** to create a new bank. Switching banks saves the current bank snapshot, restores the selected bank, and reloads the app into that bank.

Each bank has its own question list, custom classes, saved tests, current draft, uploaded images, browser git repository id, configured GitHub remotes, GitHub token keys, and Google Drive folder selection. This means one bank can be connected to a GitHub repository and a Google Drive folder without sharing those bank connections with another bank.

## Sync Status

The sync icon opens the Git and remote operations panel. This panel is meant for the normal workflow after setup: refresh the browser git working tree from current app data, commit, choose an already configured remote, fetch, fast-forward pull, and push.

GitHub credential, owner, repository, branch, new-repo, and clone/import setup lives in **Settings → GitHub Credentials** for the active bank. Google Drive app setup can be shared across banks, while the chosen Drive folder and Drive sync metadata are stored per bank. The Drive panel can upload the active bank's class-backed questions and saved tests to that folder, refresh the remote class index, and restore saved tests. Repo-backed sync currently uses GitHub.

GitHub remote support is implemented in the browser git service for the local Test Generator repo. It uses the GitHub Git Database REST API at `https://api.github.com` for blobs, trees, commits, and refs; the GitHub Contents API is not the sync path, and user tokens are never sent through CORS proxies or embedded in remote URLs. GitHub tokens are stored separately from repo data, default to session-only storage, and persistent token storage must be an explicit opt-in. Use a fine-grained, expiring token scoped to the selected repository with Contents read/write permission. Classic PATs, broad account/org scopes, and Administration permission are not required for this phase.

After a token is connected in Settings, the app loads the token owner, available organizations, repositories, and branches. Existing repositories can be cloned into the active browser bank after an explicit warning because that bank is replaced by the remote snapshot. Settings can also create a new GitHub repository, initialize it, commit the current browser bank into it, and push without visiting github.com first. Pull is fast-forward only and requires a clean working tree; diverged histories stop without modifying local refs or app data.

Configure Google Drive values at build time if you do not want users to enter them manually:

```bash
VITE_GOOGLE_CLIENT_ID=1234567890-abc123def456.apps.googleusercontent.com \
VITE_GOOGLE_API_KEY=AIza... \
VITE_GOOGLE_CLOUD_PROJECT_NUMBER=123456789012 \
npm run dev
```

The Google Cloud project needs the Google Drive API and Google Picker API enabled, an OAuth client ID for a web application, a public Picker API key, and the app origin listed under authorized JavaScript origins.

---

## The Question Bank

### Layout

The bank view has three resizable panels: a curriculum sidebar on the left, the question list in the center, and a live preview panel on the right. Drag the divider handles to resize panels; click a divider to collapse or expand that panel.

![Question Bank](https://raw.githubusercontent.com/max-prime-math/test-generator/main/screenshots/question-bank.png)

### Curriculum Organization

Questions can be assigned to a **Class → Unit → Section** hierarchy. The sidebar on the left lets you browse and filter by unit or section. Units are listed in numeric order. Clicking a unit or section filters the question list, and **+ Add Question** pre-fills the curriculum fields from your current selection.

The app ships without any built-in curriculum classes. You can create custom classes during Bulk Import, or by assigning a question to a new class name in the editor.

Each class in the sidebar has a small **ⓘ** button (visible on hover) that opens a class info panel showing total question counts per unit and section. For custom classes, you can rename the class, any unit, or any section directly from this panel.

### Adding Questions

Click **+ Add Question** to open the editor. Each question has:

| Field | Description |
|---|---|
| **Curriculum** | Optional class / unit / section assignment. Cascading dropdowns. |
| **Body** | The question text, written in Typst markup. Math goes here. |
| **Choices** | Optional MCQ choices A–E. Enter at least two to activate MCQ mode. |
| **Correct answer** | For MCQs, a dropdown that selects the correct letter (A–E). |
| **Explanation / Solution** | Optional. For MCQs this is the written explanation; for FRQs it's the full solution. |
| **Points** | Numeric point value (decimals like `0.5` are fine). |
| **Tags** | Comma-separated labels, e.g. `limits, derivatives`. Used for filtering. |

![Question Editor](https://raw.githubusercontent.com/max-prime-math/test-generator/main/screenshots/editor.png)

### MCQ Questions

If you fill in two or more choices (A–E), the question is treated as multiple choice. Choices are laid out in a two-column grid in the PDF. Set the **Correct answer** dropdown to the correct letter to enable an answer key.

### Editing and Deleting

Click **Edit** or **Delete** on any question card. Deletions are permanent — export a JSON backup first if you're unsure.

### Algorithmic BNK Questions

Questions imported from ExamView BNK packages can include an `algorithmModel`. When a question has usable algorithm definitions, the bank card and preview panel show **Calculate values**.

- Click **Calculate values** on a question card to generate a new random seeded variant for that one question.
- Select a question and enter a numeric seed in the preview panel to reproduce a specific variant.
- Leave the seed blank and click **Random seed** to generate a new seed.
- The app stores `algorithmSeed`, increments `algorithmVariant`, updates question text/choices/answer/solution/parts where matching values are found, and materializes graph-model expressions where possible.

This is TestGen-side recalculation. It does not need to match ExamView's exact random generator, but it depends on the decoder preserving algorithm definitions, sample values, graph models, and diagnostics.

### Searching and Filtering

- The **search bar** performs a fuzzy search across question body, tags, solution, and answer simultaneously.
- **Class tabs** (shown when multiple classes exist) filter to a single class.
- **Type tabs** — **All Types / MCQ / FRQ / Graph** — filter by question type. The Graph tab shows questions tagged with `graph`.
- The **sidebar tree** lets you drill down to a specific unit or section.

### Question Preview

Click any question card to open a live Typst preview in the right panel. Use **j/k** or **↑/↓** arrow keys to navigate between questions without leaving the keyboard. Press **Escape** to close the preview.

---

## Writing Questions with Typst

Question bodies are **Typst markup**. You can write plain prose alongside math expressions.

### Inline Math

Wrap math in single `$` signs with no surrounding spaces:

```
Find the derivative of $f(x) = x^3 - 2x + 1$.
```

### Display Math

Wrap math in `$` signs **with a space** inside on each end:

```
Evaluate $ integral_0^1 x^2 dif x $.
```

### Common Typst Math Syntax

| What you want | Typst syntax | Renders as |
|---|---|---|
| Fraction | `frac(a, b)` | a/b |
| Superscript | `x^2`, `e^(x+1)` | x², e^(x+1) |
| Subscript | `x_n`, `a_(i j)` | xₙ, aᵢⱼ |
| Square root | `sqrt(x)`, `root(3, x)` | √x, ∛x |
| Limit | `lim_(x -> 0)` | lim x→0 |
| Integral | `integral_a^b f(x) dif x` | ∫ₐᵇ f(x) dx |
| Sum | `sum_(n=1)^infinity` | Σ from n=1 to ∞ |
| Infinity | `infinity` | ∞ |
| Greek letters | `alpha`, `beta`, `theta`, `pi`, `Delta` | α, β, θ, π, Δ |
| Plus/minus | `plus.minus` | ± |
| Implies | `=>` | ⇒ |
| Absolute value | `abs(x)` | \|x\| |
| Partial | `partial` | ∂ |
| Prime | `f'(x)` | f′(x) |
| Bold text | `*bold*` | **bold** |
| Italic text | `_italic_` | *italic* |

### Multi-part Questions

Use `#linebreak()` to add sub-parts within a single question when you are writing Typst directly:

```
Let $f(x) = x^2 e^x$. #linebreak()
*(a)* Find $f'(x)$. #linebreak()
*(b)* Find all critical points of $f$.
```

If you paste LaTeX from an exam class, the importer now turns `\begin{parts}`, `\begin{subparts}`, and `\begin{subsubparts}` into proper Typst numbered lists automatically. The same conversion applies to solution blocks, and `\\` line breaks are preserved as Typst `#linebreak()` calls during import.

---

## Building a Test

The Build Test view has three panels: settings on the left, PDF preview in the center, and the question picker on the right. All panels are resizable — drag the dividers to adjust, or click a divider to hide/show that panel.

![Build Test](https://raw.githubusercontent.com/max-prime-math/test-generator/main/screenshots/build-test.png)

When you switch to Build Test, the title and class filter default to the last class you viewed or browsed in the Question Bank.

### Saving Tests

The Build Test tab auto-saves your current test configuration as a **draft** — if you refresh the page, your work is restored. You can also explicitly save tests with names for reuse later.

**Draft auto-save:** Your test config is saved to the browser automatically as you work. The toolbar displays a dot indicator if you have unsaved changes since the last named save.

**Named saves:** Click **Save As…** to save the current test with a name. Tests are organized by class (the curriculum class you're building from) and appear in the **Saved Tests** panel on the left. You can:
- Click a saved test name to load it
- Rename a test (pencil icon)
- Delete a test (✕ icon)

**Load a saved test:** Open the Saved Tests panel (☰ icon in the toolbar) and click any test name to load it. The toolbar displays the test name while loaded.

### Test Settings

| Setting | Description |
|---|---|
| **Title** | Appears centered at the top. Tracks the selected class automatically. |
| **Test name** | Optional second line below the title (e.g. "Test 2"). |
| **Instructions** | Shown below the name line in italics. |
| **Include date line** | Toggles a date line on the test. When enabled, you can edit the date text (pre-filled with today's date). |

### Output

| Setting | Description |
|---|---|
| **Answer space** | Blank vertical space (cm) left below each question for student work. |
| **MCQs first** | When checked, all multiple-choice questions appear before free-response questions in the PDF. |
| **Show point values** | Toggles `(n pts)` labels next to each question number. |
| **Bold point values** | Renders point labels in bold (only shown when Show point values is on). |

### Answer Key

| Setting | Description |
|---|---|
| **Include answer key** | Appends a separate answer key section to the PDF. MC answers appear in a compact lettered grid; written solutions are shown as a numbered list. |
| **Include full MCQ solutions** | When the answer key is on, also includes the written solution/explanation for each MCQ in the verbose solutions section. |

### Formatting

| Setting | Description |
|---|---|
| **Font size** | Body text size: 10, 11, or 12 pt. Title and subtitle scale proportionally. |
| **Paper** | US Letter or A4. |
| **Margin** | Page margin in inches, applied to all four sides (0.5–2 in). |
| **Edit preamble manually…** | Opens a raw Typst editor pre-filled with the auto-generated preamble. While active, all form controls are bypassed. Click **Reset** to return to the form. |

### Graph Defaults

Expand the **Graph Defaults** section to configure global defaults for any `simple-plot` graphs embedded in questions:

| Setting | Description |
|---|---|
| **Show grid** | Toggle grid lines on/off. |
| **Grid color** | Any Typst color name or hex value (default: `silver`). |
| **Axis weight** | Axis stroke width in px. |
| **Curve weight** | Function curve stroke width in px. |
| **Asymptote color** | Color for asymptote lines (default: `red`). |
| **Width / Height** | Default graph dimensions in cm. |
| **X tick step / Y tick step** | Interval between axis tick marks. |

### Selecting Questions

Questions from the bank appear in the picker on the right. Use the **class / unit / section / type** dropdowns to filter the list first, or use the **search** box for fuzzy matching. Check any question to add it to the test.

- **All** — adds every visible question to the test at once.
- **Random** — adds a random sample; set the count in the number field next to the button.

The **Selected** list at the top of the picker shows the current order. Drag the **⠿** handle to reorder questions; click **✕** to remove one.

Each row in the selected list has a small **cm** input on the right to override the global answer space for that question. The value turns blue when it differs from the global default.

For MCQ questions in the selected list:
- The **⟳** button shuffles that question's choice order.
- If choices have been shuffled, a **↻** button appears to reset them to the original order.
- **Shuffle MCQ** (shown in the footer when any MCQ is selected) shuffles all MCQ choices at once.

---

## Preview and Export

### PDF Preview

The preview pane compiles the current test using the Typst WebAssembly compiler and displays it inline. Compilation is debounced — it runs ~0.8 seconds after you stop making changes.

The **first compile** on a fresh page load triggers a one-time download of the Typst engine (~28 MB). This is cached by the browser; subsequent visits are instant.

### Show Source

Click **Show source** in the preview toolbar to see the raw Typst markup being compiled. Useful for debugging or copying the source to adjust manually.

### Download `.typ`

Click **Download .typ** to save the raw Typst source file. Open it in any Typst installation to compile locally, tweak the layout, or use it as a starting template.

---

## Importing and Exporting the Question Bank

### Export JSON

Click **Export JSON** to download `question-bank.json` — a plain JSON array safe to back up, version-control, or share with colleagues.

### Import PQP / JSON

Click **Import PQP / JSON** and select a `.json` file. Questions are **appended** to the existing bank. Supported inputs include:

- **Portable Question Package** files such as `chapter-01.pqp.json`
- OCR / pipeline draft exports such as `bulk_import.json`
- Plain JSON arrays of draft-style question objects

PQP is the preferred interchange format because it can carry richer source metadata, diagnostics, assets, and curriculum context while still importing cleanly into the existing review flow.

### Import BNK Via Workspace Bridge

Inside the shared workspace, `test-generator` can call the live sibling `bnk-decoder` repo and emit an importable JSON file without copying decoder logic into this app:

```bash
npm run import:bnk -- "../bnk-decoder/ignore/ExamView/Banks/Pre-Calculus 11/Chapter 01.bnk"
```

This writes a `*.test-generator-import.json` file in the current directory. The bridge imports `bnk-decoder` directly from the sibling repo, so decoder improvements automatically flow through the next time you run the command.

The generated JSON uses the app's `test-generator-question-bank` export shape: stored questions, decoder diagnostics, and embedded image bytes are bundled in one file. Import it with **Import PQP / JSON** from the bank view. This path preserves BNK algorithm models, graph models, point/ray graph objects, question diagnostics, and extracted bitmap assets.

Direct bank JSON import appends stored questions, imported custom classes, curriculum units/sections, and bundled images from the decoder export.

**Minimal import format:**

```json
[
  {
    "body": "Evaluate $lim_(x -> 0) frac(sin x, x)$.",
    "points": 5,
    "tags": ["calculus", "limits"],
    "solution": "The limit equals $1$."
  }
]
```

**With MCQ choices:**

```json
[
  {
    "body": "What is $frac(d, d x)[sin x]$?",
    "points": 2,
    "choices": { "A": "$cos x$", "B": "$-cos x$", "C": "$-sin x$", "D": "$tan x$" },
    "solution": "A",
    "tags": ["derivatives", "trig"]
  }
]
```

### Bulk Import (Plain Text / LaTeX / Typst / PQP / JSON)

![Bulk Import](https://raw.githubusercontent.com/max-prime-math/test-generator/main/screenshots/bulk-import.png)

Click **Bulk Import** to paste or drag in a block of questions as plain text or LaTeX. The importer:

- Auto-detects whether the input is LaTeX or plain Typst
- Accepts **Portable Question Package** files (`.pqp.json`) from sibling tools like `bnk-decoder`
- Accepts OCR pipeline exports like `bulk_import.json` in addition to pasted text
- Converts LaTeX math (`\frac`, `\int`, `\sum`, etc.) to Typst equivalents
- Preserves exam-class `parts` / `subparts` / `subsubparts` environments as nested Typst lists
- Converts LaTeX line breaks written as `\\` into Typst `#linebreak()` during import
- Splits the block into individual questions by numbered list, delimiter, or blank lines
- Recognizes MCQ answer choices (lettered A–E) and attaches them to the question
- Detects `\includegraphics{…}` references and prompts for the image files
- Lets you review, edit, and assign curriculum to each question before committing to the bank

During the review step you can assign each draft question to an existing class or create a new custom class on the spot. New classes, units, and sections created here are saved permanently and appear in the sidebar.

#### Importing Questions with Images

If any pasted LaTeX contains `\includegraphics[...]{name}`, the importer inserts a dedicated **Step 2 — Upload Images** screen between paste and review. It lists every referenced filename and lets you bulk-upload the corresponding files in one shot:

- **Drag & drop** multiple image files onto the drop zone, or click **Choose files…**
- Files are matched to LaTeX references by **basename** (case-insensitive), ignoring extension — `diagram1.png` satisfies `\includegraphics{diagram1}`
- Supported extensions: `.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`, `.gif`, `.pdf`
- `width` / `height` options on `\includegraphics` are translated to Typst `#image(…)` named args — `[width=0.5\textwidth]` becomes `width: 50%`
- Missing images don't block import — the review screen keeps a sidebar list where you can upload them later or remove the reference

Images are stored in the browser via **IndexedDB** (keyed by basename) rather than `localStorage`, so you can upload large/many images without hitting the 5 MB string quota. The Typst compiler mounts the bytes into its virtual filesystem at `/imgs/<name>.<ext>` at compile time — see *Limitations* below for a caveat about the downloaded `.typ` file.

**Limitations**

- Only `width` and `height` on `\includegraphics` are preserved. `angle`, `trim`, `clip`, `scale`, and `keepaspectratio` are dropped.
- `\includegraphics{subdir/foo}` collapses to basename `foo` — subdirectories are not modelled.
- Images are global by basename; two questions that both reference `diagram1` share the same stored file.
- Only the reference names are included in `Export JSON`, not the image bytes. Moving a bank to another browser requires re-uploading the images.
- A downloaded `.typ` file references `/imgs/<name>.<ext>` paths which exist only in this app's IndexedDB — the file will not compile standalone in a local Typst install without copying the images next to it.

---

## Interface

### Theme

Open **Settings → Theme** to switch between built-in themes. The setting is saved to `localStorage` and persists across sessions. By default the app follows your system preference.

---

## Data and Privacy

All data stays in your browser. The active bank still uses the legacy app keys such as `math-test-bank-v2`, `math-test-custom-classes-v1`, `tg-test-library-v1`, and `tg-test-draft-v1`; the bank switcher snapshots those keys into per-bank `tg-bank:*` records when you switch banks. Uploaded images are stored in an IndexedDB database named `test-generator`, with per-bank image snapshots alongside the active image store. Clearing your browser's site data will erase all local banks, custom classes, saved tests, images, Git remotes, and Google Drive folder selections. Export JSON backups periodically and keep the original image files around since they are not included in the JSON export.

---

## Technical Notes

- **Typst engine**: [`@myriaddreamin/typst.ts`](https://github.com/Myriad-Dreamin/typst.ts) + `@myriaddreamin/typst-ts-web-compiler`
- **Framework**: Svelte 5 + Vite + TypeScript
- **Styling**: Plain CSS with `prefers-color-scheme` support and a Settings-based theme picker
- **Persistence**: `localStorage` for bank snapshots, questions, custom classes, saved tests, app settings, per-bank sync config, and optional persisted GitHub tokens; IndexedDB for uploaded images and per-bank image snapshots
- **PDF display**: Typst WASM SVG renderer (inline DOM, no iframe)
- **Sync**: Browser git with GitHub remote support, fast-forward-only pull, explicit clone/import replacement, and Google Drive folder sync for class-backed questions and saved tests

---

## Roadmap

### Bug Fixes

- **Fix drag-and-drop reordering** — The drag handle for reordering questions in the selected list is not working reliably and needs to be fixed.

- **Answer-space button overlap** — The plus/minus buttons on the whitespace (answer space) selector get hidden behind the red ✕ button when a non-default value is chosen. Refactor layout to prevent overlap.

- **Responsive question picker** — On small screens, the question picker on the right pane is too cramped. Improve layout or add a modal/drawer mode for selecting questions.

### Recently Completed

- ✓ **Duplicate question** — Clone an existing question as a starting point for a variation, opening the editor pre-filled with the copy.
- ✓ **Create units / sections from the question editor** — Inline "＋ New unit/section" buttons in the curriculum dropdowns.
- ✓ **Sort options in the question bank** — Sort by import order, date added, point value, unit, or last edited.
- ✓ **Bulk operations in the question bank** — Start a selection from a checkbox, select visible questions with Ctrl/Cmd+A, use Shift/Ctrl-click to extend or toggle, then update metadata, create new class/unit/section targets, or delete the selection.
- ✓ **"MCQs first" reflected in the selected list** — Selected questions reorder to show MCQs first when this option is enabled.
- ✓ **Answer-space override reset button** — Small red ✕ button appears when an override is active to reset to global default.
- ✓ **Copy-to-clipboard in source view** — Overlapping squares icon in source toolbar; turns primary color on successful copy.
- ✓ **Render-check progress bar** — Visual progress bar with numeric counter replaces plain "X / Y" text.

### Near Term

- **Custom theme import** — Paste a JSON object of CSS variable values (`bg`, `text`, `primary`, etc.) to create and save a custom color theme. Custom themes are stored in localStorage and appear in Settings alongside the built-in ones.

- **Undo/Redo** — Add undo and redo buttons (or keyboard shortcuts) to revert changes in the test builder and question editor. Track changes to test config, selected questions, and question content.

- **Page breaks and spacing** — Add a control to insert page breaks or Typst `#vfill()` spacing between selected questions to spread content across pages more deliberately.

- **MCQ answer box** — Add an option to render a dedicated answer box (e.g., a grid or fill-in area) where students write the correct letter for MCQ questions, separate from the question body.

- **Better Typst export formatting** — Refactor generated Typst code to be more human-readable and modular: use functions or parameterized templates instead of hardcoded question numbers; reduce block nesting to make it easier to add or modify questions manually after export.

- **Question type support in the importer** — The bulk importer currently handles free-response and MCQ. Planned additions:
  - True/False
  - Fill in the blank (with configurable blank length)
  - Matching (two-column pairs)
  - Short answer (single line, labeled)
  - Long answer / essay (larger answer box)
  - Numeric response (exact or tolerance-based grading key)

- **Question type tags** — Auto-detect and label question types from imported content and surface them as filterable tags.

- **TikZ diagram handling** — Detect `\begin{tikzpicture}` blocks in pasted LaTeX and prompt the user to compile them locally and upload the resulting SVG/PDF.

### Medium Term

- **OCR / image import** — Paste or drag in a photo of a printed question; send to Mathpix (user-supplied API key) to extract LaTeX, then convert to Typst.
- **QTI / Moodle GIFT import** — Parsers for Canvas and Blackboard export formats.

### Long Term

- **"Used in tests" tracking** — Record which saved tests each question has appeared in, and surface that on the question card.
- **Question-level version history UI** — Surface the repo's git history per question, with one-click revert.
- **OAuth login** — Replace PAT with GitHub OAuth via a small Cloudflare Worker proxy for the token exchange.
