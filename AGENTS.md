# TestGen Agent Guidelines

TestGen is a local-first math assessment tool for teachers. Guide development by teacher tasks and preserve existing questions, drafts, tests, images, and assessment records.

## Product principles

Treat predictable behavior, recoverable actions, and immediate feedback as part of the definition of done. The rules below translate the work of Don Norman, Bruce Tognazzini, Bill Atkinson, Andy Hertzfeld, Susan Kare, and Larry Tesler into practical guidance for TestGen.

Apply this guidance to the workflow being changed. Record broader opportunities separately instead of expanding every task into a redesign.

### Don Norman: make actions, scope, and state understandable

- Start with what the teacher is trying to accomplish. Make the next action and its result understandable from the interface.
- Show the current bank, test, and editing scope where they affect a decision. Use explicit actions such as **Save for this test** and **Save in original bank**.
- Preserve the mental model: a bank question is reusable source material; a test contains its own copy; an administered assessment keeps its frozen question content, order, and points. Do not silently propagate edits between these scopes.
- Distinguish draft recovery, saving to the bank or test, and folder or cloud synchronization. A browser-local draft must not appear to be included in external backups.
- Explain errors beside the affected work, preserve input, and provide a useful next action.

### Bruce Tognazzini: make learned behavior transferable

- Keep selection, duplication, deletion, menus, shortcuts, and focus behavior consistent across Bank, Editor, Build, and Generate when they perform equivalent actions.
- Make controls with different consequences visibly distinguishable. Consistency does not require collapsing deliberate differences between draft saving and publishing to a bank.
- Keep frequent actions discoverable. Put secondary actions in menus without making essential workflows depend on hover, tooltips, or undocumented gestures.
- Preserve context when navigating: searches, filters, selections, scroll position, and focus should survive when appropriate.
- Acknowledge actions promptly. Background work should communicate progress and allow continued work where safe.

### Bill Atkinson: let teachers work on the material

- Prefer interactions that connect a question or layout control to its visible result. Where practical, selecting an item in a preview should expose the relevant editing controls.
- Show the result of changes to points, spacing, answer space, ordering, and layout through a live preview.
- Provide keyboard and explicit control alternatives to dragging or other pointer gestures.
- Preserve the last successful preview during rendering or invalid source, while clearly identifying an outdated preview and preventing it from being mistaken for another question's result.

### Andy Hertzfeld: put coherent behavior into shared foundations

- Reuse components and state operations for common interactions such as menus, selection, save status, and recovery. Fix shared behavior at the appropriate layer.
- Keep typing and navigation responsive while rendering, importing, saving, or synchronizing. Build on the existing workers, preview scheduling, and performance diagnostics.
- Measure responsiveness with realistic question banks and image-heavy documents. Include slower interactions and long main-thread tasks, not only averages.
- Keep visible success truthful: acknowledging a click, saving locally, and completing synchronization are separate events.

### Susan Kare: make the visual language communicate

- Use a small, consistent vocabulary of icons. Pair important or unfamiliar actions with readable text labels.
- Make selected, changed, saving, saved, and failed states easy to distinguish without relying on color alone.
- Prioritize legible mathematical content, clear hierarchy, and comfortable controls at supported screen sizes.
- Use accessible names, visible keyboard focus, and predictable focus restoration. Visual polish should improve recognition and use.

### Larry Tesler: reduce hidden modes and support exploration

- Prefer selecting material and then acting on it over requiring a separate editing mode for each operation.
- Make necessary modes and action targets explicit. Reduce unnecessary switching between finding, editing, and assembling questions.
- Make ordinary edits recoverable. Extend existing recycle-bin and recovery patterns where relevant; use Undo/Redo for document operations such as removing questions, reordering, changing points, and changing layout.
- Implement recovery in the state and persistence layers, including image references, metadata, and synchronization behavior. A temporary notification alone is not recovery.
- Keep text-field undo native and predictable when adding document-level shortcuts. Reserve permanent deletion and its confirmation for an explicit final action.

## Development workflow

1. Describe the teacher task before coding. For example: “Replace question 4 with an easier variant while preserving its points and position.”
2. Specify what is visible, what changes, how success is communicated, and how the teacher can recover. Include the affected bank, test, and assessment scopes.
3. Implement a complete, small workflow, including keyboard behavior, persistence, errors, and recovery appropriate to the change.
4. Validate with realistic tasks. When teacher feedback is available, observe attempts without coaching and record hesitation, wrong turns, completion time, and recovery success. Do not claim user validation without observing it.
5. Add focused regression checks for meaningful behavior and observed failures. Reuse relevant existing tests; avoid tests that merely mirror implementation details.
6. Report the resulting behavior, validation evidence, and material limitations. Use existing performance diagnostics when responsiveness is part of the change.

When prioritizing usability work, start with **find a question → add it to a test → edit its copy → preview → export**. Useful follow-up priorities include consistent recovery for bank deletion, document-level Undo/Redo, and clearer editing scope and save status. Check the current implementation before treating any of these as missing.

## Background reading

- [Don Norman: The Design of Everyday Things](https://jnd.org/books/the-design-of-everyday-things-revised-and-expanded-edition/)
- [Bruce Tognazzini: First Principles of Interaction Design](https://asktog.com/atc/principles-of-interaction-design/)
- [Bill Atkinson: Computer History Museum profile](https://computerhistory.org/profile/bill-atkinson/)
- [Andy Hertzfeld: Computer History Museum profile](https://computerhistory.org/profile/andy-hertzfeld/)
- [Susan Kare: About her work](https://kareprints.com/pages/about)
- [Larry Tesler and Tim Mott: Gypsy and modeless editing](https://xeroxalto.computerhistory.org/xerox_alto_file_system_archive.html)
