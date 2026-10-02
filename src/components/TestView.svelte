<script lang="ts">
  import { slide } from 'svelte/transition';
  import { tick, untrack } from 'svelte';
  import { bank } from '../lib/bank.svelte';
  import { narratives } from '../lib/narratives.svelte';
  import { CLASSES, DEMO_CLASSES, findSection } from '../lib/curriculum';
  import { customClasses } from '../lib/custom-classes.svelte';
  import { type GradebookSection, type PageNumberPlacement, type SavedTest, type TestType } from '../lib/types';
  import { generateTypst, generatePreamble, generateAnswerKeyPage, pointsTotalPreview, questionLabels, sortQuestions, MCQ_POSITION_SELECTOR, type McqPosition } from '../lib/typst/template';
  import { queryValues } from '../lib/typst/compiler';
  import { appState } from '../lib/app-state.svelte';
  import { fuzzyScoreMulti } from '../lib/fuzzy';
  import { openInEditor } from '../lib/editor/editor-state.svelte';
  import { testQuestionEditor } from '../lib/editor/test-question-edit.svelte';
  import { testLibrary } from '../lib/test-library.svelte';
  import { testEditor } from '../lib/test-editor.svelte';
  import { gradebook } from '../lib/gradebook.svelte';
  import { savedTestFitsSection } from '../lib/gradebook-model';
  import { saveDialogStore } from '../lib/save-dialog-store.svelte';
  import Preview from './Preview.svelte';
  import ScopeSelect from './ScopeSelect.svelte';
  import { exportBaseName } from '../lib/export-filename';
  import { compileSvg } from '../lib/typst/compiler';
  import { formatBody, formatParts } from '../lib/question-format';
  import { getThemeColors } from '../lib/theme-colors';
  import { appSettings } from '../lib/app-settings.svelte';
  import { resolveQuestionNarrative } from '../lib/narrative-utils';
  import { workspaceCatalog } from '../lib/workspace-catalog.svelte';
  import { mergeWorkspaceClasses, firstById } from '../lib/workspace-format';
  import { bankWorkspaces } from '../lib/bank-workspaces.svelte';
  import { bankView } from '../lib/bank-switch-view.svelte';
  import { IMAGE_RENAMED_EVENT } from '../lib/editor/image-library';
  import { rewriteImageReferences } from '../lib/editor/image-references';
  import { imageStore } from '../lib/image-store.svelte';
  import { portal } from '../lib/portal';
  import { autoImports } from '../lib/typst/auto-imports';

  let { active = true }: { active?: boolean } = $props();

  const KNOWN_PAPER_SIZES = new Set([
    'us-letter',
    'us-legal',
    'us-ledger',
    'a3',
    'a4',
    'a5',
    'b4',
    'b5',
  ]);

  function initialTestTitle(): string {
    const classes = appState.demoMode ? [...CLASSES, ...DEMO_CLASSES, ...customClasses.classes] : [...CLASSES, ...customClasses.classes];
    return classes.find((c) => c.id === appState.lastClassId)?.name ?? 'Test';
  }

  testEditor.initialize(appSettings.createDefaultTestConfig(initialTestTitle()));
  let config = $derived(testEditor.config);

  // ── Test library state ────────────────────────────────────────────────────
  $effect(() => {
    const changed = (event: Event) => {
      const { oldName, name, ext } = (event as CustomEvent<{ oldName: string; name: string; ext: string }>).detail;
      testEditor.renameImageReferences(value => rewriteImageReferences(value, oldName, name, ext));
    };
    window.addEventListener(IMAGE_RENAMED_EVENT, changed);
    return () => window.removeEventListener(IMAGE_RENAMED_EVENT, changed);
  });
  let activeTestId = $derived(testEditor.testId);
  /** Workspace bank ids, or 'active' for whichever bank is open; empty means every bank. */
  let selectedBankIds = $state<string[]>([]);
  let questionsById = $derived(firstById([
    ...(config.ownQuestions ?? []),
    ...(activeTestId ? testLibrary.get(activeTestId)?.questionSnapshots ?? [] : []),
    ...workspaceCatalog.questions,
    ...bank.questions,
  ]));
  let questionPool = $derived([...questionsById.values()]);
  let testNarratives = $derived([...firstById([
    ...(activeTestId ? testLibrary.get(activeTestId)?.narrativeSnapshots ?? [] : []),
    ...narratives.narratives,
  ]).values()]);
  let isDirty = $derived(testEditor.dirty);
  let savedPanelVisible = $state(false);
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let editingToolbarName = $state(false);
  let toolbarNameInput = $state('');
  let toolbarNameInputEl: HTMLInputElement | undefined = $state();

  let allClasses = $derived(mergeWorkspaceClasses([...(appState.demoMode ? [...CLASSES, ...DEMO_CLASSES] : CLASSES), ...customClasses.classes, ...workspaceCatalog.classes]));

  let expandedTestGroups = $state(new Set<string>());
  function toggleTestGroup(classId: string | null) {
    const key = classId ?? '__null__';
    if (expandedTestGroups.has(key)) {
      expandedTestGroups.delete(key);
    } else {
      expandedTestGroups.add(key);
    }
    expandedTestGroups = new Set(expandedTestGroups);
  }

  // Auto-expand the current classes' test groups
  $effect(() => {
    const keys = selectedClassIds.length ? selectedClassIds : ['__null__'];
    if (keys.some(key => !expandedTestGroups.has(key))) {
      for (const key of keys) expandedTestGroups.add(key);
      expandedTestGroups = new Set(expandedTestGroups);
    }
  });

  // ── Picker filters ────────────────────────────────────────────────────
  // Empty means every class.
  const initialClassId = appState.lastClassId || ((appState.demoMode ? [...CLASSES, ...DEMO_CLASSES] : CLASSES)[0]?.id ?? '');
  let selectedClassIds = $state<string[]>(initialClassId ? [initialClassId] : []);
  let selectedUnits = $state<string[]>([]);
  let selectedSections = $state<string[]>([]);
  let selectedTypes = $state<string[]>([]);

  function isMCQ(q: { choices?: Record<string, string>; answer?: string; solution?: string }): boolean {
    return (q.choices != null && Object.keys(q.choices).length >= 2) ||
      /^[A-Ea-e]$/.test(q.answer ?? '') ||
      /^[A-Ea-e]$/.test(q.solution ?? '');  // backward compat: old data stored letter in solution
  }

  const curriculumKey = (...ids: (string | undefined)[]) => JSON.stringify(ids);
  let filterUnits = $derived(allClasses.filter(c => !selectedClassIds.length || selectedClassIds.includes(c.id))
    .flatMap(c => c.units.map(u => ({ ...u, classId: c.id,
      key: curriculumKey(c.id, u.id), label: `${selectedClassIds.length === 1 ? '' : c.name + ' · '}${unitLabel(u)}` }))));
  let filterSections = $derived(filterUnits.filter(u => !selectedUnits.length || selectedUnits.includes(u.key))
    .flatMap(u => u.sections.map(section => ({ ...section,
      key: curriculumKey(u.classId, u.id, section.id),
      label: `${u.label} · ${section.id} ${section.name}` }))));

  $effect(() => {
    const valid = selectedUnits.filter(key => filterUnits.some(u => u.key === key));
    if (valid.length !== selectedUnits.length) selectedUnits = valid;
  });
  $effect(() => {
    const valid = selectedSections.filter(key => filterSections.some(section => section.key === key));
    if (valid.length !== selectedSections.length) selectedSections = valid;
  });

  function toggleFilter(values: string[], value: string): string[] {
    return values.includes(value) ? values.filter(v => v !== value) : [...values, value];
  }

  // Follow the class viewed in the Bank. Only a change applies, so a multi-class
  // selection survives unrelated updates to the class list.
  let syncedClassId = initialClassId;
  $effect(() => {
    const classId = appState.lastClassId;
    if (!classId || classId === syncedClassId || !allClasses.some(c => c.id === classId)) return;
    syncedClassId = classId;
    selectedClassIds = [classId];
  });

  // Persist a single chosen class so the next test session starts from it.
  $effect(() => {
    const classId = selectedClassIds.length === 1 ? selectedClassIds[0] : '';
    if (classId && appState.lastClassId !== classId) {
      syncedClassId = classId;
      appState.setLastClassId(classId);
    }
  });

  let pickerSearch = $state('');

  // ── Exact tag filter ───────────────────────────────────────
  // Mirrors the bank view's tag dropdown: checked tags match exactly, so a tag
  // that is a substring of another ("graph" vs "graphing") no longer drags extras in.
  let selectedTags = $state<string[]>([]);
  let tagMatchAll = $state(true);
  let filtersOpen = $state(false);
  let tagSearch = $state('');


  function matchesTagFilter(q: { tags?: string[] }): boolean {
    if (selectedTags.length === 0) return true;
    const tags = new Set((q.tags ?? []).map((t) => t.toLowerCase()));
    return tagMatchAll
      ? selectedTags.every((t) => tags.has(t))
      : selectedTags.some((t) => tags.has(t));
  }

  /** Questions from the chosen banks; the active bank may sit outside the workspace. */
  function bankPool(bankIds: string[]) {
    if (!workspaceCatalog.banks.length) return bank.questions;
    if (!bankIds.length) return workspaceCatalog.questions;
    const activeInWorkspace = workspaceCatalog.banks.some(source => source.id === bankView.activeBankId);
    const ids = new Set(bankIds.map(id => id === 'active' ? bankView.activeBankId : id));
    const qs = workspaceCatalog.questions.filter(q => ids.has(workspaceCatalog.sources[q.id]?.bankId ?? ''));
    return bankIds.includes('active') && !activeInWorkspace ? [...bank.questions, ...qs] : qs;
  }

  /** Applies the picker filters except tags and search; bank and class menus count with their own group left open. */
  function filterQuestions({ banks = selectedBankIds, classes = selectedClassIds, curriculum = true } = {}) {
    let qs = bankPool(banks).filter((q) => !q.renderError);
    if (classes.length) qs = qs.filter(q => classes.includes(q.classId ?? ''));
    if (curriculum && selectedUnits.length) qs = qs.filter(q => selectedUnits.includes(curriculumKey(q.classId, q.unitId)));
    if (curriculum && selectedSections.length) qs = qs.filter(q => selectedSections.includes(curriculumKey(q.classId, q.unitId, q.sectionId)));
    if (selectedTypes.length) qs = qs.filter(q => selectedTypes.includes(isMCQ(q) ? 'mcq' : 'frq'));
    return qs;
  }

  /** Questions the other picker filters allow — the scope the tag list is drawn from. */
  let scopedQuestions = $derived(filterQuestions());

  let classOptions = $derived.by(() => {
    const counts = new Map<string, number>();
    // Units and sections belong to a class, so they don't narrow the other classes' counts.
    for (const q of filterQuestions({ classes: [], curriculum: false })) counts.set(q.classId ?? '', (counts.get(q.classId ?? '') ?? 0) + 1);
    return allClasses.map(c => ({ id: c.id, label: c.name, count: counts.get(c.id) ?? 0 }));
  });

  let bankOptions = $derived.by(() => {
    if (!workspaceCatalog.banks.length) return [];
    const counts = new Map<string, number>();
    for (const q of filterQuestions({ banks: [] })) {
      const bankId = workspaceCatalog.sources[q.id]?.bankId;
      if (bankId) counts.set(bankId, (counts.get(bankId) ?? 0) + 1);
    }
    return [
      { id: 'active', label: 'Active bank', count: filterQuestions({ banks: ['active'] }).length, pinned: true },
      ...workspaceCatalog.banks.filter(source => !workspaceCatalog.hiddenBankIds.has(source.id))
        .map(source => ({ id: source.id, label: source.name, count: counts.get(source.id) ?? 0 })),
    ];
  });

  // A bank that leaves the workspace, or the menu, can't stay checked.
  $effect(() => {
    const valid = selectedBankIds.filter(id => id === 'active' || bankOptions.some(option => option.id === id));
    if (valid.length !== selectedBankIds.length) selectedBankIds = valid;
  });

  /** Tags in scope with their question counts, most used first. */
  let tagOptions = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const q of scopedQuestions) {
      for (const raw of q.tags ?? []) {
        const tag = raw.trim().toLowerCase();
        if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    // A checked tag stays listed even when nothing in scope carries it.
    for (const tag of selectedTags) if (!counts.has(tag)) counts.set(tag, 0);
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  });

  let visibleTagOptions = $derived(
    tagSearch.trim()
      ? tagOptions.filter((t) => t.tag.includes(tagSearch.trim().toLowerCase()))
      : tagOptions,
  );

  function toggleTag(tag: string) {
    selectedTags = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
  }

  let filterChips = $derived([
    ...filterUnits.filter(u => selectedUnits.includes(u.key)).map(u => ({ kind: 'unit', key: u.key, label: u.label })),
    ...filterSections.filter(section => selectedSections.includes(section.key)).map(section => ({ kind: 'section', key: section.key, label: section.label })),
    ...selectedTypes.map(key => ({ kind: 'type', key, label: key === 'mcq' ? 'Multiple choice' : 'Free response' })),
    ...selectedTags.map(key => ({ kind: 'tag', key, label: `Tag: ${key}` })),
  ]);

  function removeFilter(kind: string, key: string) {
    if (kind === 'unit') selectedUnits = selectedUnits.filter(v => v !== key);
    if (kind === 'section') selectedSections = selectedSections.filter(v => v !== key);
    if (kind === 'type') selectedTypes = selectedTypes.filter(v => v !== key);
    if (kind === 'tag') selectedTags = selectedTags.filter(v => v !== key);
  }

  function clearFilters() {
    selectedUnits = [];
    selectedSections = [];
    selectedTypes = [];
    selectedTags = [];
    tagSearch = '';
    tagMatchAll = true;
    pickerSearch = '';
    selectedClassIds = [];
    selectedBankIds = [];
  }

  function closeFilters() {
    filtersOpen = false;
    tick().then(() => document.getElementById('picker-filter-toggle')?.focus());
  }

  $effect(() => {
    if (!filtersOpen) return;
    tick().then(() => document.getElementById('picker-filters-done')?.focus());
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeFilters(); }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  });

  let visibleQuestions = $derived(
    (() => {
      let qs = scopedQuestions.filter(matchesTagFilter);

      // Apply fuzzy search if query is present
      if (pickerSearch.trim()) {
        const scored = qs.map((q) => ({
          q,
          score: (() => {
            const narrative = resolveQuestionNarrative(q, narratives.narratives);
            const bodyText = q.parts ? formatParts(q.parts) : q.body;
            return fuzzyScoreMulti(pickerSearch.trim(), [
              { text: bodyText, weight: 2 },
              { text: narrative?.body ?? '', weight: 1.6 },
              { text: narrative?.title ?? '', weight: 1 },
              { text: q.tags.join(' '), weight: 1.5 },
              { text: q.solution ?? '', weight: 1 },
              { text: q.answer ?? '', weight: 1 },
            ]);
          })(),
        }));
        qs = scored
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((s) => s.q);
      }

      return qs;
    })(),
  );

  // ── Question label helper ─────────────────────────────────────────────
  const PICKER_PAGE_SIZE = 100;
  let pickerPage = $state(0);
  let pickerPageCount = $derived(Math.max(1, Math.ceil(visibleQuestions.length / PICKER_PAGE_SIZE)));
  let pageQuestions = $derived(visibleQuestions.slice(pickerPage * PICKER_PAGE_SIZE, (pickerPage + 1) * PICKER_PAGE_SIZE));
  $effect(() => { visibleQuestions; pickerPage = 0; });

  function unitLabel(unit: { id: string; name: string }): string {
    return /^\d+$/.test(unit.id) ? `Unit ${unit.id}: ${unit.name}` : unit.name;
  }

  function questionLabel(q: (typeof bank.questions)[0]): string {
    if (q.sectionId && q.unitId && q.classId) {
      const sec = findSection(q.classId, q.unitId, q.sectionId);
      if (sec) return `${q.sectionId} — ${sec.name}`;
    }
    if (q.unitId) return `Unit ${q.unitId}`;
    return '';
  }

  // ── Selected questions (ordered) ──────────────────────────────────────
  let selectedQuestions = $derived(
    (() => {
      const qs = config.selectedIds
        .map((id) => questionsById.get(id))
        .filter(Boolean) as typeof bank.questions;
      // Task groups (lettered questions from Generate) move together.
      return sortQuestions(qs, config, testNarratives);
    })()
  );

  let selectedTotal    = $derived(selectedQuestions.filter((q) => !isBonusQuestion(q.id)).reduce((sum, q) => sum + q.points, 0));
  let pointsTotalPreviewText = $derived(pointsTotalPreview(config, selectedTotal));
  let selectedBonusTotal = $derived(selectedQuestions.filter((q) => isBonusQuestion(q.id)).reduce((sum, q) => sum + q.points, 0));
  let typstSource      = $derived(generateTypst(config, selectedQuestions, testNarratives));
  let testOnlySource   = $derived(generateTypst({ ...config, showAnswerKey: false }, selectedQuestions, testNarratives));
  let answerKeySource  = $derived(generateAnswerKeyPage(config, selectedQuestions, testNarratives));
  let combinedSource   = $derived(generateTypst({ ...config, showAnswerKey: true }, selectedQuestions, testNarratives));
  /** The separate answer key cannot see the test's pages, so read where each MCQ landed first. */
  async function resolveAnswerKey(): Promise<string | null> {
    const positions = await queryValues<McqPosition>(testOnlySource, MCQ_POSITION_SELECTOR);
    return generateAnswerKeyPage(config, selectedQuestions, testNarratives, positions);
  }
  /** Printed labels, e.g. "3" or "4b". */
  let selectedLabels   = $derived(questionLabels(selectedQuestions, { ...config, mcqFirst: false }, testNarratives));
  let firstFrqId       = $derived(selectedQuestions.find((q) => !isMCQ(q))?.id ?? null);
  let hasMcqBoundary   = $derived(config.mcqFirst && selectedQuestions.some(isMCQ) && selectedQuestions.some((q) => !isMCQ(q)));

  function toggleQuestion(id: string) {
    if (config.selectedIds.includes(id)) {
      config.selectedIds = config.selectedIds.filter((x) => x !== id);
      config.bonusQuestionIds = (config.bonusQuestionIds ?? []).filter((x) => x !== id);
    } else {
      config.selectedIds = [...config.selectedIds, id];
    }
  }

  function handlePickerItemKeydown(e: KeyboardEvent, id: string) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    toggleQuestion(id);
  }

  function canDropOnTarget(targetId: string): boolean {
    if (!config.mcqFirst || dragFromId === null) return true;
    const dragged = questionsById.get(dragFromId);
    const target = questionsById.get(targetId);
    if (!dragged || !target) return false;
    return isMCQ(dragged) === isMCQ(target);
  }

  function handleDrop(targetId: string) {
    if (dragFromId === null || dragFromId === targetId) {
      dragFromId = null;
      dragOverId = null;
      return;
    }

    if (!canDropOnTarget(targetId)) {
      dragFromId = null;
      dragOverId = null;
      return;
    }

    const displayIds = selectedQuestions.map((q) => q.id);
    const fromIdx = displayIds.indexOf(dragFromId);
    const toIdx = displayIds.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) {
      dragFromId = null;
      dragOverId = null;
      return;
    }

    const reorderedDisplayIds = [...displayIds];
    const [moved] = reorderedDisplayIds.splice(fromIdx, 1);
    reorderedDisplayIds.splice(toIdx, 0, moved);

    if (!config.mcqFirst) {
      config.selectedIds = reorderedDisplayIds;
    } else {
      const mcqs = reorderedDisplayIds.filter((id) => {
        const q = questionsById.get(id);
        return q ? isMCQ(q) : false;
      });
      const frqs = reorderedDisplayIds.filter((id) => {
        const q = questionsById.get(id);
        return q ? !isMCQ(q) : false;
      });
      config.selectedIds = [...mcqs, ...frqs];
    }

    dragFromId = null;
    dragOverId = null;
  }

  function handleSettingsResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = settingsPanelWidth;
    let dragged = false;

    function onMove(ev: MouseEvent) {
      if (!dragged && Math.abs(ev.clientX - startX) > 4) dragged = true;
      if (dragged) {
        const delta = ev.clientX - startX;
        const newWidth = Math.max(240, Math.min(450, startW + delta));
        settingsPanelWidth = newWidth;
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handlePickerResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = pickerPanelWidth;
    let dragged = false;

    function onMove(ev: MouseEvent) {
      if (!dragged && Math.abs(ev.clientX - startX) > 4) dragged = true;
      if (dragged) {
        const delta = ev.clientX - startX;
        const newWidth = Math.max(240, Math.min(500, startW - delta));
        pickerPanelWidth = newWidth;
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function selectAll() {
    const toAdd = visibleQuestions
      .filter(q => !q.renderError)
      .map((q) => q.id)
      .filter((id) => !config.selectedIds.includes(id));
    config.selectedIds = [...config.selectedIds, ...toAdd];
  }

  function selectRandom(n: number) {
    const pool = visibleQuestions
      .filter(q => !q.renderError)
      .map((q) => q.id)
      .filter((id) => !config.selectedIds.includes(id));
    config.selectedIds = [...config.selectedIds, ...pool.sort(() => Math.random() - 0.5).slice(0, n)];
  }

  function clearSelection() { config.selectedIds = []; }

  // Parse choices out of old-format bodies where grid is embedded as Typst markup.
  function extractChoicesFromBody(body: string): Record<string, string> | null {
    const gridIdx = body.lastIndexOf('\n\n#grid(');
    if (gridIdx === -1) return null;
    const gridPart = body.slice(gridIdx);
    const choices: Record<string, string> = {};
    for (const m of gridPart.matchAll(/\[\*\(([A-E])\)\*\s*(.*?)\]/g)) {
      choices[m[1]] = m[2].trim();
    }
    return Object.keys(choices).length >= 2 ? choices : null;
  }

  function getChoices(q: (typeof bank.questions)[0]): Record<string, string> | null {
    return q.choices && Object.keys(q.choices).length >= 2
      ? q.choices
      : extractChoicesFromBody(q.body);
  }

  function shuffleChoices(q: (typeof bank.questions)[0]) {
    const srcChoices = getChoices(q);
    if (!srcChoices) return;
    // Start from original question choices (not current override) so re-shuffling is fair
    const origLetters = Object.keys(srcChoices);
    for (let i = origLetters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [origLetters[i], origLetters[j]] = [origLetters[j], origLetters[i]];
    }
    const newChoices: Record<string, string> = {};
    let newSolution = '';
    const correctOrig = (q.answer ?? q.solution ?? '').toUpperCase(); // q.answer preferred; q.solution for legacy
    origLetters.forEach((origLetter, idx) => {
      const newLetter = String.fromCharCode(65 + idx);
      newChoices[newLetter] = srcChoices[origLetter];
      if (origLetter === correctOrig) newSolution = newLetter;
    });
    config.choiceOverrides = { ...config.choiceOverrides, [q.id]: { choices: newChoices, solution: newSolution } };
  }

  function resetChoiceOrder(qId: string) {
    const { [qId]: _, ...rest } = config.choiceOverrides;
    config.choiceOverrides = rest;
  }

  function shuffleAllMCQ() {
    for (const q of selectedQuestions) {
      if (getChoices(q)) shuffleChoices(q);
    }
  }



  /**
   * The editable original behind a picker row, or null when there is none.
   *
   * With a workspace connected the picker lists catalog copies, whose ids are
   * rewritten per bank. A copy of the active bank's own question is still
   * editable — it just has to be mapped back to the original the bank holds.
   * Copies belonging to another bank are not, since editing them would not
   * reach the bank that owns them.
   */
  function editableOriginal(q: (typeof bank.questions)[0]): (typeof bank.questions)[0] | null {
    const source = workspaceCatalog.sources[q.id];
    // Look the question up in the bank: a saved test's row may be its frozen copy.
    if (!source) return bank.questions.find((original) => original.id === q.id) ?? null;
    if (source.bankId !== bankWorkspaces.activeBankId) return null;
    return bank.questions.find((original) => original.id === source.questionId) ?? null;
  }

  /** Picker rows edit the bank question itself. */
  function editQuestion(q: (typeof bank.questions)[0]): void {
    const original = editableOriginal(q);
    if (original) openInEditor(original);
  }

  function editTitle(q: (typeof bank.questions)[0]): string {
    if (editableOriginal(q)) return 'Edit this question';
    return 'Switch to the source bank to edit its original question';
  }

  // ── Question hover preview ────────────────────────────────────────────
  let currentTheme = $state(document.documentElement.getAttribute('data-theme') ?? 'auto');
  $effect(() => {
    const obs = new MutationObserver(() => {
      currentTheme = document.documentElement.getAttribute('data-theme') ?? 'auto';
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  });
  let prefersDark = $state(window.matchMedia('(prefers-color-scheme: dark)').matches);

  const MAX_WARM_PREVIEWS = 48;
  const MAX_HOVER_CACHE_ENTRIES = 96;
  const HOVER_PREFETCH_CONCURRENCY = 2;

  // Session-level cache: questionId-theme → compiled SVG
  const hoverCache = new Map<string, string>();
  const hoverInFlight = new Map<string, Promise<string | null>>();
  const hoverPrefetchQueue: string[] = [];
  let hoverPrefetchActive = 0;

  let hoveredQ      = $state<(typeof bank.questions)[0] | null>(null);
  let hoverSvg      = $state<string | null>(null);
  let hoverBusy     = $state(false);
  let hoverY        = $state(0);
  let hoverPopupEl  = $state<HTMLDivElement | null>(null);
  let hoverPopupH   = $state(100);
  let hoverEnterTimer: ReturnType<typeof setTimeout> | null = null;
  let hoverLeaveTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const el = hoverPopupEl;
    if (!el) return;
    const ro = new ResizeObserver(() => { hoverPopupH = el.offsetHeight; });
    ro.observe(el);
    return () => ro.disconnect();
  });

  $effect(() => { imageStore.metadata; hoverCache.clear(); hoverInFlight.clear(); });

  let narrativeCacheKey = $derived(narratives.narratives
    .map((narrative) => `${narrative.id}:${narrative.updatedAt ?? narrative.createdAt}`)
    .join('|'));

  function hoverCacheKey(questionId: string, theme = currentTheme): string {
    return `${questionId}-${theme}-${narrativeCacheKey}`;
  }

  function cacheHoverSvg(key: string, svg: string) {
    if (hoverCache.has(key)) hoverCache.delete(key);
    hoverCache.set(key, svg);
    while (hoverCache.size > MAX_HOVER_CACHE_ENTRIES) {
      const oldest = hoverCache.keys().next().value;
      if (!oldest) break;
      hoverCache.delete(oldest);
    }
  }

  async function ensureHoverPreview(question: (typeof bank.questions)[0]): Promise<string | null> {
    const key = hoverCacheKey(question.id);
    const cached = hoverCache.get(key);
    if (cached) {
      cacheHoverSvg(key, cached);
      return cached;
    }

    const existing = hoverInFlight.get(key);
    if (existing) return existing;

    const work = compileSvg(hoverSource(question))
      .then((result) => {
        const svg = result.svg ?? null;
        if (svg) cacheHoverSvg(key, svg);
        return svg;
      })
      .finally(() => {
        hoverInFlight.delete(key);
      });

    hoverInFlight.set(key, work);
    return work;
  }

  function enqueueHoverPrefetch(question: (typeof bank.questions)[0]) {
    const key = hoverCacheKey(question.id);
    if (hoverCache.has(key) || hoverInFlight.has(key) || hoverPrefetchQueue.includes(question.id)) return;
    hoverPrefetchQueue.push(question.id);
    pumpHoverPrefetchQueue();
  }

  function pumpHoverPrefetchQueue() {
    if (!active) { hoverPrefetchQueue.length = 0; return; }
    while (hoverPrefetchActive < HOVER_PREFETCH_CONCURRENCY && hoverPrefetchQueue.length > 0) {
      const questionId = hoverPrefetchQueue.shift();
      if (!questionId) break;
      const question = questionsById.get(questionId);
      if (!question) continue;
      const key = hoverCacheKey(question.id);
      if (hoverCache.has(key) || hoverInFlight.has(key)) continue;
      hoverPrefetchActive += 1;
      ensureHoverPreview(question).finally(() => {
        hoverPrefetchActive = Math.max(0, hoverPrefetchActive - 1);
        pumpHoverPrefetchQueue();
      });
    }
  }

  function prefetchNeighbors(q: (typeof bank.questions)[0]) {
    const idx = visibleQuestions.findIndex(vq => vq.id === q.id);
    if (idx === -1) return;
    for (const offset of [-2, -1, 1, 2]) {
      const neighbor = visibleQuestions[idx + offset];
      if (!neighbor) continue;
      enqueueHoverPrefetch(neighbor);
    }
  }

  function onPickerEnter(q: (typeof bank.questions)[0], e: MouseEvent) {
    if (hoverLeaveTimer) { clearTimeout(hoverLeaveTimer); hoverLeaveTimer = null; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const targetY = rect.top + rect.height / 2;
    if (hoverEnterTimer) { clearTimeout(hoverEnterTimer); hoverEnterTimer = null; }
    prefetchNeighbors(q);
    const key = hoverCacheKey(q.id);
    if (hoverCache.has(key)) {
      // Already cached — update instantly, no delay
      hoverY = targetY;
      hoveredQ = q;
    } else {
      // Not cached — short delay so quick mouse passes don't flash a spinner
      hoverEnterTimer = setTimeout(() => {
        hoverY = targetY;
        hoveredQ = q;
      }, 100);
    }
  }

  function onPickerLeave() {
    if (hoverEnterTimer) { clearTimeout(hoverEnterTimer); hoverEnterTimer = null; }
    hoverLeaveTimer = setTimeout(() => { hoveredQ = null; }, 80);
  }

  function hoverSource(q: (typeof bank.questions)[0]): string {
    const colors = getThemeColors(currentTheme, prefersDark);
    const resolvedNarrative = resolveQuestionNarrative(q, narratives.narratives);
    const structured = q.parts ? formatParts(q.parts, !resolvedNarrative) : q.body;
    const formattedBody = q.choices && Object.keys(q.choices).length >= 2
      ? formatBody(structured, q.choices) : structured;
    const bodyWithNarrative = resolvedNarrative?.body.trim()
      ? `${resolvedNarrative.body.trim()}\n\n${formattedBody}`
      : formattedBody;
    const graphTypst = q.graphTypst?.trim();
    const body = graphTypst && !(/Recovered graph/i.test(graphTypst) && /Recovered graph/i.test(bodyWithNarrative))
      ? `${bodyWithNarrative}\n\n${graphTypst}`
      : bodyWithNarrative;
    const imports = autoImports(body);
    return `${imports}#set page(width: 13cm, height: auto, margin: 0.75cm, fill: rgb("${colors.bgTypst}"))
#set text(font: "New Computer Modern", size: 13pt, fill: rgb("${colors.textTypst}"))
#set par(justify: false)

${body}`;
  }

  $effect(() => {
    const q = hoveredQ;
    if (!q) { hoverSvg = null; hoverBusy = false; return; }
    const key = hoverCacheKey(q.id);
    const cached = hoverCache.get(key);
    if (cached) {
      cacheHoverSvg(key, cached);
      hoverSvg = cached;
      hoverBusy = false;
      return;
    }
    // Not cached yet — clear stale content immediately so old question doesn't linger
    hoverSvg = null;
    hoverBusy = true;
    let cancelled = false;
    ensureHoverPreview(q).then((svg) => {
      if (cancelled) return;
      hoverBusy = false;
      if (svg) hoverSvg = svg;
    });
    return () => { cancelled = true; };
  });

  $effect(() => {
    // Hidden tabs should not compile speculative previews. Discard obsolete
    // queued work when the page/filter changes; in-flight jobs finish normally.
    hoverPrefetchQueue.length = 0;
    if (!active) return;
    const selected = new Set(config.selectedIds);
    const warmQuestions = [
      ...selectedQuestions,
      ...pageQuestions.filter((q) => !selected.has(q.id)),
    ].slice(0, MAX_WARM_PREVIEWS);

    for (const question of warmQuestions) {
      enqueueHoverPrefetch(question);
    }
  });

  let settingsPanelWidth = $state(300);
  let settingsVisible    = $state(true);
  let pickerPanelWidth   = $state(320);
  let pickerVisible      = $state(true);
  let pickerExpanded = $state(false);

  function togglePickerExpanded() {
    pickerExpanded = !pickerExpanded;
    filtersOpen = false;
    if (hoverEnterTimer) { clearTimeout(hoverEnterTimer); hoverEnterTimer = null; }
    hoveredQ = null;
  }
  function togglePickerVisible() {
    // On narrow screens the picker occupies the workspace instead of a sidebar.
    if (window.matchMedia('(max-width: 760px)').matches) {
      togglePickerExpanded();
    } else {
      pickerVisible = !pickerVisible;
    }
  }

  let pickerTab = $state<'browse' | 'selected'>('browse');
  let dragFromId = $state<string | null>(null);
  let dragOverId = $state<string | null>(null);

  function selectPickerTab(tab: 'browse' | 'selected') {
    pickerTab = tab;
    filtersOpen = false;
    if (hoverEnterTimer) { clearTimeout(hoverEnterTimer); hoverEnterTimer = null; }
    hoveredQ = null;
  }

  function handlePickerTabKeydown(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tab = event.key === 'Home' ? 'browse' : event.key === 'End' ? 'selected'
      : pickerTab === 'browse' ? 'selected' : 'browse';
    selectPickerTab(tab);
    document.getElementById(`picker-tab-${tab}`)?.focus();
  }

  // Responsive: auto-hide picker on small screens (only on initial load)
  $effect.pre(() => {
    const width = window.innerWidth;
    // On initial load of page on small screens, start with picker hidden
    // Users can still show it with the toolbar button
    if (width < 1024) {
      pickerVisible = false;
    }
  });

  let randomCount = $state(5);

  // ── Per-question answer-space overrides ───────────────────────────────
  function getSpace(id: string): number {
    return config.answerSpaceOverrides[id] ?? config.answerSpace;
  }

  function setSpace(id: string, raw: string) {
    const val = parseFloat(raw);
    if (isNaN(val) || val < 0) return;
    if (val === config.answerSpace) {
      // Same as the default — remove the override
      const next = { ...config.answerSpaceOverrides };
      delete next[id];
      config.answerSpaceOverrides = next;
    } else {
      config.answerSpaceOverrides = { ...config.answerSpaceOverrides, [id]: val };
    }
  }

  function clearSpaceOverride(id: string) {
    const next = { ...config.answerSpaceOverrides };
    delete next[id];
    config.answerSpaceOverrides = next;
  }

  function adjustNumberInput(el: HTMLInputElement, delta: number) {
    const current = parseFloat(el.value) || 0;
    const min = parseFloat(el.min) || 0;
    const max = parseFloat(el.max) || Infinity;
    const step = parseFloat(el.step) || 1;
    const newVal = Math.max(min, Math.min(max, current + delta * step));
    el.value = newVal.toString();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Input refs for number controls
  let spaceInput: HTMLInputElement;
  let marginInput: HTMLInputElement;
  let randomInput: HTMLInputElement;

  function hasOverride(id: string): boolean {
    return id in config.answerSpaceOverrides;
  }

  function hasVfill(questionId: string): boolean {
    return config.pageBreakAfter[questionId]?.vfill === true;
  }

  function hasPageBreak(questionId: string): boolean {
    return config.pageBreakAfter[questionId]?.pagebreak === true;
  }

  function isBonusQuestion(questionId: string): boolean {
    return config.bonusQuestionIds?.includes(questionId) ?? false;
  }

  function toggleBonusQuestion(questionId: string): void {
    const ids = new Set(config.bonusQuestionIds ?? []);
    if (ids.has(questionId)) ids.delete(questionId);
    else ids.add(questionId);
    config.bonusQuestionIds = [...ids];
  }

  function setAfterLayout(id: string, next: { vfill?: boolean; pagebreak?: boolean }) {
    const updated = { ...config.pageBreakAfter };
    if (next.vfill || next.pagebreak) {
      updated[id] = {
        vfill: next.vfill ? true : undefined,
        pagebreak: next.pagebreak ? true : undefined,
      };
    } else {
      delete updated[id];
    }
    config.pageBreakAfter = updated;
  }

  function togglePageBreak(id: string) {
    setAfterLayout(id, {
      vfill: hasVfill(id),
      pagebreak: !hasPageBreak(id),
    });
  }

  function toggleVfill(id: string) {
    const enabling = !hasVfill(id);
    setAfterLayout(id, {
      vfill: enabling,
      pagebreak: hasPageBreak(id),
    });
    if (enabling) {
      setSpace(id, '0');
    } else if (getSpace(id) === 0) {
      clearSpaceOverride(id);
    }
  }

  // ── Custom preamble ───────────────────────────────────────────────────
  const customPreambleActive = $derived(config.customPreamble !== undefined);

  function enableCustomPreamble() {
    config.customPreamble = generatePreamble(config);
  }

  function disableCustomPreamble() {
    config.customPreamble = undefined;
  }

  // Recovery is synchronous; named tests are committed through the library
  // after a short debounce, including their frozen questions and image assets.
  $effect(() => {
    JSON.stringify(config);
    untrack(() => testEditor.checkpoint());
  });

  $effect(() => {
    if (!active) untrack(() => void testEditor.flush());
  });

  $effect(() => {
    const checkpoint = () => testEditor.checkpoint();
    const visibility = () => {
      if (document.visibilityState === 'hidden') void testEditor.flush();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      checkpoint();
      if (testEditor.recoveryError) { event.preventDefault(); event.returnValue = ''; }
    };
    const keydown = (event: KeyboardEvent) => {
      if (active && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('pagehide', checkpoint);
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('keydown', keydown);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      checkpoint();
      window.removeEventListener('pagehide', checkpoint);
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('keydown', keydown);
      document.removeEventListener('visibilitychange', visibility);
    };
  });

  // ── Test library handlers ──────────────────────────────────────────────────
  async function loadSavedTest(id: string) {
    await testEditor.open(id);
  }

  function handleSaveAs() {
    saveDialogStore.open(config, allClasses, selectedClassIds.length === 1 ? selectedClassIds[0] : '', handleSaveConfirm);
  }

  async function handleSaveConfirm(result: {
    name: string;
    classId: string | null;
    unitId: string | null;
    testType: TestType | null;
  }) {
    if (await testEditor.saveAs(result)) saveDialogStore.close();
  }

  async function handleSave() {
    if (!activeTestId) { handleSaveAs(); return; }
    await testEditor.flush();
  }

  async function handleNewTest(resume = false) {
    const unnamed = activeTestId ? testEditor.unnamedDraft : config;
    const defaults = appSettings.createDefaultTestConfig(initialTestTitle());
    if (!resume && unnamed && JSON.stringify({ ...unnamed, date: '' }) !== JSON.stringify({ ...defaults, date: '' })
      && !window.confirm('Start a new test and discard the unnamed draft? Use Save As first if you want to keep it.')) return;
    if (!await testEditor.newTest(defaults, resume)) return;
    selectPickerTab('browse');
  }

  function handleDeleteSaved(id: string) {
    testEditor.delete(id);
  }

  function beginRename(entry: SavedTest) {
    // Open the save dialog to edit the entry
    saveDialogStore.openForEdit(entry, allClasses, (result) => {
      try {
        const previousType = entry.testType;
        testLibrary.updateMetadata(entry.id, {
          name: result.name,
          classId: result.classId,
          unitId: result.unitId,
          testType: result.testType,
        });
        if (result.testType !== previousType) {
          gradebook.updateAssessmentsForSavedTest(entry.id, { testType: result.testType });
        }
      } catch (e) {
        console.error('Edit failed:', e);
      }
    });
  }

  function commitRename() {
    if (renamingId) testLibrary.rename(renamingId, renameValue);
    renamingId = null;
  }

  function startToolbarRename() {
    if (activeTestId) {
      const entry = testLibrary.get(activeTestId);
      if (entry) {
        toolbarNameInput = entry.name;
        editingToolbarName = true;
        tick().then(() => toolbarNameInputEl?.focus());
      }
    }
  }

  function commitToolbarRename() {
    if (activeTestId && toolbarNameInput.trim()) {
      testLibrary.rename(activeTestId, toolbarNameInput.trim());
    }
    editingToolbarName = false;
    toolbarNameInput = '';
  }

  function addSavedTestToGradebook(entry: SavedTest) {
    if (!appSettings.gradebookExperimentalEnabled) return;
    if (gradebook.sections.length === 0) {
      window.alert('Create a Gradebook section before adding saved tests.');
      window.location.hash = '/gradebook';
      return;
    }

    const candidates = gradebook.sections.filter((section) => !section.archivedAt && !section.trashedAt)
      .sort((left, right) => Number(savedTestFitsSection(entry, right)) - Number(savedTestFitsSection(entry, left)));
    if (candidates.length === 0) {
      window.alert('Create or restore an active Gradebook section to add this test.');
      return;
    }
    const section = chooseGradebookSection(candidates);
    if (!section) return;
    const assessment = gradebook.createAssessmentFromSavedTest(entry, bank.questions, section.id);
    window.alert(`Added "${assessment.savedTestName}" to ${section.name}.`);
    window.location.hash = '/gradebook';
  }

  function chooseGradebookSection(candidates: GradebookSection[]) {
    if (candidates.length === 1) return candidates[0];

    const promptText = [
      'Add this saved test to which gradebook section?',
      ...candidates.map((section, index) => `${index + 1}. ${section.name}${section.termLabel ? ` (${section.termLabel})` : ''}`),
    ].join('\n');
    const answer = window.prompt(promptText, '1');
    if (answer === null) return null;
    const index = Number(answer) - 1;
    return Number.isInteger(index) ? candidates[index] ?? null : null;
  }
</script>

<div class="build-tab" class:picker-expanded={pickerExpanded}>
  <!-- Toolbar -->
  <div id="tut-test-toolbar" class="test-toolbar">
    <div class="toolbar-left">
      {#if !pickerExpanded}
      <button class="ghost small" onclick={() => (savedPanelVisible = !savedPanelVisible)} title={savedPanelVisible ? 'Close saved tests panel' : 'Open saved tests panel'}>
        ☰ Saved Tests
      </button>
      <button class="ghost small" aria-expanded={settingsVisible} onclick={() => (settingsVisible = !settingsVisible)}>
        {settingsVisible ? 'Hide settings' : 'Show settings'}
      </button>
      <button class="ghost small" aria-expanded={pickerVisible} onclick={togglePickerVisible}>
        {pickerVisible ? 'Hide questions' : 'Show questions'}
      </button>
      {/if}
    </div>
    <div class="toolbar-center">
      {#if activeTestId && editingToolbarName}
        <input
          bind:this={toolbarNameInputEl}
          class="toolbar-name-input"
          type="text"
          bind:value={toolbarNameInput}
          onblur={commitToolbarRename}
          onkeydown={(e) => {
            if (e.key === 'Enter') commitToolbarRename();
            if (e.key === 'Escape') { editingToolbarName = false; toolbarNameInput = ''; }
          }}
        />
      {:else if activeTestId}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span
          class="test-name"
          role="button"
          tabindex="0"
          ondblclick={startToolbarRename}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') startToolbarRename(); }}
          title="Double-click to rename"
        >
          {testLibrary.get(activeTestId)?.name ?? 'Recovered test'}
        </span>
      {:else}
        <span class="test-name muted">Unsaved test</span>
      {/if}
    </div>
    <div class="toolbar-right">
      <span class="save-status" role="status" title="Named tests save automatically. A local recovery copy is kept immediately; connected folders and sync keep their existing save status.">{testEditor.status}</span>
      {#if activeTestId && testEditor.unnamedDraft}
        <button class="ghost small" onclick={() => handleNewTest(true)} disabled={testEditor.transitioning}>Resume draft</button>
      {/if}
      {#if activeTestId}
        <button class="ghost small" onclick={handleSave} disabled={testEditor.transitioning || (!isDirty && !testEditor.error && !testEditor.recoveryError)} title="Save now (Ctrl/Cmd+S). Changes also save automatically.">Save</button>
      {/if}
      <button class="ghost small" onclick={handleSaveAs} disabled={testEditor.transitioning} title="Save the current test configuration with a name">Save As…</button>
      <button class="ghost small" onclick={() => handleNewTest()} disabled={testEditor.transitioning} title="Start a new unsaved test">New</button>
    </div>
  </div>

  {#if testEditor.error || testEditor.recoveryError}
    <div class="save-error" role="alert">
      <span>{testEditor.recoveryError || testEditor.error}</span>
      <button class="ghost small" onclick={() => testEditor.flush()}>Retry save</button>
    </div>
  {/if}

  <!-- Saved Tests Panel + Three-Pane Layout -->
  <div class="view-area" inert={testEditor.transitioning} aria-busy={testEditor.transitioning}>
    {#if savedPanelVisible}
      <div class="saved-panel" transition:slide={{ axis: 'x', duration: 200 }}>

        {#if testLibrary.tests.length === 0}
          <div class="saved-empty">No saved tests yet. Use "Save As…" to save the current test.</div>
        {:else}
          {#each [...testLibrary.byClass.entries()] as [classId, entries] (classId ?? '__null__')}
            {@const groupKey = classId ?? '__null__'}
            {@const isExpanded = expandedTestGroups.has(groupKey)}
            {@const className = classId ? (allClasses.find(c => c.id === classId)?.name ?? classId) : 'Uncategorized'}
            <div class="saved-group">
              <div class="saved-group-header">
                <button
                  class="group-toggle"
                  onclick={() => toggleTestGroup(classId)}
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
                <span class="group-name">{className}</span>
                <span class="group-count">{entries.length}</span>
              </div>

              {#if isExpanded}
                {#each entries as entry (entry.id)}
                  <div class="saved-item" class:active={activeTestId === entry.id}>
                    {#if renamingId === entry.id}
                      <input
                        class="rename-input"
                        bind:value={renameValue}
                        onblur={commitRename}
                        onkeydown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') renamingId = null; }}
                      />
                    {:else}
                      <button class="saved-item-name" onclick={() => loadSavedTest(entry.id)} title="Load {entry.name}">
                        <span class="item-title">{entry.name}</span>
                        <div class="saved-item-meta">
                          {#if entry.unitId}
                            {@const cls = allClasses.find(c => c.id === entry.classId)}
                            {@const unit = cls?.units.find(u => u.id === entry.unitId)}
                            {#if unit}<span class="saved-item-unit">{unit.name}</span>{/if}
                          {/if}
                          {#if entry.testType}
                            <span class="type-badge type-{entry.testType}">{entry.testType}</span>
                          {/if}
                        </div>
                      </button>
                      <div class="saved-item-actions">
                        {#if appSettings.gradebookExperimentalEnabled}
                          <button class="ghost tiny" onclick={() => addSavedTestToGradebook(entry)} title="Add to Gradebook">＋</button>
                        {/if}
                        <button class="ghost tiny" onclick={() => beginRename(entry)} title="Edit">✎</button>
                        <button class="ghost tiny danger-text" onclick={() => handleDeleteSaved(entry.id)} title="Delete">✕</button>
                      </div>
                    {/if}
                  </div>
                {/each}
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    {/if}

    <div class="view">
      <!-- LEFT PANE: Test Settings (Hideable) -->
  {#if settingsVisible}
    <div class="settings-panel" style="width: {settingsPanelWidth}px">
      <div class="settings-content">

      <!-- Test Info Section -->
      <section class="settings-section">
        <h2 class="section-header">Test Info</h2>
        <div class="section-body">
          <div class="field">
            <label for="t-title">Title</label>
            <input id="t-title" type="text" bind:value={config.title} />
          </div>
          <div class="field">
            <label for="t-subtitle">Test name <span class="field-hint">(optional)</span></label>
            <input id="t-subtitle" type="text" placeholder="Test 2" bind:value={config.subtitle} />
          </div>
          <div class="field">
            <label for="t-instr">Instructions</label>
            <input id="t-instr" type="text" bind:value={config.instructions} />
          </div>
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={config.showDate} />
            Include date line
          </label>
          {#if config.showDate}
            <div class="field">
              <label for="t-date">Date</label>
              <input id="t-date" type="text" bind:value={config.date} />
            </div>
          {/if}
        </div>
      </section>

      <!-- Output Section -->
      <section class="settings-section">
        <h2 class="section-header">Output</h2>
        <div class="section-body">
          <div class="field">
            <label for="t-space">Answer space <span class="field-hint">(cm)</span></label>
            <div class="number-input-wrap">
              <input id="t-space" type="number" min="0" max="20" step="0.5" bind:value={config.answerSpace} bind:this={spaceInput} />
              <div class="number-buttons">
                <button class="num-adjust" onclick={() => adjustNumberInput(spaceInput, 1)} title="Increase">+</button>
                <button class="num-adjust" onclick={() => adjustNumberInput(spaceInput, -1)} title="Decrease">−</button>
              </div>
            </div>
          </div>
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={config.mcqFirst} />
            MCQs first
          </label>
          <label class="checkbox-row" title="A box left of each multiple-choice question for the student to write their letter">
            <input type="checkbox" checked={config.mcqAnswerBoxes ?? false} onchange={(e) => (config.mcqAnswerBoxes = e.currentTarget.checked)} />
            MCQ answer boxes
          </label>
          <label class="checkbox-row" title="Like LaTeX fleqn: display equations sit 1 inch in from the left edge of the text instead of centred">
            <input type="checkbox" checked={config.flushLeftMath !== false} onchange={(e) => (config.flushLeftMath = e.currentTarget.checked)} />
            Flush-left display math
          </label>
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={config.showPoints} />
            Show point values
          </label>
          {#if config.showPoints}
            <label class="checkbox-row indented">
              <input type="checkbox" bind:checked={config.pointsBold} />
              Bold point values
            </label>
          {/if}
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={config.showPointsTotal} />
            Show points total
          </label>
          {#if config.showPointsTotal}
            <div class="field indented">
              <label for="t-total-where">Place it</label>
              <select id="t-total-where" bind:value={config.pointsTotalPlacement}>
                <option value="header">On the title line</option>
                <option value="instructions">Under the instructions</option>
                <option value="end">At the end of the test</option>
              </select>
            </div>
            <div class="field indented">
              <label for="t-total-text">Wording <span class="field-hint">(&#123;total&#125; is the number)</span></label>
              <input
                id="t-total-text"
                type="text"
                placeholder="Total: &#123;total&#125; points"
                bind:value={config.pointsTotalText}
              />
            </div>
            <p class="total-preview indented">Prints as: {pointsTotalPreviewText}</p>
          {/if}
        </div>
      </section>

      <!-- Answer Key Section -->
      <section class="settings-section">
        <h2 class="section-header">Answer Key</h2>
        <div class="section-body">
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={config.showAnswerKey} />
            Include answer key
          </label>
          {#if config.showAnswerKey}
            <label class="checkbox-row indented">
              <input type="checkbox" bind:checked={config.mcqFullSolutions} />
              Include full MCQ solutions
            </label>
          {/if}
          <label class="checkbox-row" title="Adds a last page with each MCQ answer level with its question, one column per test page. Hold it behind the test so the column for that page shows beside the answer boxes.">
            <input type="checkbox" checked={config.answerStrip ?? false} onchange={(e) => (config.answerStrip = e.currentTarget.checked)} />
            Answer strip page
          </label>
        </div>
      </section>

      <!-- Formatting Section -->
      <section class="settings-section">
        <h2 class="section-header">Formatting</h2>
        <div class="section-body">
          <div class="field-row">
            <div class="field">
              <label for="t-fontsize">Font size</label>
              <select id="t-fontsize" bind:value={config.fontSize}>
                <option value={10}>10 pt</option>
                <option value={11}>11 pt</option>
                <option value={12}>12 pt</option>
              </select>
            </div>
            <div class="field">
              <label for="t-paper">Paper</label>
              <select id="t-paper" bind:value={config.paper}>
                <option value="us-letter">US Letter</option>
                <option value="us-legal">US Legal</option>
                <option value="us-ledger">US Ledger / Tabloid</option>
                <option value="a3">A3</option>
                <option value="a4">A4</option>
                <option value="a5">A5</option>
                <option value="b4">B4</option>
                <option value="b5">B5</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label for="t-page-numbers">Page numbers</label>
            <select id="t-page-numbers" value={config.pageNumbers ?? 'none'} onchange={(e) => (config.pageNumbers = e.currentTarget.value as PageNumberPlacement)}
              title="Inside and outside alternate sides for double-sided printing: outside is right on odd pages and left on even pages">
              <option value="none">None</option>
              <option value="inside">Bottom inside</option>
              <option value="centre">Bottom centre</option>
              <option value="outside">Bottom outside</option>
            </select>
          </div>
          <div class="field">
            <label for="t-margin">Margin <span class="field-hint">(inches)</span></label>
            <div class="number-input-wrap">
              <input id="t-margin" type="number" min="0.5" max="2" step="0.25" bind:value={config.marginIn} bind:this={marginInput} />
              <div class="number-buttons">
                <button class="num-adjust" onclick={() => adjustNumberInput(marginInput, 1)} title="Increase">+</button>
                <button class="num-adjust" onclick={() => adjustNumberInput(marginInput, -1)} title="Decrease">−</button>
              </div>
            </div>
          </div>
          <div class="preamble-section">
            {#if !customPreambleActive}
              <button class="ghost small" onclick={enableCustomPreamble} title="Open the raw Typst preamble for manual editing — bypasses all form controls">Edit preamble manually…</button>
            {:else}
              <div class="preamble-header">
                <span class="preamble-label">Custom preamble</span>
                <button class="ghost small danger-text" onclick={disableCustomPreamble} title="Discard the custom preamble and restore automatic settings">Reset</button>
              </div>
              <textarea
                class="preamble-editor"
                spellcheck={false}
                value={config.customPreamble}
                oninput={(e) => (config.customPreamble = e.currentTarget.value)}
              ></textarea>
            {/if}
          </div>
        </div>
      </section>

    </div>
  </div>
  {/if}

  <!-- Resize only; visibility is controlled by the toolbar. -->
  {#if settingsVisible}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resize-handle settings-divider" title="Drag to resize settings" onmousedown={handleSettingsResize}></div>
  {/if}

  <!-- MIDDLE PANE: Preview -->
  <div class="preview-panel" inert={pickerExpanded} aria-hidden={pickerExpanded}>
    <Preview source={typstSource} {testOnlySource} {answerKeySource} {combinedSource} {resolveAnswerKey} fileName={exportBaseName(config.title, config.subtitle)} />
  </div>

  <!-- Resize only; visibility is controlled by the toolbar. -->
  {#if pickerVisible}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resize-handle picker-divider" title="Drag to resize questions" onmousedown={handlePickerResize}></div>
  {/if}

  <!-- RIGHT PANE: Question Picker + Selected Questions (Conditionally Visible) -->
  {#if pickerVisible || pickerExpanded}
    <div id="tut-test-picker" class="picker-panel" style="width: {pickerPanelWidth}px" onmouseleave={() => { if (hoverEnterTimer) { clearTimeout(hoverEnterTimer); hoverEnterTimer = null; } hoveredQ = null; }}>
      <div class="picker-heading">
      <div class="picker-tabs" role="tablist" aria-label="Questions">
        <button id="picker-tab-browse" role="tab" aria-selected={pickerTab === 'browse'}
          aria-controls="picker-browse" tabindex={pickerTab === 'browse' ? 0 : -1}
          onclick={() => selectPickerTab('browse')} onkeydown={handlePickerTabKeydown}>Browse</button>
        <button id="picker-tab-selected" role="tab" aria-selected={pickerTab === 'selected'}
          aria-controls="picker-selected" tabindex={pickerTab === 'selected' ? 0 : -1}
          onclick={() => selectPickerTab('selected')} onkeydown={handlePickerTabKeydown}>Selected ({selectedQuestions.length})</button>
      </div>
      <button class="picker-expand" aria-label={pickerExpanded ? 'Return to preview' : 'Expand question picker'}
        title={pickerExpanded ? 'Return to preview' : 'Expand question picker'} aria-pressed={pickerExpanded}
        onclick={togglePickerExpanded}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          {#if pickerExpanded}
            <path d="M3 3l6 6M9 3v6H3M21 21l-6-6M15 21v-6h6" />
          {:else}
            <path d="M9 9L3 3M3 9V3h6M15 15l6 6M21 15v6h-6" />
          {/if}
        </svg>
      </button>
      </div>
      <div class="picker-summary" role="status">
        {selectedQuestions.length} question{selectedQuestions.length === 1 ? '' : 's'} · {selectedTotal} point{selectedTotal === 1 ? '' : 's'}
        {#if selectedBonusTotal > 0} · +{selectedBonusTotal} bonus{/if}
      </div>
      <!-- Keep both panels mounted so each list retains its scroll position. -->
      <div id="picker-selected" role="tabpanel" aria-labelledby="picker-tab-selected"
        class="picker-section selected-section" hidden={pickerTab !== 'selected'} tabindex="0">
        {#if selectedQuestions.length > 0}
          <div class="selected-list">
            {#each selectedQuestions as q, i (q.id)}
              {#if hasMcqBoundary && i === 0 && isMCQ(q)}
                <div class="sel-group-label"><span>MCQ</span></div>
              {/if}
              {#if hasMcqBoundary && firstFrqId === q.id}
                <div class="sel-group-label"><span>FRQ</span></div>
              {/if}
              <div
                class="sel-item"
                class:drag-over={dragOverId === q.id}
                class:dragging={dragFromId === q.id}
                class:group-boundary={hasMcqBoundary && firstFrqId === q.id}
                draggable={true}
                ondragstart={(e) => {
                  dragFromId = q.id;
                  e.dataTransfer?.setData('text/plain', q.id);
                  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                }}
                ondragover={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = canDropOnTarget(q.id) ? 'move' : 'none';
                  }
                  dragOverId = canDropOnTarget(q.id) ? q.id : null;
                }}
                ondragleave={() => (dragOverId = null)}
                ondrop={(e) => { e.preventDefault(); handleDrop(q.id); }}
                ondragend={() => { dragFromId = null; dragOverId = null; }}
                onmouseenter={(e) => onPickerEnter(q, e)}
                onmouseleave={onPickerLeave}
              >
                <span class="drag-handle">⠿</span>
                <div class="sel-item-top">
                  <span class="sel-num">{selectedLabels.get(q.id) ?? i + 1}</span>
                  <div class="sel-info">
                    <span class="sel-body">{q.body}</span>
                  </div>
                </div>
                <div class="sel-actions">
                  {#if getChoices(q)}
                    <button
                      class="ghost tiny"
                      class:shuffled={!!config.choiceOverrides[q.id]}
                      onclick={() => shuffleChoices(q)}
                      title="Shuffle answer choice order"
                    >⟳</button>
                  {/if}
                  <button
                    class="ghost tiny"
                    onclick={() => testQuestionEditor.start(q, i + 1)}
                    title="Edit this question; save it for this test only, or in its original bank too"
                    aria-label="Edit question {i + 1}"
                  >✎</button>
                  <button
                    class="ghost tiny"
                    class:active={isBonusQuestion(q.id)}
                    onclick={() => toggleBonusQuestion(q.id)}
                    title={isBonusQuestion(q.id) ? 'Mark as a regular question' : 'Mark as a bonus question'}
                  >B</button>
                  <button class="ghost tiny" onclick={() => toggleQuestion(q.id)} title="Remove from test">✕</button>
                </div>
                  <div class="sel-space">
                    <div class="sel-space-control">
                      <div class="sel-space-wrap">
                        <label class="space-value">
                        <input
                          type="number"
                          min="0"
                          max="20"
                          step="0.5"
                          class:overridden={hasOverride(q.id)}
                          value={getSpace(q.id)}
                          oninput={(e) => {
                            setSpace(q.id, e.currentTarget.value);
                          }}
                            aria-label="Answer space in centimeters"
                            title="Answer space in centimeters"
                          />
                          <span class="space-unit">cm</span>
                        </label>
                          <div class="space-buttons">
                            <button
                              class="space-adjust"
                              onclick={() => {
                                setSpace(q.id, Math.min(20, getSpace(q.id) + 0.5).toString());
                              }}
                              title="Increase answer space"
                            >+</button>
                            <button
                              class="space-adjust"
                              onclick={() => {
                                setSpace(q.id, Math.max(0, getSpace(q.id) - 0.5).toString());
                              }}
                              title="Decrease answer space"
                            >−</button>
                          </div>
                        </div>
                      <div class="space-mode-buttons">
                        <button
                          class="space-fill"
                          class:active={hasVfill(q.id)}
                          aria-pressed={hasVfill(q.id)}
                          onclick={() => toggleVfill(q.id)}
                          title={hasVfill(q.id) ? 'Remove fill-to-bottom spacing after this question' : 'Expand the remaining space on the page after this question'}
                        >
                          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                            <path d="M5 2.5h6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                            <path d="M5 13.5h6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                            <path d="M8 4.2v7.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                            <path d="M6.3 10.1 8 11.8l1.7-1.7" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </button>
                        <button
                          class="space-break"
                          class:active={hasPageBreak(q.id)}
                          aria-pressed={hasPageBreak(q.id)}
                          onclick={() => togglePageBreak(q.id)}
                          title={hasPageBreak(q.id) ? 'Remove page break after this question' : 'Insert a page break after this question'}
                        >
                          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                            <path d="M4 2.5h5l3 3V13a1 1 0 0 1-1 1H4.8A1.8 1.8 0 0 1 3 12.2V4.3a1.8 1.8 0 0 1 1.8-1.8Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
                            <path d="M9 2.5V6h3.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
                            <path d="M2.5 8h11" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="1.6 1.6"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
              </div>
            {/each}
          </div>
          <div class="selected-footer">
            <button class="ghost small" onclick={clearSelection} title="Remove all questions from this test">Clear all</button>
            {#if selectedQuestions.some(q => !!getChoices(q))}
              <button class="ghost small" onclick={shuffleAllMCQ} title="Randomize answer choice order for all multiple-choice questions">Shuffle MCQ</button>
            {/if}
          </div>
        {:else}
          <div class="picker-empty">
            <p>No questions selected yet.</p>
            <button class="ghost small" onclick={() => selectPickerTab('browse')}>Browse questions</button>
          </div>
        {/if}
      </div>

      <div id="picker-browse" role="tabpanel" aria-labelledby="picker-tab-browse"
        class="picker-section selector-section" hidden={pickerTab !== 'browse'} tabindex="0">
          <!-- Filters -->
          <div class="picker-filters" inert={filtersOpen}>
            {#if workspaceCatalog.banks.length}
              <ScopeSelect label="Banks" allLabel="All workspace banks" options={bankOptions} bind:selected={selectedBankIds} />
            {/if}
            <ScopeSelect label="Classes" allLabel="All classes" options={classOptions} bind:selected={selectedClassIds} />
            <input type="search" class="picker-search" placeholder="Search questions…" aria-label="Search questions" bind:value={pickerSearch} />
            <button id="picker-filter-toggle" aria-expanded={filtersOpen} aria-controls="picker-filter-panel"
              onclick={() => filtersOpen = !filtersOpen}>Filters{filterChips.length ? ` (${filterChips.length})` : ''}</button>
          </div>
          {#if filterChips.length || selectedClassIds.length || selectedBankIds.length || pickerSearch}
            <div class="filter-chips" inert={filtersOpen}>
              {#each filterChips as chip (chip.kind + chip.key)}
                <button class="filter-chip" title={chip.label} aria-label={`Remove ${chip.label} filter`}
                  onclick={() => removeFilter(chip.kind, chip.key)}>{chip.label} <span aria-hidden="true">×</span></button>
              {/each}
              <button class="ghost small" onclick={clearFilters}>Clear filters</button>
            </div>
          {/if}
          {#if filtersOpen}
            <section id="picker-filter-panel" class="filter-panel" aria-label="Question filters">
              <div class="filter-panel-head">
                <strong>Filters</strong>
                <span>{visibleQuestions.length} matching</span>
                <button id="picker-filters-done" onclick={closeFilters}>Done</button>
              </div>
              <p class="filter-help">Choose any in each group. Leave a group unchecked to include all.</p>
              <div class="filter-panel-body">
                <fieldset>
                  <legend>Units</legend>
                  <div class="filter-options">
                    {#each filterUnits as unit (unit.key)}
                      <label class="tag-option"><input type="checkbox" checked={selectedUnits.includes(unit.key)}
                        onchange={() => selectedUnits = toggleFilter(selectedUnits, unit.key)} />{unit.label}</label>
                    {:else}<p class="tag-empty">No units in this class.</p>{/each}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Sections</legend>
                  <div class="filter-options">
                    {#each filterSections as section (section.key)}
                      <label class="tag-option"><input type="checkbox" checked={selectedSections.includes(section.key)}
                        onchange={() => selectedSections = toggleFilter(selectedSections, section.key)} />{section.label}</label>
                    {:else}<p class="tag-empty">No sections in these units.</p>{/each}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Question type</legend>
                  {#each [{ id: 'mcq', label: 'Multiple choice' }, { id: 'frq', label: 'Free response' }] as type}
                    <label class="tag-option"><input type="checkbox" checked={selectedTypes.includes(type.id)}
                      onchange={() => selectedTypes = toggleFilter(selectedTypes, type.id)} />{type.label}</label>
                  {/each}
                </fieldset>
                <fieldset>
                  <legend>Tags</legend>
                  <input class="tag-menu-search" type="search" placeholder="Find a tag…" aria-label="Find a tag" bind:value={tagSearch} />
                  <div class="tag-mode">
                    <button class:active={tagMatchAll} aria-pressed={tagMatchAll} onclick={() => tagMatchAll = true}>Match all tags</button>
                    <button class:active={!tagMatchAll} aria-pressed={!tagMatchAll} onclick={() => tagMatchAll = false}>Match any tag</button>
                  </div>
                  <div class="filter-options">
                    {#each visibleTagOptions as option (option.tag)}
                      <label class="tag-option"><input type="checkbox" checked={selectedTags.includes(option.tag)} onchange={() => toggleTag(option.tag)} />
                        <span class="tag-option-name">{option.tag}</span><span class="tag-option-count">{option.count}</span></label>
                    {:else}<p class="tag-empty">No tags match.</p>{/each}
                  </div>
                </fieldset>
              </div>
              <div class="filter-panel-foot"><button class="ghost small" onclick={clearFilters}>Clear filters</button></div>
            </section>
          {/if}

          <!-- Toolbar -->
          <div class="picker-toolbar" inert={filtersOpen}>
          <span class="q-count">{visibleQuestions.length} q</span>
          <div class="picker-actions">
            <button class="ghost small" onclick={selectAll} disabled={visibleQuestions.length === 0} title="Add all matching questions across pages to the test">
              All
            </button>
            <div class="random-group">
              <button class="ghost small" onclick={() => selectRandom(randomCount)} disabled={visibleQuestions.length === 0} title="Add {randomCount} randomly selected questions from all matching pages">
                Random
              </button>
              <div class="number-input-wrap">
                <input type="number" min="1" max={visibleQuestions.length || 1} bind:value={randomCount} bind:this={randomInput} title="Count" />
                <div class="number-buttons">
                  <button class="num-adjust" onclick={() => adjustNumberInput(randomInput, 1)} title="Increase">+</button>
                  <button class="num-adjust" onclick={() => adjustNumberInput(randomInput, -1)} title="Decrease">−</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {#if questionPool.length === (config.ownQuestions?.length ?? 0) && visibleQuestions.length === 0}
          <div class="picker-empty">Add questions to the bank first</div>
        {:else if visibleQuestions.length === 0}
          <div class="picker-empty">No questions match</div>
        {:else}
          <div class="picker-list" inert={filtersOpen}>
          {#each pageQuestions as q (q.id)}
            {@const checked = config.selectedIds.includes(q.id)}
            <div
              class="picker-item"
              class:checked
              class:errored={!!q.renderError}
              role="checkbox"
              aria-checked={checked}
              tabindex="0"
              onclick={() => toggleQuestion(q.id)}
              onkeydown={(e) => handlePickerItemKeydown(e, q.id)}
              onmouseenter={(e) => onPickerEnter(q, e)}
              onmouseleave={onPickerLeave}
            >
              <input
                type="checkbox"
                {checked}
                aria-label="Include question in test"
                onclick={(e) => e.stopPropagation()}
                onchange={() => toggleQuestion(q.id)}
              />
              <div class="picker-info">
                <span class="picker-body">{pickerExpanded ? q.body : q.body.slice(0, 60)}{!pickerExpanded && q.body.length > 60 ? '…' : ''}</span>
                {#if workspaceCatalog.sources[q.id]}<small>{workspaceCatalog.sources[q.id].bankName}</small>{/if}
              </div>
              <span class="picker-pts">{q.points}pt</span>
              <button
                class="ghost tiny picker-edit"
                type="button"
                onclick={(e) => { e.stopPropagation(); editQuestion(q); }}
                disabled={!editableOriginal(q)}
                title={editTitle(q)}
              >✎</button>
            </div>
          {/each}
        </div>
        {#if pickerPageCount > 1}
          <nav inert={filtersOpen} class="picker-pagination" aria-label="Question pages">
            <button class="ghost small" aria-label="Previous question page" disabled={pickerPage === 0} onclick={() => pickerPage -= 1}>Previous</button>
            <span>{pickerPage * PICKER_PAGE_SIZE + 1}–{Math.min((pickerPage + 1) * PICKER_PAGE_SIZE, visibleQuestions.length)} of {visibleQuestions.length}</span>
            <button class="ghost small" aria-label="Next question page" disabled={pickerPage >= pickerPageCount - 1} onclick={() => pickerPage += 1}>Next</button>
          </nav>
        {/if}
      {/if}
      </div>
    </div>
  {/if}
</div>
</div>

{#if hoveredQ && (hoverSvg || hoverBusy)}
  {@const topPx = Math.max(12, Math.min(window.innerHeight - hoverPopupH - 12, hoverY - hoverPopupH / 2))}
  <div
    bind:this={hoverPopupEl}
    class="hover-preview"
    use:portal
    style="top: {topPx}px; right: {pickerExpanded ? 16 : pickerPanelWidth + 10}px"
    onmouseenter={() => { if (hoverLeaveTimer) { clearTimeout(hoverLeaveTimer); hoverLeaveTimer = null; } }}
    onmouseleave={onPickerLeave}
    role="tooltip"
  >
    {#if hoverSvg}
      <div class="hover-svg">{@html hoverSvg}</div>
    {:else}
      <div class="hover-spinner"><div class="spinner"></div></div>
    {/if}
    {#if hoveredQ.tags?.length}
      <ul class="hover-tags" aria-label="Tags">
        {#each hoveredQ.tags as tag (tag)}<li>{tag}</li>{/each}
      </ul>
    {/if}
  </div>
{/if}


</div>

<style>
  .picker-pagination { display: flex; align-items: center; justify-content: space-between; gap: .4rem; padding: .4rem; flex-shrink: 0; font-size: .8rem; }
  /* ── Build Tab Wrapper ───────────────────────────────────────────── */
  .build-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ── Toolbar ────────────────────────────────────────────────────── */
  .test-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.75rem;
    height: 38px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
    background: var(--bg-2);
  }

  .toolbar-left  { display: flex; gap: 0.35rem; align-items: center; }
  .toolbar-center { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.4rem; overflow: hidden; }
  .toolbar-right { display: flex; gap: 0.35rem; align-items: center; }

  .test-name {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 300px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 2px;
    transition: background 0.15s;
  }

  .test-name:hover {
    background: var(--bg-3);
  }

  .test-name.muted { color: var(--text-2); font-weight: 400; }



  .toolbar-name-input {
    max-width: 300px;
    padding: 4px 8px;
    border: 1px solid var(--primary);
    border-radius: 3px;
    background: var(--bg-input);
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
  }

  .toolbar-name-input:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }

  .save-status { font-size: 12px; color: var(--text-2); }
  .save-error { display: flex; gap: 12px; align-items: center; padding: 8px 16px; color: var(--danger, #c2410c); background: var(--bg-2); }

  /* ── View Area ──────────────────────────────────────────────────── */
  .view-area {
    flex: 1;
    display: flex;
    overflow: hidden;
    height: 100%;
    width: 100%;
  }

  /* ── Saved Tests Panel ──────────────────────────────────────────– */
  .saved-panel {
    width: 220px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border-right: 1px solid var(--border);
    overflow-y: auto;
  }

  .saved-group { padding: 0; }

  .saved-group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-2);
    background: var(--bg-2);
    border-bottom: 1px solid var(--border);
  }

  .group-toggle {
    width: 18px;
    height: 18px;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--text-2);
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .group-name {
    flex: 1;
  }

  .group-count {
    padding: 2px 6px;
    background: var(--bg-3);
    border-radius: 3px;
    font-size: 10px;
    color: var(--text-2);
    flex-shrink: 0;
  }

  .saved-item {
    display: flex;
    align-items: stretch;
    padding: 0;
    gap: 0;
    border-radius: 0;
    transition: background 0.1s;
    border-bottom: 1px solid var(--bg-2);
  }

  .saved-item:hover, .saved-item.active { background: var(--bg-3); }
  .saved-item.active .saved-item-name { color: var(--primary); font-weight: 500; }

  .saved-item-name {
    flex: 1;
    background: transparent;
    border: none;
    padding: 0.5rem 0.75rem;
    font-size: 13px;
    color: var(--text);
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
  }

  .item-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .saved-item-meta {
    display: flex;
    flex-direction: row;
    gap: 0.5rem;
    font-size: 11px;
    overflow: hidden;
    align-items: center;
  }

  .saved-item-unit {
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
  }

  .type-badge {
    display: inline-flex;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .type-quiz { background: rgba(99, 102, 241, 0.15); color: rgb(99, 102, 241); }
  .type-test { background: rgba(59, 130, 246, 0.15); color: rgb(59, 130, 246); }
  .type-exam { background: rgba(239, 68, 68, 0.15); color: rgb(239, 68, 68); }
  .type-assignment { background: rgba(34, 197, 94, 0.15); color: rgb(34, 197, 94); }
  .type-formative { background: rgba(14, 165, 233, 0.15); color: rgb(14, 116, 144); }
  .type-worksheet { background: rgba(245, 158, 11, 0.15); color: rgb(180, 83, 9); }
  .type-other { background: rgba(107, 114, 128, 0.15); color: rgb(107, 114, 128); }

  .saved-item-actions {
    display: flex;
    gap: 2px;
    padding: 0.5rem 0.5rem;
    opacity: 0;
    transition: opacity 0.1s;
    flex-shrink: 0;
    align-items: center;
  }

  .saved-item:hover .saved-item-actions { opacity: 1; }

  .rename-input {
    flex: 1;
    font-size: 13px;
    padding: 3px 6px;
  }

  .saved-empty {
    padding: 1.5rem 1rem;
    font-size: 12px;
    color: var(--text-2);
    text-align: center;
    line-height: 1.5;
  }

  .view {
    display: flex;
    flex: 1;
    height: 100%;
    overflow: hidden;
    background: var(--bg);
  }

  /* ── Settings Panel (Left) ────────────────────────────────────── */
  .settings-panel {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    overflow: hidden;
  }

  .settings-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .settings-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-header {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-2);
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
    margin: 0;
  }

  .section-body {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .field-row {
    display: flex;
    gap: 0.5rem;
  }

  .field-row .field {
    flex: 1;
  }

  .field label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text);
  }

  .field-hint {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-2);
    text-transform: none;
  }

  .field input,
  .field select {
    font-size: 13px;
    padding: 0.45rem 0.6rem;
    height: 32px;
    box-sizing: border-box;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
    margin: 0;
  }

  .checkbox-row input[type="checkbox"] {
    width: 16px;
    height: 16px;
    min-width: 16px;
    min-height: 16px;
    margin: 0;
    padding: 0;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    border: 1.5px solid var(--border);
    border-radius: 3px;
    background: var(--bg);
    flex-shrink: 0;
    box-sizing: border-box;
    transition: all 150ms;
  }

  .checkbox-row input[type="checkbox"]:hover {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, var(--bg));
  }

  .checkbox-row input[type="checkbox"]:checked {
    border-color: var(--primary);
    background: var(--primary);
    background-image: url('data:image/svg+xml;utf8,<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8l3 3 7-7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    background-repeat: no-repeat;
    background-position: center;
    background-size: 12px;
  }

  .total-preview {
    font-size: 11px;
    color: var(--text-2);
    margin: 0.1rem 0 0;
  }

  .field.indented, .total-preview.indented {
    margin-left: 1.5rem;
  }

  .checkbox-row.indented {
    padding-left: 1.5rem;
  }

  .preamble-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .preamble-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .preamble-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text);
  }

  .preamble-editor {
    font-family: 'Fira Code', monospace;
    font-size: 11px;
    line-height: 1.4;
    min-height: 120px;
    resize: vertical;
  }

  /* ── Selected Questions Section ────────────────────────────────── */
  .section-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: flex-start;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-2);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border);
    padding: 0.75rem 1rem;
    cursor: pointer;
    transition: color 150ms;
    flex-shrink: 0;
  }

  .section-header:hover {
    color: var(--text);
  }

  .selected-list {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .sel-group-label {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 6px 0 2px;
    color: var(--text-2);
    font-family: 'Fira Code', monospace;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .sel-group-label::before,
  .sel-group-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: color-mix(in srgb, var(--primary) 28%, var(--border));
  }

  .sel-group-label span {
    padding: 0 8px;
    line-height: 1;
  }

  .sel-item {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    align-items: stretch;
    gap: 0;
    padding: 0;
    background: var(--bg-2);
    border: 1px solid transparent;
    border-radius: 4px;
    font-size: 11px;
    transition: border-color 0.1s, background 0.1s;
  }

  .sel-item-top {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 4px 6px 3px 0;
    grid-column: 2;
  }

  .sel-item:hover {
    background: var(--bg-3);
  }

  .sel-item.drag-over {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, var(--bg-2));
  }

  .sel-item.dragging {
    opacity: 0.5;
  }

  .sel-item.group-boundary {
    position: relative;
  }

  .drag-handle {
    grid-column: 1;
    grid-row: 1 / span 2;
    cursor: grab;
    opacity: 0.55;
    font-size: 16px;
    color: var(--text-2);
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    min-height: 100%;
    width: 100%;
    background: color-mix(in srgb, var(--bg-3) 55%, transparent);
    border-right: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
    transition: opacity 150ms, color 150ms, background 150ms;
  }

  .sel-item:hover .drag-handle {
    opacity: 0.9;
    color: var(--text);
    background: color-mix(in srgb, var(--primary) 10%, var(--bg-3));
  }

  .sel-num {
    color: var(--text-2);
    min-width: 14px;
    text-align: right;
    flex-shrink: 0;
    font-size: 10px;
    font-family: 'Fira Code', monospace;
    line-height: 1;
    display: flex;
    align-items: center;
    margin-left: 4px;
  }

  .sel-info {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    overflow: hidden;
  }

  .sel-body {
    display: block;
    width: 100%;
    overflow: hidden;
    white-space: nowrap;
    font-family: 'Fira Code', monospace;
    font-size: 10px;
    color: var(--text);
    min-width: 0;
    -webkit-mask-image: linear-gradient(to right, black 0, black calc(100% - 18px), transparent 100%);
    mask-image: linear-gradient(to right, black 0, black calc(100% - 18px), transparent 100%);
  }

  .sel-space {
    display: flex;
    align-items: stretch;
    grid-column: 3;
    grid-row: 1 / span 2;
  }

  .sel-space button,
  .space-value {
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px var(--border-soft);
  }

  .sel-space input {
    border-radius: 3px 0 0 3px;
    box-shadow: none;
  }

  .space-value {
    display: flex;
    align-items: stretch;
    margin: 0;
  }

  .sel-space button:focus-visible,
  .space-value:focus-within {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  .sel-space-control {
    display: flex;
    align-items: stretch;
    gap: 2px;
  }

  .sel-space-wrap {
    display: flex;
    align-items: stretch;
    gap: 2px;
  }

  .space-mode-buttons {
    display: flex;
    align-items: stretch;
    gap: 2px;
  }

  .sel-space-wrap input {
    width: 28px;
    padding: 2px 3px;
    font-size: 10px;
    text-align: right;
    border: none;
    background: transparent;
    color: var(--text);
    outline: none;
  }

  .sel-space-wrap input::-webkit-outer-spin-button,
  .sel-space-wrap input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .sel-space-wrap input[type=number] {
    -moz-appearance: textfield;
  }

  .sel-space-wrap input.overridden {
    color: var(--primary);
    font-weight: 600;
  }

  .space-unit {
    font-size: 10px;
    color: var(--text-2);
    white-space: nowrap;
    align-self: center;
    padding: 0 4px 0 1px;
    display: flex;
    align-items: center;
  }

  .space-buttons {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .space-adjust {
    width: 22px;
    flex: 1;
    min-height: 22px;
    padding: 0;
    font-size: 8px;
    font-weight: 600;
    background: transparent;
    color: var(--text-2);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: color 150ms, background 150ms;
  }

  .space-adjust:hover {
    color: var(--text);
  }

  .space-adjust:active {
    color: white;
    background: var(--primary);
  }

  .space-fill,
  .space-break {
    width: 30px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: color 150ms, background 150ms;
  }

  .space-fill:hover,
  .space-break:hover {
    color: var(--text);
  }

  .space-fill.active,
  .space-break.active {
    color: white;
    background: var(--primary);
  }

  .number-input-wrap {
    display: flex;
    align-items: stretch;
    gap: 0;
    flex-shrink: 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
    height: 32px;
    width: 100%;
  }

  .number-input-wrap input {
    flex: 1;
    padding: 0.45rem 0.6rem;
    font-size: 13px;
    text-align: left;
    border: none;
    background: transparent;
    color: var(--text);
    outline: none;
  }

  .number-input-wrap input::-webkit-outer-spin-button,
  .number-input-wrap input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .number-input-wrap input[type=number] {
    -moz-appearance: textfield;
  }

  .number-buttons {
    display: flex;
    flex-direction: column;
    gap: 0;
    border-left: 1px solid var(--border);
  }

  .num-adjust {
    width: 16px;
    height: 15px;
    padding: 0;
    font-size: 9px;
    font-weight: 600;
    background: transparent;
    color: var(--text-2);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: color 150ms;
  }

  .num-adjust:last-of-type {
    margin-top: -2px;
  }

  .num-adjust:hover {
    color: var(--text);
  }

  .num-adjust:active {
    color: white;
    background: var(--primary);
  }

  .sel-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px 4px 0;
    grid-column: 2;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .fill-toggle {
    min-width: 34px;
  }

  .selected-footer {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  /* ── Picker Panel (Middle) ────────────────────────────────────── */
  .picker-panel {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    background: var(--bg);
    overflow: hidden;
    height: 100%;
  }

  .picker-expanded .settings-panel,
  .picker-expanded .resize-handle,
  .picker-expanded .saved-panel {
    display: none;
  }

  .picker-expanded .view {
    position: relative;
    isolation: isolate;
    padding: 24px;
  }

  .picker-expanded .preview-panel {
    position: absolute;
    inset: 0;
    filter: blur(5px);
    pointer-events: none;
  }

  .picker-expanded .view::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    background: color-mix(in srgb, var(--bg) 40%, transparent);
    pointer-events: none;
  }

  .picker-expanded .picker-panel {
    position: relative;
    z-index: 2;
    display: flex;
    width: 100% !important;
    max-width: 1200px;
    min-width: 0;
    flex: 1;
    margin-inline: auto;
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 12px 36px rgb(0 0 0 / 18%);
    transform-origin: right center;
    animation: picker-pop 180ms ease-out;
  }

  @keyframes picker-pop {
    from { opacity: 0.6; transform: translateX(14px) scale(0.97); }
    to { opacity: 1; transform: translateX(0) scale(1); }
  }

  @media (prefers-reduced-motion: reduce) {
    .picker-expanded .picker-panel { animation: none; }
  }

  .picker-heading {
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
  }

  .picker-expand {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 44px;
    min-height: 44px;
    margin: 3px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-2);
    cursor: pointer;
  }

  .picker-expand:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .picker-expand:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  .picker-expanded .picker-filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
  }

  .picker-tabs {
    display: flex;
    flex: 1;
    min-width: 0;
  }

  .picker-tabs button {
    flex: 1;
    border: none;
    border-radius: 0;
    border-bottom: 3px solid transparent;
    background: transparent;
    color: var(--text-2);
    padding: 0.75rem 0.5rem;
  }

  .picker-tabs button[aria-selected='true'] {
    color: var(--primary);
    border-bottom-color: var(--primary);
    font-weight: 600;
  }

  .picker-summary {
    flex-shrink: 0;
    padding: 0.5rem 1rem;
    font-size: 12px;
    color: var(--text-2);
    border-bottom: 1px solid var(--border);
  }

  .picker-section {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex: 1;
    min-height: 0;
  }

  .picker-section[hidden] {
    display: none;
  }

  .picker-header {
    flex-shrink: 0;
    display: flex;
    gap: 0.5rem;
    padding: 1rem;
    border-bottom: 1px solid var(--border);
    align-items: center;
  }

  .picker-search {
    flex: 1;
    font-size: 13px;
  }

  .picker-toggle {
    flex-shrink: 0;
    font-size: 14px;
  }

  .selector-section { position: relative; }
  .filter-panel {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    min-height: 0;
  }
  .filter-panel-head, .filter-panel-foot {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
  }
  .filter-panel-head span { flex: 1; color: var(--text-2); font-size: 12px; }
  .filter-help { font-size: 12px; color: var(--text-2); margin: 8px 12px; }
  .filter-panel-body {
    overflow-y: auto;
    min-height: 0;
    padding: 8px 12px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
    align-content: start;
    gap: 16px;
  }
  .filter-panel fieldset { min-width: 0; margin: 0; padding: 8px; border: 1px solid var(--border); border-radius: 6px; }
  .filter-panel legend { font-size: 12px; font-weight: 600; }
  .filter-options { max-height: 240px; overflow-y: auto; }
  .filter-panel .tag-option { align-items: flex-start; }
  .filter-panel .tag-option input { margin-top: 2px; flex-shrink: 0; }
  .filter-panel-foot { border-top: 1px solid var(--border); border-bottom: none; }
  .filter-chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 12px 8px; max-height: 100px; overflow-y: auto; flex-shrink: 0; }
  .filter-chip { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 4px 8px; font-size: 11px; border-radius: 12px; }

  .picker-filters {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .tag-menu-search {
    width: 100%;
    font-size: 12px;
    padding: 0.25rem 0.4rem;
  }

  .tag-mode {
    display: flex;
    gap: 0.25rem;
  }

  .tag-mode button {
    flex: 1;
    font-size: 11px;
    padding: 0.2rem 0.4rem;
  }

  .tag-mode button.active {
    border-color: var(--primary);
    color: var(--primary);
    font-weight: 600;
  }

  .tag-option {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.25rem 0.35rem;
    border-radius: 5px;
    font-size: 12px;
    cursor: pointer;
  }

  .tag-option:hover { background: var(--bg-2); }

  .tag-option input[type='checkbox'] {
    width: auto;
    flex: none;
    margin: 0;
  }

  .tag-option-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag-option-count {
    font-size: 10px;
    color: var(--text-2);
    flex-shrink: 0;
  }

  .tag-empty {
    font-size: 11px;
    color: var(--text-2);
    margin: 0;
    padding: 0.5rem;
  }

  .picker-toolbar {
    flex-shrink: 0;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  .q-count {
    font-size: 12px;
    color: var(--text-2);
    font-weight: 500;
  }

  .picker-actions {
    display: flex;
    gap: 0.35rem;
    align-items: center;
  }

  .random-group {
    display: flex;
    align-items: stretch;
    gap: 0;
    flex-shrink: 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
    height: 32px;
    overflow: hidden;
  }

  .random-group button {
    padding: 0 8px;
    font-size: 13px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    border: none;
    border-right: 1px solid var(--border);
    border-radius: 0;
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .random-group button:hover {
    background: var(--bg-3);
  }

  .random-group button:active {
    background: var(--bg-3);
  }

  .random-group .number-input-wrap {
    flex: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    height: 32px;
    width: auto;
    display: flex;
    align-items: stretch;
    gap: 0;
  }

  .random-group .number-input-wrap input {
    border: none;
    background: transparent;
    text-align: left;
    font-size: 13px;
    padding: 0.45rem 0.6rem;
    height: 32px;
    color: var(--text);
    outline: none;
    width: auto;
    min-width: 40px;
  }

  .random-group .number-input-wrap input::-webkit-outer-spin-button,
  .random-group .number-input-wrap input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .random-group .number-input-wrap input[type=number] {
    -moz-appearance: textfield;
  }

  .random-group .number-buttons {
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .random-group .num-adjust {
    height: 15px;
    width: 16px;
    padding: 0;
    font-size: 9px;
    background: transparent;
    color: var(--text-2);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: color 150ms;
  }

  .random-group .num-adjust:hover {
    color: var(--text);
  }

  .random-group .num-adjust:active {
    color: white;
    background: var(--primary);
  }

  .random-group .num-adjust:last-of-type {
    margin-top: -2px;
  }

  .picker-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0.5rem;
  }

  .picker-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 6px 8px;
    min-height: 32px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    border: 1px solid transparent;
    transition: background 0.1s, border-color 0.1s;
    user-select: none;
    -webkit-tap-highlight-color: color-mix(in srgb, var(--primary) 18%, transparent);
  }

  .picker-item:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .picker-item:hover {
    background: var(--bg-2);
  }

  .picker-edit {
    opacity: 0;
    flex-shrink: 0;
    padding: 0.1rem 0.3rem;
    font-size: 11px;
    transition: opacity 0.12s;
  }
  .picker-item:hover .picker-edit {
    opacity: 0.7;
  }
  .picker-edit:hover {
    opacity: 1 !important;
  }

  .picker-item.checked {
    background: color-mix(in srgb, var(--primary) 10%, var(--bg-2));
    border-color: var(--primary);
  }

  .picker-item.errored {
    background: color-mix(in srgb, #ef4444 12%, var(--bg));
    border-left: 2px solid #ef4444;
  }

  .picker-item.errored:hover {
    background: color-mix(in srgb, #ef4444 20%, var(--bg));
  }

  .picker-item input[type="checkbox"] {
    width: 16px;
    height: 16px;
    min-width: 16px;
    min-height: 16px;
    margin: 0;
    padding: 0;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    border: 1.5px solid var(--border);
    border-radius: 3px;
    background: var(--bg);
    flex-shrink: 0;
    box-sizing: border-box;
    transition: all 150ms;
  }

  .picker-item input[type="checkbox"]:hover {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, var(--bg));
  }

  .picker-item input[type="checkbox"]:checked {
    border-color: var(--primary);
    background: var(--primary);
    background-image: url('data:image/svg+xml;utf8,<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8l3 3 7-7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    background-repeat: no-repeat;
    background-position: center;
    background-size: 12px;
  }

  @media (hover: none), (pointer: coarse) {
    .picker-item {
      min-height: 44px;
      padding: 8px 10px;
    }

    .picker-edit {
      opacity: 0.8;
      min-width: 34px;
      min-height: 34px;
    }

    .picker-item input[type="checkbox"] {
      width: 20px;
      height: 20px;
      min-width: 20px;
      min-height: 20px;
    }
  }

  .picker-info {
    flex: 1;
    min-width: 0;
  }

  .picker-body {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'Fira Code', monospace;
    font-size: 11px;
    color: var(--text);
  }

  .picker-pts {
    font-size: 11px;
    color: var(--text-2);
    font-weight: 500;
    flex-shrink: 0;
  }

  .picker-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: var(--text-2);
    text-align: center;
    padding: 1rem;
  }

  /* ── Show Picker Button ───────────────────────────────────────── */
  .show-picker-btn {
    flex-shrink: 0;
    width: 40px;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--text-2);
    font-size: 12px;
    writing-mode: vertical-rl;
    text-orientation: mixed;
    border-right: 1px solid var(--border);
    cursor: pointer;
    transition: color 0.1s, background 0.1s;
  }

  .show-picker-btn:hover {
    color: var(--text);
    background: var(--bg-2);
  }

  /* ── Resize Handles ──────────────────────────────────────────── */
  .resize-handle {
    width: 10px;
    flex-shrink: 0;
    background: var(--bg-2);
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
    cursor: col-resize;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }

  .resize-handle:hover {
    background: var(--bg-3);
  }

  /* ── Preview Panel (Right) ────────────────────────────────────– */
  .preview-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
  }

  /* ── Utility Buttons ──────────────────────────────────────────– */
  button.ghost.small {
    padding: 4px 8px;
    font-size: 12px;
  }

  button.ghost.tiny {
    padding: 2px 4px;
    font-size: 11px;
  }

  button.icon-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .danger-text {
    color: var(--danger);
  }

  /* ── Hover preview popup ─────────────────────────────────────────── */
  .hover-preview {
    position: fixed;
    z-index: 500;
    width: 480px;
    max-height: 680px;
    overflow-y: auto;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 6px 28px rgba(0, 0, 0, 0.22);
    padding: 0.6rem;
    pointer-events: auto;
  }

  .hover-svg :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }

  .hover-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin: 0.5rem 0 0;
    padding: 0.5rem 0 0;
    border-top: 1px solid var(--border);
    list-style: none;
  }

  .hover-tags li {
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary) 10%, var(--bg));
    color: var(--text);
    font-size: 0.72rem;
    line-height: 1.4;
  }

  .hover-spinner {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 60px;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 760px) {
    .picker-expanded .view { padding: 0; }

    .picker-expanded .preview-panel,
    .picker-expanded .view::before { display: none; }

    .picker-expanded .picker-panel {
      max-width: none;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      animation: none;
    }

    .test-toolbar {
      height: auto;
      min-height: 52px;
      flex-wrap: wrap;
      align-items: stretch;
      padding: 0.55rem 0.75rem;
      gap: 0.5rem;
    }

    .toolbar-center {
      display: none;
    }

    .toolbar-left,
    .toolbar-right {
      flex: 1 1 auto;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .toolbar-right {
      justify-content: flex-end;
    }

    .test-name {
      max-width: 100%;
      font-size: 15px;
    }

    .test-toolbar button,
    .saved-item-actions button,
    .saved-item-name {
      min-height: 44px;
      font-size: 14px;
    }

    .view-area {
      position: relative;
      overflow: hidden;
    }

    .view {
      display: block;
      height: 100%;
      overflow: hidden;
    }

    .settings-panel,
    .settings-divider,
    .picker-divider,
    .picker-panel,
    .hover-preview {
      display: none;
    }

    .saved-panel {
      position: absolute;
      inset: 0;
      z-index: 12;
      width: 100%;
      border-right: 0;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
    }

    .saved-group-header,
    .saved-item-name {
      padding-inline: 0.85rem;
    }

    .saved-item-actions {
      opacity: 1;
    }

    .preview-panel {
      width: 100%;
      height: 100%;
      min-width: 0;
      overflow: hidden;
    }

    button.ghost.small,
    button.ghost.tiny {
      min-height: 44px;
    }
  }
</style>
