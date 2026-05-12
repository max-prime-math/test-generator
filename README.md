# Test Generator

**[https://max-prime-math.github.io/test-generator/](https://max-prime-math.github.io/test-generator/)**

A lightweight, browser-based math test generator. Everything runs locally — no account, no server, no uploads. Questions are stored in your browser and the PDF is compiled on your machine using the Typst typesetting engine via WebAssembly.

---

## Quick Start

1. Go to the **Question Bank** tab and add questions (or bulk-import from text/LaTeX).
2. Switch to the **Build Test** tab, fill in the test settings, and select questions.
3. Click the preview pane — the first compile loads the Typst engine (~28 MB, cached after that).
4. Download the `.typ` source or print the PDF directly from the preview pane.

---

## The Question Bank

### Layout

The bank view has three resizable panels: a curriculum sidebar on the left, the question list in the center, and a live preview panel on the right. Drag the divider handles to resize panels; click a divider to collapse or expand that panel.

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

### MCQ Questions

If you fill in two or more choices (A–E), the question is treated as multiple choice. Choices are laid out in a two-column grid in the PDF. Set the **Correct answer** dropdown to the correct letter to enable an answer key.

### Editing and Deleting

Click **Edit** or **Delete** on any question card. Deletions are permanent — export a JSON backup first if you're unsure.

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

### Import JSON

Click **Import JSON** and select a `.json` file. Questions are **appended** to the existing bank. The file must be a JSON array where each object has at least a `body` (string) and `points` (number).

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

### Bulk Import (Plain Text / LaTeX / JSON)

Click **Bulk Import** to paste or drag in a block of questions as plain text or LaTeX. The importer:

- Auto-detects whether the input is LaTeX or plain Typst
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

## Sync to GitHub

Click the cloud icon in the top-right header to back up your question bank and saved tests to a **private GitHub repo**. Files are stored as plain JSON — privacy comes from the repo being private, not from encryption. GitHub enforces auth: nobody can read the files without your account credentials.

### One-time setup

1. Click the **sync** icon → **Connect to GitHub**.
2. Paste a GitHub [Personal Access Token](https://github.com/settings/tokens/new) with the **`repo`** scope. The modal has step-by-step instructions.

On first run the app creates (or finds) a private repo named **`test-generator-bank`** in your account:

```
test-generator-bank/       (private)
├── index.json             (list of synced classes)
├── ap-calc-bc.json        (demo-only questions + images as plain JSON)
├── precalc.json
├── ...
├── tests/
│   ├── index.json         (list of synced tests)
│   └── {uuid}.json        (individual saved test)
```

### Backing up and restoring

**Question classes:** In the sync panel, each class with questions shows two buttons:

- **↑** Push the current local state (creates the file on first push, updates otherwise).
- **↓** Pull the remote file and merge. If the same question was edited in two places, a per-question conflict picker appears.

**↑ Sync all** in the status card pushes every synced class at once. Each push is a real git commit, so the repo's history is automatic version history you can browse on GitHub.

**Saved tests:** Below the classes section, each saved test shows:

- **↑** Push the current test to GitHub.
- **↓ Pull all tests** at the bottom pulls all remote tests and merges them using last-write-wins (newer test by `updatedAt` wins).

### Sharing with a colleague

Click **Share repo** in the sync panel, enter your colleague's GitHub username, and click **Send invite**. GitHub emails them an invitation. Once they accept and open Test Generator with their own PAT, the repo (and all its class files) is immediately available to them — no passwords, no handshake.

Both of you can back up and restore independently. Conflicts between edits are resolved per-question.

To revoke access, remove them from the repo's **Collaborators** settings on GitHub.

### What's stored where

| Location | Contents |
|---|---|
| Private GitHub repo | All class files (questions, images, custom class structure) and saved tests |
| `localStorage["tg-github-token-v2"]` | Your GitHub PAT (plaintext) |
| `localStorage["tg-repo-v1"]` | Repo owner + name (plaintext) |
| `localStorage["tg-last-sync-<classId>"]` | Per-question timestamp snapshot for conflict detection |
| `localStorage["tg-test-library-v1"]` | All saved tests (plaintext JSON array) |
| `localStorage["tg-test-draft-v1"]` | Current draft test config (auto-saved) |

### Reset / clean slate

```js
// Run in DevTools to disconnect without touching the local question bank or tests:
localStorage.removeItem('tg-github-token-v2');
localStorage.removeItem('tg-repo-v1');
```

The repo on GitHub is untouched — delete it manually if you want a completely clean slate.

To clear saved tests and the draft:
```js
localStorage.removeItem('tg-test-library-v1');
localStorage.removeItem('tg-test-draft-v1');
```

### Migration note

If you previously used an older version of this app that stored encrypted files in the repo (version 1 format), those files are incompatible with the current plaintext format. Delete the old files (or the whole repo) on GitHub and run **↑ Sync all** to push fresh copies.

---

## Interface

### Dark / Light Mode

Click the **☾ / ☀** icon in the top-right header to toggle between dark and light mode. The setting is saved to `localStorage` and persists across sessions. By default the app follows your system preference.

---

## Data and Privacy

All data stays in your browser unless you opt into sync. The question bank is saved to `localStorage` under the key `math-test-bank-v2`. Custom class definitions are saved to `localStorage` under `math-test-custom-classes-v1`. Saved tests are stored under `tg-test-library-v1`, and your current draft test config is auto-saved under `tg-test-draft-v1`. Uploaded images (used by bulk-imported questions with `\includegraphics`) are stored in an IndexedDB database named `test-generator`, keyed by basename. Clearing your browser's site data will erase the bank, custom classes, saved tests, and images — back up to a gist, export a JSON file, or push to GitHub periodically. Keep the original image files around since they are not included in the JSON export.

---

## Technical Notes

- **Typst engine**: [`@myriaddreamin/typst.ts`](https://github.com/Myriad-Dreamin/typst.ts) + `@myriaddreamin/typst-ts-web-compiler`
- **Framework**: Svelte 5 + Vite + TypeScript
- **Styling**: Plain CSS with `prefers-color-scheme` dark mode, manual light/dark toggle
- **Persistence**: `localStorage` for questions and custom classes, IndexedDB for uploaded images
- **PDF display**: Typst WASM SVG renderer (inline DOM, no iframe)
- **Sync**: GitHub Contents API; plain JSON files in a private repo

---

## Roadmap

### Recently Completed

- ✓ **Duplicate question** — Clone an existing question as a starting point for a variation, opening the editor pre-filled with the copy.
- ✓ **Create units / sections from the question editor** — Inline "＋ New unit/section" buttons in the curriculum dropdowns.
- ✓ **Sort options in the question bank** — Sort by import order, date added, point value, unit, or last edited.
- ✓ **"MCQs first" reflected in the selected list** — Selected questions reorder to show MCQs first when this option is enabled.
- ✓ **Answer-space override reset button** — Small red ✕ button appears when an override is active to reset to global default.
- ✓ **Copy-to-clipboard in source view** — Overlapping squares icon in source toolbar; turns primary color on successful copy.
- ✓ **Render-check progress bar** — Visual progress bar with numeric counter replaces plain "X / Y" text.

### Near Term

- **Bulk operations in the question bank** — Select multiple questions to delete, retag, or move to a different class in one action.

- **Custom theme import** — Paste a JSON object of CSS variable values (`bg`, `text`, `primary`, etc.) to create and save a custom color theme. Custom themes are stored in localStorage and appear in the theme picker alongside the built-in ones.

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

- **Settings menu** — Configurable session timeout, auto-sync interval, and other preferences.
- **Auto-sync on interval** — Push every N minutes when active.
- **OCR / image import** — Paste or drag in a photo of a printed question; send to Mathpix (user-supplied API key) to extract LaTeX, then convert to Typst.
- **QTI / Moodle GIFT import** — Parsers for Canvas and Blackboard export formats.

### Long Term

- **"Used in tests" tracking** — Record which saved tests each question has appeared in, and surface that on the question card.
- **Question-level version history UI** — Surface the repo's git history per question, with one-click revert.
- **OAuth login** — Replace PAT with GitHub OAuth via a small Cloudflare Worker proxy for the token exchange.
