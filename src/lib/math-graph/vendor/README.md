# Math Graph source snapshot

Copied from `max`'s local `/home/max/dev/math-graph`, version 0.7.0, commit
`c750d9310262fe2c722517629a8952d7544a8644`. License: MIT (included).

This snapshot keeps Test Generator builds independent of a sibling checkout.
The source repository is unchanged. To update, copy the eight TypeScript modules
and `media/editor.css`, then preserve these small integration changes:

- Explicit `.ts` paths and type-only imports for Node's TypeScript test runner.
- `preview.ts` exposes `drawGraph` with a small drawing interface; the original
  Canvas renderer delegates to it. SVG export uses the exact same geometry and
  drawing operations, including discontinuity breaks, endpoint marks and arrows.
- `webview.ts` changes save/source/status wording for the browser host.

`../host.ts` implements the document bridge, local undo/redo, .tkz import/export,
and messages to the question editor. `../svg.ts` embeds the validated graph model
in SVG metadata, so ordinary bank image serialization preserves editable graphs.
