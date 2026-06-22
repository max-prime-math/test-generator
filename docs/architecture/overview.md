---
title: Architecture Overview
sidebar_position: 1
---

# Architecture Overview

Test Generator is a browser-based Svelte 5, Vite, and TypeScript app.

## Main Areas

- **Question Bank**: local question storage, curriculum organization, preview, import, and editing.
- **Test Builder**: saved tests, draft tests, Typst generation, PDF preview, and export.
- **Gradebook**: experimental local course sections, rosters, assessment snapshots, scores, and totals.
- **Sync**: browser-side git/GitHub operations and Google Drive backup for supported bank data.

## Key Properties

- Local-first by default.
- No required backend.
- Typst compilation and rendering run in the browser.
- Multiple banks are stored as separate browser snapshots.
- Sync and cloud operations are explicit.

## High-Yield Entry Points

- `src/App.svelte`: top-level shell and tabs.
- `src/lib/types.ts`: shared data types.
- `src/lib/bank.svelte.ts`: question bank store.
- `src/lib/test-library.svelte.ts`: saved tests and draft persistence.
- `src/components/TestView.svelte`: test builder UI.
- `src/components/GradebookView.svelte`: experimental Gradebook UI.
- `src/lib/gradebook.svelte.ts`: Gradebook store.
- `src/lib/typst/template.ts`: Typst document generation.
- `src/lib/typst/compiler.ts`: Typst WASM compile/render wrapper.
- `src/lib/sync/`: sync manager, providers, and formats.
- `src/git/`: browser git state and remote configuration.
