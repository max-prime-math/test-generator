# Test Generator

**Test Generator** is a browser-based, local-first math test generator for teachers. It stores question banks in the browser, builds printable tests from selected questions, renders PDFs locally with Typst WebAssembly, and includes an experimental local Gradebook for administered saved tests.

Live app: <https://testgen.dev/>

## What It Is

Test Generator is designed for teachers who want to:

- Maintain local math question banks.
- Organize questions by curriculum class, unit, and section.
- Import questions from text, LaTeX, JSON, and PQP.
- Build reusable saved tests from selected questions.
- Render and export Typst/PDF tests entirely in the browser.
- Optionally track local rosters, assessment snapshots, and scores in the experimental Gradebook.

The app is intentionally local-first. It does not require an account or backend server for normal use. Cloud and sync features are explicit opt-in workflows.

## Project Status

This is an active Svelte 5 + Vite + TypeScript application. The Question Bank, Test Builder, saved tests, local storage, Typst preview/export, imports, browser GitHub sync, and Google Drive backup are functional. The Gradebook is experimental and must be enabled under **Settings -> More -> Gradebook (experimental)**.

Student grade data is sensitive. The Gradebook currently stays local to the browser and is not included in GitHub sync or Google Drive backup.

## Quick Start

```bash
npm install
npm run dev
```

Then open the local Vite URL printed by the dev server.

Common commands:

```bash
npm run dev
npm run build
npm run docs:dev
npm run docs:build
npm run check
npm run test:gradebook
```

## Documentation

The user documentation lives in [`docs/`](docs/index.md) and is built with Astro Starlight. It is intentionally focused on how to use the app.

Live docs: <https://testgen.dev/docs/>

Run the docs site locally:

```bash
npm run docs:dev
```

Build the static docs site:

```bash
npm run docs:build
```

Starlight provides the documentation shell: top navigation, a left docs sidebar, right-side page outline, responsive navigation, search, and generated routes from the Markdown files in `docs/`.

Start here:

- [Getting Started](docs/user-guide/getting-started.md)
- [User Guide: Question Bank](docs/user-guide/question-bank.md)
- [User Guide: Test Builder and Saved Tests](docs/user-guide/test-builder.md)
- [User Guide: Gradebook](docs/user-guide/gradebook.md)
- [User Guide: Import and Back Up Questions](docs/user-guide/import-export-sync.md)
- [Portable Question Package](docs/user-guide/portable-question-package.md)
- [Algorithmic Questions](docs/user-guide/algorithmic-questions.md)
- [Typst Authoring](docs/user-guide/typst-authoring.md)

## Architecture

At a high level:

- **Framework**: Svelte 5, Vite, TypeScript.
- **Rendering**: Typst WebAssembly via `@myriaddreamin/typst.ts`.
- **Persistence**: `localStorage` for app data and IndexedDB for uploaded images.
- **Question banks**: Stored locally, with multiple bank snapshots.
- **Saved tests**: Reusable local templates.
- **Gradebook**: Experimental local roster and score store with immutable assessment snapshots.
- **Sync**: Browser-side git/GitHub support and Google Drive backup for supported bank data.

High-yield entry points:

- [`src/App.svelte`](src/App.svelte): top-level shell and tabs.
- [`src/lib/types.ts`](src/lib/types.ts): shared data model.
- [`src/lib/bank.svelte.ts`](src/lib/bank.svelte.ts): question bank store.
- [`src/lib/test-library.svelte.ts`](src/lib/test-library.svelte.ts): saved tests and draft persistence.
- [`src/components/TestView.svelte`](src/components/TestView.svelte): test builder.
- [`src/components/GradebookView.svelte`](src/components/GradebookView.svelte): experimental Gradebook UI.
- [`src/lib/gradebook.svelte.ts`](src/lib/gradebook.svelte.ts): Gradebook store.
- [`src/lib/typst/template.ts`](src/lib/typst/template.ts): Typst generation.
- [`src/lib/typst/compiler.ts`](src/lib/typst/compiler.ts): Typst compile/render wrapper.
- [`src/lib/sync/`](src/lib/sync/): sync manager and providers.
- [`src/git/`](src/git/): browser git state and remote configuration.

## Project Notes

Near-term development priorities include improving importer coverage, tightening backup and restore workflows, refining test-builder layout controls, and keeping the experimental Gradebook local-first with explicit backup/export actions.

## Data and Privacy

Most data stays in the browser:

- Questions, custom curriculum classes, saved tests, drafts, app settings, bank snapshots, sync config, and Gradebook data use `localStorage`.
- Uploaded images use IndexedDB.
- GitHub tokens are stored separately from repo data and persistent storage requires explicit opt-in.
- Gradebook data is stored under `tg-gradebook-v1` and is not currently included in GitHub sync or Google Drive backup.

Clearing browser site data can erase local work. Export backups periodically, and keep original image files when moving banks between browsers.

## Shared Interchange Format

The app-supported rich import format is **Portable Question Package (PQP)**. PQP files use the `.pqp.json` extension and can carry question text, choices, answers, solutions, points, curriculum placement, image references, algorithm metadata, graph metadata, and diagnostics.

See [Portable Question Package](docs/user-guide/portable-question-package.md).

## Google Drive Configuration

Google Drive values can be configured at build time so users do not need to enter them manually:

```bash
VITE_GOOGLE_CLIENT_ID=1234567890-abc123def456.apps.googleusercontent.com \
VITE_GOOGLE_API_KEY=AIza... \
VITE_GOOGLE_CLOUD_PROJECT_NUMBER=123456789012 \
npm run dev
```

The Google Cloud project needs the Google Drive API and Google Picker API enabled, an OAuth client ID for a web application, a public Picker API key, and the app origin listed under authorized JavaScript origins.

## AI Disclosure

AI tools have been used during development of this project for coding assistance, documentation drafting, debugging, and design iteration. Human review remains responsible for what is accepted into the codebase.

The app itself is not an AI product and does not connect to AI services or send test content, student work, rosters, grades, or uploaded files to an LLM for training, tracking, or analysis. The default workflow is local-first: questions, saved tests, drafts, images, and Gradebook data stay in the browser.

Optional sync and sharing features are explicit teacher-controlled actions. Content may be uploaded to a private GitHub repository or a selected Google Drive folder only when the teacher enables and uses those features. Student information is not sent to an AI service; future Google Classroom grade export is intended only to connect local Gradebook records to Google Classroom data that already exists in the teacher's Classroom account.

## License

See [`LICENSE`](LICENSE).
