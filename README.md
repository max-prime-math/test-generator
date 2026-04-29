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

### Curriculum Organization

Questions can be assigned to a **Class → Unit → Section** hierarchy. The sidebar on the left lets you browse and filter by unit or section. Clicking a unit or section filters the question list, and **+ Add Question** pre-fills the curriculum fields from your current selection.

AP Calculus BC (10 units, 111 sections) is included with a starter question for every section. You can also create your own custom classes.

### Adding Questions

Click **+ Add Question** to open the editor. Each question has:

| Field | Description |
|---|---|
| **Curriculum** | Optional class / unit / section assignment. Cascading dropdowns. |
| **Body** | The question text, written in Typst markup. Math goes here. |
| **Choices** | Optional MCQ choices A–E. Enter at least two to activate MCQ mode. |
| **Solution** | Optional answer key entry. For MCQ, a single letter (A–E). |
| **Points** | Numeric point value (decimals like `0.5` are fine). |
| **Tags** | Comma-separated labels, e.g. `limits, derivatives`. Used for filtering and random selection. |

### MCQ Questions

If you fill in two or more choices (A–E), the question is treated as multiple choice. Choices are laid out in a two-column grid in the PDF. The solution field accepts a single letter as the correct answer.

### Editing and Deleting

Click **Edit** or **Delete** on any question card. Deletions are permanent — export a JSON backup first if you're unsure.

### Searching and Filtering

- The **search bar** filters by question body text and tags simultaneously.
- **Class tabs** (shown when multiple classes exist) filter to a single class.
- The **sidebar tree** lets you drill down to a specific unit or section.

### Question Preview

Click any question card to open a live Typst preview in the right panel. Use **j/k** or **↑/↓** arrow keys to navigate between questions without leaving the keyboard.

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

Use `#linebreak()` to add sub-parts within a single question:

```
Let $f(x) = x^2 e^x$. #linebreak()
*(a)* Find $f'(x)$. #linebreak()
*(b)* Find all critical points of $f$.
```

---

## Building a Test

### Test Settings

| Setting | Description |
|---|---|
| **Title** | Appears centered at the top. |
| **Subtitle** | Optional second line below the title. |
| **Date** | Free-form text, pre-filled with today's date. |
| **Instructions** | Shown below the name line in italics. |
| **Answer space** | Blank vertical space (cm) left below each question for student work. |
| **Show point values** | Toggles `(n pts)` labels next to each question number. |
| **Bold point values** | Renders point labels in bold. |

### Formatting

| Setting | Description |
|---|---|
| **Font size** | Body text size: 10, 11, or 12 pt. Title and subtitle scale proportionally. |
| **Paper** | US Letter or A4. |
| **Margin** | Page margin in inches, applied to all four sides (0.5–2 in). |
| **Edit preamble manually…** | Opens a raw Typst editor pre-filled with the auto-generated preamble. While active, all form controls are bypassed. Click **Reset to automatic** to return to the form. |

### Selecting Questions

Questions from the bank appear in the picker at the bottom of the left panel. Check any question to add it to the test. The **selected list** at the top shows the current order — use **↑ ↓** to reorder and **✕** to remove individual questions.

Each row in the selected list has a small **cm** input on the right to override the global answer space for that question. The value turns blue when it differs from the global default.

Use the **class / unit / section** dropdowns to filter the picker before selecting.

### Random Selection

Set a count and click **+ Random** to add that many randomly chosen questions from the visible pool.

### MCQ Shuffle

Enable **Shuffle choices** to randomize answer choice order per question across different versions of the test.

### Answer Key

Toggle **Answer key** to append a separate answer key section to the PDF. MC answers appear in a compact lettered grid; written solutions are shown as a numbered list.

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

### Bulk Import (Plain Text / LaTeX)

Click **Bulk Import** to paste or drag in a block of questions as plain text or LaTeX. The importer:

- Auto-detects whether the input is LaTeX or plain Typst
- Converts LaTeX math (`\frac`, `\int`, `\sum`, etc.) to Typst equivalents
- Splits the block into individual questions by numbered list, delimiter, or blank lines
- Recognizes MCQ answer choices (lettered A–E) and attaches them to the question
- Detects `\includegraphics{…}` references and prompts for the image files
- Lets you review, edit, and assign curriculum to each question before committing to the bank

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

Click the cloud icon in the top-right header to back up your question bank to a **private GitHub repo**. Everything is encrypted in your browser before it leaves — GitHub stores an opaque blob that's useless without your password. Because it's a private repo (not an unlisted gist), GitHub itself enforces auth: nobody can read the file without your account credentials *or* the password to decrypt it.

### One-time setup

1. Click the **sync** icon → **Set up sync**.
2. Paste a GitHub [Personal Access Token](https://github.com/settings/tokens/new) with the **`repo`** scope (the full one — `public_repo` won't work for private repos). The setup modal has step-by-step instructions.
3. Choose a password (min 8 characters). This password encrypts the file contents *and* locks the sync UI. **Write it down — there is no recovery if you forget it.**

On first run the app creates (or finds) a private repo named **`test-generator-bank`** in your account. The repo holds:

```
test-generator-bank/         (private)
├── index.json               (unencrypted: list of synced classes)
├── ap-calc-bc.json          (encrypted)
├── precalc.json             (encrypted)
└── ...                      (one file per class you back up)
```

### Backing up

In the sync panel, each class with questions shows two buttons:

- **↑** Push the current local state to its file (creates it on first push, updates otherwise).
- **↓** Pull the file and merge into your local bank. If the same question was edited in two places, you'll get a per-question conflict picker.

**Sync all** at the top of the panel pushes every linked class in one go. Each push is a real git commit with a message like `Sync AP Calculus BC` — so the repo's commit history is automatic version history.

### Session locking

After 30 minutes of inactivity, the session locks: the password, decryption key, and decrypted token are wiped from memory, and a blurred lock screen prompts for re-entry the next time you try to sync. Editing questions is never blocked — only sync operations require an active session. The cloud icon shows a green dot when active and an amber dot when locked.

### What's encrypted, what isn't

| Stored where | Contents | Encrypted? |
|---|---|---|
| Class file (`<classId>.json` in the repo) | Questions, images, custom class definition | ✅ AES-GCM with envelope encryption |
| Index file (`index.json` in the repo) | List of class filenames + last-synced timestamps | ❌ Plaintext (so the app can list classes without unlocking) |
| `localStorage["tg-github-token-v1"]` | Your GitHub PAT | ✅ AES-GCM with key derived from your password |
| `localStorage["tg-repo-v1"]` | Repo owner + name + default branch | ❌ Plaintext (just metadata) |

Encryption uses **envelope encryption**: a random 256-bit data key (DEK) encrypts each class file's contents; that DEK is then wrapped with a key encryption key (KEK) derived from your password (PBKDF2-SHA256, 200k iterations). The wrapped DEK is stored in the file's `accessKeys` array. This makes future sharing simple — adding a colleague means adding a new wrapped copy of the same DEK to `accessKeys` (no re-encryption of the bulk data needed).

### Why a private repo (not a gist)?

Earlier versions of this app used GitHub Gists. Gists are "secret" only in the sense of being unlisted — anyone with the URL can read them. Private repos are *actually* private: GitHub returns 404 to unauthenticated requests. Since the data is encrypted either way, the practical upside is defense-in-depth, plus better collaborator management and free per-file commit history via git.

### Reset / clean slate

If you ever want to start over (or hit a stuck state during testing), open DevTools and run:

```js
localStorage.removeItem('tg-github-token-v1');
localStorage.removeItem('tg-repo-v1');
```

Your local question bank is untouched; only the link to the repo is cleared. The repo on GitHub stays put — you can delete it manually if you want a truly clean slate.

---

## Data and Privacy

All data stays in your browser unless you opt into sync. The question bank is saved to `localStorage` under the key `math-test-bank-v2`. Uploaded images (used by bulk-imported questions with `\includegraphics`) are stored in an IndexedDB database named `test-generator`, keyed by basename. Clearing your browser's site data will erase both the bank and the images — back up to a gist or export a JSON file periodically, and keep the original image files around since they are not included in the JSON export.

---

## Technical Notes

- **Typst engine**: [`@myriaddreamin/typst.ts`](https://github.com/Myriad-Dreamin/typst.ts) + `@myriaddreamin/typst-ts-web-compiler`
- **Framework**: Svelte 5 + Vite + TypeScript
- **Styling**: Plain CSS with `prefers-color-scheme` dark mode, manual light/dark toggle
- **Persistence**: `localStorage` for questions, IndexedDB for uploaded images
- **PDF display**: Typst WASM SVG renderer (inline DOM, no iframe)
- **Encryption**: WebCrypto API (no dependencies); AES-GCM + PBKDF2 envelope encryption for sync

---

## Roadmap

### Near Term

- **Sharing with colleagues** — Use GitHub's native collaborator system (invite by username/email; they get an email; click accept) to give a colleague access to your class file. On their first pull they set their own password, which gets added to the file's `accessKeys` so they can decrypt without you sharing your password. The crypto layer already supports this; just need the invite UI.

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

- **Question-level version history UI** — Surface the repo's git history per question, with one-click revert.
- **OAuth login** — Replace PAT with GitHub OAuth via a small Cloudflare Worker proxy for the token exchange.
