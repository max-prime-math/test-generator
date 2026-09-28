# Generator roadmap

Planning pages for the experimental question generator. Open the HTML files directly in a browser; they work offline.

| Page | Built from |
|---|---|
| `manitoba-atlas.html`: problem types for each Manitoba course, tagged with outcomes | `src/lib/generator/catalog.ts` and `src/lib/generator/outcomes.ts` |
| `kuta-topics.html`: every topic in Kuta Software's Infinite programs, for comparison | `data/kuta-topics.json` |

The pages are generated. To change one, edit its data (or its template in `templates/`), then run:

```sh
npm run roadmap:build
```

`npm run test:generator` fails if a page is out of date with its data.

This folder is separate from `docs/`, which is published as the user documentation site.
