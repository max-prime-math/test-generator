---
title: Typst Rendering
sidebar_position: 4
---

# Typst Rendering

The app uses Typst WebAssembly packages to compile tests entirely in the browser.

## Main Files

- `src/lib/typst/template.ts`: generates Typst source from test config and selected questions.
- `src/lib/typst/compiler.ts`: wraps Typst compile and SVG render calls.
- `src/components/Preview.svelte`: displays the preview and exposes download/print actions.
- `src/lib/typst/image-shadow.ts`: resolves stored images and maps them into the compiler's virtual filesystem.

## Preview Flow

1. Test Builder derives Typst source from config and selected questions.
2. Preview debounces edits.
3. Compiler prepares referenced images.
4. Typst renders SVG for inline preview or PDF bytes for downloads.

## Image Flow

Images are stored in IndexedDB by basename. At compile time, image bytes are mounted under `/imgs/<name>.<ext>`.

Downloaded `.typ` files do not include those image bytes, so standalone local compilation requires copying images and adjusting paths.
