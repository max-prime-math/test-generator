# Test Generator

A lightweight, browser-based math test generator. Everything runs locally — no account, no server, no uploads. Questions are stored in your browser and the PDF is compiled on your machine using the Typst typesetting engine via WebAssembly.

---

## Quick Start

1. Go to the **Question Bank** tab and add questions (or use the samples provided).
2. Switch to the **Build Test** tab, fill in the test settings, and select questions.
3. Click the preview pane — the first compile loads the Typst engine (~28 MB, cached after that).
4. Download the `.typ` source or print the PDF directly from the preview pane.

---

## The Question Bank

### Curriculum Organization

Questions can be assigned to a **Class → Unit → Section** hierarchy. The sidebar on the left side of the bank lets you browse and filter by unit or section. Clicking a unit or section filters the question list to that scope, and the **+ Add Question** button pre-fills the curriculum fields from your current selection.

AP Calculus BC (10 units, 111 sections) is included with a starter question for every section.

### Adding Questions

Click **+ Add Question** to open the editor. Each question has:

| Field | Description |
|---|---|
| **Curriculum** | Optional class / unit / section assignment. Cascading dropdowns. |
| **Body** | The question text, written in Typst markup. Math goes here. |
| **Points** | Numeric point value (can be a decimal like `0.5`). |
| **Tags** | Comma-separated labels, e.g. `calculus, derivatives`. Used for filtering and random selection. |
| **Solution** | Optional. Stored with the question for your reference. |

### Editing and Deleting

Click **Edit** or **Delete** on any question card. Deletions are permanent — export a JSON backup first if you're unsure.

### Searching

The search bar filters by question body text and tags simultaneously.

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
| **Bold point values** | Renders point labels in bold instead of plain text. |

### Formatting

| Setting | Description |
|---|---|
| **Font size** | Body text size: 10, 11, or 12 pt. Title and subtitle scale proportionally. |
| **Paper** | US Letter or A4. |
| **Margin** | Page margin in inches, applied to all four sides (0.5–2 in). |
| **Edit preamble manually…** | Opens a raw Typst editor pre-filled with the auto-generated preamble. While active, the Test Settings and Formatting controls are bypassed — full Typst is used instead. Click **Reset to automatic** to go back to the form fields. |

### Selecting Questions

Questions from the bank appear in the picker at the bottom of the left panel. Check any question to add it to the test. The **selected list** at the top shows the current order — use **↑ ↓** to reorder and **✕** to remove individual questions.

Each row in the selected list has a small **cm** input on the right. This overrides the global answer space for that one question — useful when a question needs more or less room than the default. The value turns blue when it differs from the global default.

Use the **class / unit / section** dropdowns to filter the picker before selecting or using random selection.

### Random Selection

Set a count and click **+ Random** to add that many randomly chosen questions from the visible pool to the current selection.

---

## Preview and Export

### PDF Preview

The preview pane compiles the current test to PDF using the Typst WebAssembly compiler and displays it inline. Compilation is debounced — it runs ~0.8 seconds after you stop making changes.

The **first compile** on a fresh page load triggers a one-time download of the Typst engine (~28 MB). This is cached by the browser; subsequent visits are instant.

### Show Source

Click **Show source** in the preview toolbar to see the raw Typst markup being compiled. This is useful for debugging unexpected output or copying the source to adjust manually.

### Download `.typ`

Click **Download .typ** to save the raw Typst source file. You can open it in any Typst installation to compile locally, tweak the layout, or use it as a starting template.

---

## Importing and Exporting the Question Bank

### Export

Click **Export JSON** in the bank toolbar to download `question-bank.json`. This is a plain JSON array — safe to back up, version-control, or share with colleagues.

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

### Import ExamView Bank (.bnk)

Click **Import BNK** to load a question bank exported from ExamView. The app reads the bank's binary format directly in the browser — no server or conversion tool required.

On import:
- A new **custom class** is created using the bank's title (e.g. "Chapter 1: Sequences and Series").
- Each section in the bank (Section 1.1, Section 1.2, …) becomes a **unit** within that class, named with the section's topic.
- Difficulty levels (Easy / Average / Difficult) and subtopics are stored as **tags**.
- Point values are assigned automatically: Easy = 2 pts, Average = 4 pts, Difficult = 6 pts.

**Current limitation:** ExamView banks use *algorithmic questions* — variable placeholders that are substituted with computed values at print time. The current importer brings in the question structure with `___` shown wherever a computed value would appear. Full algorithmic evaluation (randomizing variables, evaluating formulas, rendering fractions) is planned — see the Roadmap below.

### Bulk Import (plain text / LaTeX)

Click **Bulk Import** to paste or drag in a block of questions as plain text or LaTeX. The importer converts LaTeX math to Typst, splits the block into individual questions, and lets you review and assign curriculum before committing to the bank.

---

## Data and Privacy

All data stays in your browser. The question bank is saved to `localStorage` under the key `math-test-bank-v2`. Nothing is ever sent to a server. Clearing your browser's site data will erase the bank — export a JSON backup periodically.

---

## Technical Notes

- **Typst engine**: [`@myriaddreamin/typst.ts`](https://github.com/Myriad-Dreamin/typst.ts) + `@myriaddreamin/typst-ts-web-compiler`
- **Framework**: Svelte 5 + Vite + TypeScript
- **Styling**: Plain CSS with `prefers-color-scheme` dark mode, manual light/dark toggle
- **Persistence**: `localStorage`
- **PDF display**: Typst WASM SVG renderer (inline DOM, no iframe)

---

## Roadmap

### Near Term

- **Algorithmic question evaluation** — Implement ExamView's variable engine so `.bnk` questions render with real computed values instead of `___` placeholders. This includes:
  - Parsing the binary variable-definition blocks (name, formula, range constraints)
  - Evaluating arithmetic expressions and built-in functions (`range()`, `fracs()`, `isunique()`, `abs()`, etc.)
  - Constraint satisfaction loop (retry random draws until all `isunique` and inequality conditions pass)
  - Substituting computed values into question text and answer choices using the variable-order index embedded in each question block
  - Rendering fractions as proper Typst `frac()` expressions

- **Question type tags** — Detect and label Multiple Choice, Short Answer, Numeric, etc. from the BNK format and surface them as filterable tags.

### Medium Term

- **Answer key generation** — Store and display the correct answer for MC questions; generate a separate answer-key page when building a test.
- **OCR / image import** — Paste or drag in a photo of a printed question; send to Mathpix (user-supplied API key) to extract LaTeX, then convert to Typst.
- **QTI / Moodle GIFT import** — Parsers for Canvas and Blackboard export formats.

### Long Term

- **Version history** — Track edits to individual questions with the ability to revert.
- **Collaborative sharing** — Optional cloud sync (read-only share links for question banks).
