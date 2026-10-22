<script lang="ts">
  import BankSwitcher from './BankSwitcher.svelte';
  import QuestionSnippet from './QuestionSnippet.svelte';
  import { tick, untrack } from 'svelte';
  import { bank } from '../lib/bank.svelte';
  import { narratives } from '../lib/narratives.svelte';
  import { CLASSES, DEMO_CLASSES, findUnit, findSection } from '../lib/curriculum';
  import { customClasses } from '../lib/custom-classes.svelte';
  import type { Class, Narrative, Question, Section, Unit } from '../lib/types';
  import ImageLibraryModal from './media/ImageLibraryModal.svelte';
  import { editor, newInEditor, openInEditor } from '../lib/editor/editor-state.svelte';
  import ClassInfoCard from './ClassInfoCard.svelte';
  import CurriculumView, { type CurriculumPick } from './CurriculumView.svelte';
  import { indicatorCatalog } from '../lib/indicator-catalog.svelte';
  import { indicatorLabel } from '../lib/achievement-indicators';
  import AddToTestMenu from './AddToTestMenu.svelte';
  import { appState } from '../lib/app-state.svelte';
  import { compileSvg, cancelPreview, findDelimiterIssues, previewConsumer } from '../lib/typst/compiler';
  import { perf } from '../lib/perf-diagnostics';
  import { bankView } from '../lib/bank-switch-view.svelte';
  import { bankWorkspaces } from '../lib/bank-workspaces.svelte';
  import { workspaceCatalog } from '../lib/workspace-catalog.svelte';
  import { formatBody, formatParts } from '../lib/question-format';
  import { imageStore } from '../lib/image-store.svelte';
  import { fuzzyScoreMultiLower, narrativeIndex, narrativeSearchText, questionSearchText } from '../lib/search-index';
  import { getThemeColors } from '../lib/theme-colors';
  import { scanImageRefs } from '../lib/typst/image-shadow';
  import { calculateAlgorithmicQuestionOriginal, calculateAlgorithmicQuestionVariant, canRestoreAlgorithmicOriginal } from '../lib/algorithm-variant';
  import { variantNumber, variantSeeds, withVariant, withoutOldVariants, withoutVariant } from '../lib/algorithm-history';
  import { narrativeLabel, resolveQuestionNarrative } from '../lib/narrative-utils';
  import { portal } from '../lib/portal';
  import { autoImports } from '../lib/typst/auto-imports';
  import { compareUnits, sectionLabel as curriculumSectionLabel, unitLabel } from '../lib/curriculum-labels';
  import { mergeWorkspaceClasses } from '../lib/workspace-format';
  import type { RepoDataImage } from '../git/repoDataModel';

  type BankSource = { bankId: string; bankName: string; bankUpdatedAt: number; questions: Question[]; narratives: Narrative[]; classes: Class[]; images: RepoDataImage[] };
  function initialBankSelection(): string[] {
    try {
      const saved = JSON.parse(localStorage.getItem('tg-bank-corpus-selection-v1') ?? 'null');
      if (Array.isArray(saved)) {
        const available = new Set(bankView.banks.map(entry => entry.id));
        const valid = saved.filter((id): id is string => typeof id === 'string' && available.has(id));
        if (valid.length) return valid;
      }
    } catch { /* fall back to the mounted bank */ }
    return bankView.activeBankId ? [bankView.activeBankId] : [];
  }
  let selectedBankIds = $state<string[]>(initialBankSelection());
  let corpusSources = $state<BankSource[]>([]);
  let corpusLoading = $state(false);
  let corpusError = $state('');
  let corpusLoad = 0;
  let corpusActiveId = '';
  let corpusRegistryKey = $derived(JSON.stringify(bankView.banks.map(({ id, name, updatedAt }) => [id, name, updatedAt])));

  $effect(() => {
    try { localStorage.setItem('tg-bank-corpus-selection-v1', JSON.stringify(selectedBankIds)); } catch { /* usable for this session */ }
  });

  $effect(() => {
    const available = new Set(bankView.banks.map(entry => entry.id));
    const valid = selectedBankIds.filter(id => available.has(id));
    if (valid.length !== selectedBankIds.length) selectedBankIds = valid;
  });

  $effect(() => {
    const ids = [...selectedBankIds];
    const activeId = bankView.activeBankId;
    corpusRegistryKey;
    const registry = untrack(() => bankView.banks);
    const current = untrack(() => corpusSources);
    const currentById = new Map(current.map(source => [source.bankId, source]));
    if (corpusActiveId === activeId && ids.length === current.length && ids.every(id => {
      const info = registry.find(entry => entry.id === id);
      const source = currentById.get(id);
      return info && source?.bankName === info.name && source.bankUpdatedAt === info.updatedAt;
    })) return;
    const version = ++corpusLoad;
    corpusLoading = true;
    corpusError = '';
    void Promise.all(ids.map(async bankId => {
      const info = registry.find(entry => entry.id === bankId);
      if (!info) return null;
      if (bankId === activeId) return { bankId, bankName: info.name, bankUpdatedAt: info.updatedAt, questions: bank.questions, narratives: narratives.narratives, classes: customClasses.classes, images: [] } satisfies BankSource;
      const snapshot = await bankWorkspaces.readBankSnapshot(bankId);
      return { bankId, bankName: info.name, bankUpdatedAt: info.updatedAt, questions: snapshot?.questions ?? [], narratives: snapshot?.narratives ?? [], classes: snapshot?.customClasses ?? [], images: snapshot?.images ?? [] } satisfies BankSource;
    })).then(loaded => {
      if (version !== corpusLoad) return;
      corpusSources = loaded.filter((source): source is BankSource => source !== null);
      corpusActiveId = activeId;
      corpusLoading = false;
    }).catch(reason => {
      if (version !== corpusLoad) return;
      corpusError = reason instanceof Error ? reason.message : String(reason);
      corpusSources = [];
      corpusLoading = false;
    });
  });

  // The mounted bank changes in memory as questions are edited or variants calculated.
  // Its registry timestamp only changes on a snapshot, so never use that snapshot as live data.
  let liveCorpusSources = $derived(corpusSources.map(source => source.bankId === bankView.activeBankId
    ? { ...source, questions: bank.questions, narratives: narratives.narratives, classes: customClasses.classes }
    : source));
  let corpusQuestions = $derived(liveCorpusSources.flatMap(source => source.questions));
  let corpusClasses = $derived(mergeWorkspaceClasses(liveCorpusSources.flatMap(source => source.classes)));
  let questionSources = $derived(new Map(liveCorpusSources.flatMap(source => source.questions.map(question => [question.id, source] as const))));
  let catalogQuestionIds = $derived(new Map(Object.entries(workspaceCatalog.sources).map(([id, source]) => [`${source.bankId}/${source.questionId}`, id])));
  const sourceFor = (question: Question) => questionSources.get(question.id);
  const sourceBankId = (question: Question) => sourceFor(question)?.bankId ?? bankView.activeBankId;
  const sourceName = (question: Question) => sourceFor(question)?.bankName ?? bankView.activeBank?.name ?? 'Bank';
  const sourceNarratives = (question: Question) => sourceFor(question)?.narratives ?? narratives.narratives;
  const sourceImages = (question: Question) => sourceFor(question)?.images ?? [];

  function replaceCorpusQuestion(bankId: string, questionId: string, replacement: Question | null, cls?: Class) {
    const replacesSelection = selectedQ?.id === questionId && sourceBankId(selectedQ) === bankId;
    corpusSources = corpusSources.map(source => {
      if (source.bankId !== bankId) return source;
      const questions = replacement
        ? source.questions.map(question => question.id === questionId ? replacement : question)
        : source.questions.filter(question => question.id !== questionId);
      const classes = cls && !source.classes.some(existing => existing.id === cls.id)
        ? mergeWorkspaceClasses([cls, ...source.classes])
        : source.classes;
      const bankUpdatedAt = untrack(() => bankView.banks).find(entry => entry.id === bankId)?.updatedAt ?? source.bankUpdatedAt;
      return { ...source, bankUpdatedAt, questions, classes };
    });
    if (replacesSelection) {
      selectedQ = replacement;
      if (!replacement) { previewSvg = null; previewFor = null; previewError = null; }
    }
  }

  async function updateQuestion(question: Question, updates: Partial<Omit<Question, 'id' | 'createdAt'>>, options: { validationOnly?: boolean } = {}) {
    const bankId = sourceBankId(question);
    if (bankId === bankView.activeBankId) bank.update(question.id, updates, { markEdited: !options.validationOnly });
    else {
      const classId = updates.classId ?? question.classId;
      const cls = [...customClasses.catalog, ...workspaceCatalog.classes].find(entry => entry.id === classId);
      const updated = await bankWorkspaces.updateDormantQuestion(
        bankId,
        question.id,
        () => updates,
        [],
        !options.validationOnly && cls ? [$state.snapshot(cls)] : [],
        { markEdited: !options.validationOnly },
      );
      replaceCorpusQuestion(bankId, question.id, updated, options.validationOnly ? undefined : cls);
    }
  }

  async function removeQuestion(question: Question) {
    const bankId = sourceBankId(question);
    if (bankId === bankView.activeBankId) bank.remove(question.id);
    else {
      await bankWorkspaces.deleteDormantQuestion(bankId, question.id);
      replaceCorpusQuestion(bankId, question.id, null);
    }
  }

  let allClasses = $derived(mergeWorkspaceClasses(appState.demoMode
    ? [...CLASSES, ...DEMO_CLASSES, ...corpusClasses]
    : [...CLASSES, ...corpusClasses]));

  // ── Sidebar tree ─────────────────────────────────────────────────────────
  // Like Dolphin's details view, any number of classes can be expanded at once;
  // openClassId is just the most recently opened class.
  let openClassId = $state<string | null>(null);
  let expandedClasses = $state(new Set<string>());

  $effect(() => {
    if (openClassId !== null) return;
    const first = allClasses[0]?.id;
    if (first) untrack(() => expandClass(first));
  });

  function expandClass(id: string) {
    openClassId = id;
    if (!expandedClasses.has(id)) expandedClasses = new Set([...expandedClasses, id]);
  }

  function toggleClass(id: string) {
    if (!expandedClasses.has(id)) return expandClass(id);
    const next = new Set(expandedClasses);
    next.delete(id);
    expandedClasses = next;
  }

  function selectClass(id: string) {
    expandClass(id);
    select({ type: 'class', classId: id });
    appState.setLastClassId(id);
  }

  /** Arrow keys expand and collapse rows, as in Dolphin. */
  function treeKey(e: KeyboardEvent, expanded: boolean, toggle: () => void) {
    if ((e.key === 'ArrowRight' && !expanded) || (e.key === 'ArrowLeft' && expanded)) {
      e.preventDefault();
      toggle();
    }
  }

  // ── Tree selection ───────────────────────────────────────────────────────
  type Selection =
    | { type: 'all' }
    | { type: 'class'; classId: string }
    | { type: 'unit'; classId: string; unitId: string }
    | { type: 'section'; classId: string; unitId: string; sectionId: string };

  let selection = $state<Selection>({ type: 'all' });
  let expandedUnits = $state(new Set<string>());

  function toggleUnit(unitId: string) {
    const next = new Set(expandedUnits);
    if (next.has(unitId)) next.delete(unitId);
    else next.add(unitId);
    expandedUnits = next;
  }

  function select(sel: Selection) {
    selection = sel;
    search = '';
  }

  // ── Filtering ────────────────────────────────────────────────────────────
  let search = $state('');
  // The input stays bound to `search`; scoring 10k+ questions waits for a short typing pause.
  let searchQuery = $state('');
  $effect(() => {
    const next = search.trim().toLowerCase();
    if (!next) { searchQuery = ''; return; }
    const timer = setTimeout(() => (searchQuery = next), 100);
    return () => clearTimeout(timer);
  });
  let typeFilter = $state<'' | 'mcq' | 'frq'>('');
  let graphFilter = $state(false);
  let algorithmFilter = $state(false);
  let errorFilter = $state(false);
  /** An achievement indicator id, or UNTAGGED for questions without any. */
  let indicatorFilter = $state<string | null>(null);
  const UNTAGGED = '__untagged__';
  const matchesIndicator = (q: Question) => !indicatorFilter
    || (indicatorFilter === UNTAGGED ? !q.indicators?.length : !!q.indicators?.includes(indicatorFilter));
  let bankMode = $state<'questions' | 'curriculum'>('questions');
  let curriculumClassId = $state('');
  /** Leave the Curriculum view for the questions it points at. */
  function showFromCurriculum(pick: CurriculumPick) {
    classFilter = null;
    if (pick.type === 'indicator') {
      // An indicator's questions may sit in any section, so only the indicator filters.
      select({ type: 'all' });
      indicatorFilter = pick.indicatorId;
    } else {
      expandClass(pick.classId);
      expandedUnits = new Set([...expandedUnits, pick.unitId]);
      select({ type: 'section', classId: pick.classId, unitId: pick.unitId, sectionId: pick.sectionId });
      indicatorFilter = pick.untagged ? UNTAGGED : null;
    }
    bankMode = 'questions';
  }
  let sortBy = $state<'import' | 'date' | 'points' | 'unit' | 'edited'>('import');
  const BULK_KEEP = '__keep__';
  const BULK_CLEAR = '__clear__';
  const BULK_ADD = '__add__';
  type BulkChoice = typeof BULK_KEEP | typeof BULK_CLEAR | string;
  type BulkTagMode = 'keep' | 'add' | 'remove' | 'replace' | 'clear';

  // ── Exact tag filter ─────────────────────────────────────────────────────
  // Complements the fuzzy search box: checked tags match exactly, so a tag that
  // is a substring of another ("graph" vs "graphing") no longer drags extras in.
  let selectedTags = $state<string[]>([]);
  let tagMatchAll = $state(true);
  let filterMenuOpen = $state(false);
  let tagSearch = $state('');
  let filterMenuEl = $state<HTMLDivElement | null>(null);
  let filterTriggerEl = $state<HTMLButtonElement | null>(null);
  let activeFilterCount = $derived(Number(typeFilter !== '') + Number(graphFilter)
    + Number(algorithmFilter) + Number(errorFilter) + selectedTags.length);

  async function toggleFilters() {
    filterMenuOpen = !filterMenuOpen;
    if (filterMenuOpen) {
      await tick();
      filterMenuEl?.querySelector<HTMLButtonElement>('.filters-section button.active')?.focus();
    }
  }

  function closeFilters() {
    filterMenuOpen = false;
    filterTriggerEl?.focus();
  }

  function clearFilters() {
    typeFilter = '';
    graphFilter = false;
    algorithmFilter = false;
    errorFilter = false;
    tagMatchAll = true;
    clearTagFilter();
  }

  function matchesTagFilter(q: Question): boolean {
    if (selectedTags.length === 0) return true;
    const tags = new Set((q.tags ?? []).map((t) => t.toLowerCase()));
    return tagMatchAll
      ? selectedTags.every((t) => tags.has(t))
      : selectedTags.some((t) => tags.has(t));
  }

  /** Questions the tag list is drawn from: current class/unit/section scope only. */
  let tagScopeQuestions = $derived.by(() => {
    if (classFilter !== null) return corpusQuestions.filter((q) => q.classId === classFilter);
    const sel = selection;
    if (sel.type === 'class') return corpusQuestions.filter((q) => q.classId === sel.classId);
    if (sel.type === 'unit') {
      return corpusQuestions.filter((q) => q.classId === sel.classId && q.unitId === sel.unitId);
    }
    if (sel.type === 'section') {
      return corpusQuestions.filter(
        (q) => q.classId === sel.classId && q.unitId === sel.unitId && q.sectionId === sel.sectionId,
      );
    }
    return corpusQuestions;
  });

  /** Tags in scope with their question counts, most used first. */
  let tagOptions = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const q of tagScopeQuestions) {
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

  function clearTagFilter() {
    selectedTags = [];
    tagSearch = '';
  }

  $effect(() => {
    if (!filterMenuOpen) return;
    const closeOnOutside = (e: PointerEvent) => {
      if (filterMenuEl && !filterMenuEl.contains(e.target as Node)) filterMenuOpen = false;
    };
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeFilters();
      }
    };
    const closeOnFocusOutside = (e: FocusEvent) => {
      if (filterMenuEl && !filterMenuEl.contains(e.target as Node)) filterMenuOpen = false;
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('focusin', closeOnFocusOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('focusin', closeOnFocusOutside);
    };
  });

  let errorCount = $derived(corpusQuestions.filter(q => q.renderError).length);

  $effect(() => { if (errorCount === 0) errorFilter = false; });

  function applySortOrder(qs: Question[]): Question[] {
    const copy = [...qs];
    switch (sortBy) {
      case 'date':
        return copy.sort((a, b) => b.createdAt - a.createdAt);
      case 'points':
        return copy.sort((a, b) => b.points - a.points);
      case 'unit':
        return copy.sort((a, b) => {
          const unitA = a.unitId ?? '';
          const unitB = b.unitId ?? '';
          if (unitA !== unitB) return unitA.localeCompare(unitB);
          return a.createdAt - b.createdAt;
        });
      case 'edited':
        return copy.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
      case 'import':
      default:
        return copy;
    }
  }

  let filtered = $derived(
    (() => {
      const sel = selection;
      let base = corpusQuestions;
      if (sel.type === 'class') {
        base = base.filter((q) => q.classId === sel.classId);
      } else if (sel.type === 'unit') {
        base = base.filter((q) => q.classId === sel.classId && q.unitId === sel.unitId);
      } else if (sel.type === 'section') {
        base = base.filter(
          (q) =>
            q.classId === sel.classId &&
            q.unitId === sel.unitId &&
            q.sectionId === sel.sectionId,
        );
      }
      if (typeFilter === 'mcq') {
        base = base.filter(isMCQQuestion);
      } else if (typeFilter === 'frq') {
        base = base.filter((q) => !isMCQQuestion(q));
      }
      if (graphFilter) {
        base = base.filter((q) => q.tags.includes('graph'));
      }
      if (algorithmFilter) {
        base = base.filter(canCalculateValues);
      }
      base = base.filter(matchesTagFilter);
      if (errorFilter) {
        base = base.filter((q) => !!q.renderError);
      }
      if (indicatorFilter) base = base.filter(matchesIndicator);
      if (searchQuery) {
        // Fuzzy search across body, tags, solution, and answer (cached lowercase text)
        const scored = base.map((q) => ({
          q,
          score: (() => {
            const narrative = narrativeSearchText(q, narrativeIndex(sourceNarratives(q)));
            const text = questionSearchText(q);
            return fuzzyScoreMultiLower(searchQuery, [
              { text: text.content, weight: 2 },
              { text: narrative.body, weight: 1.6 },
              { text: narrative.title, weight: 1 },
              { text: text.tags, weight: 1.5 },
              { text: text.solution, weight: 1 },
              { text: text.answer, weight: 1 },
            ]);
          })(),
        }));
        base = scored
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((s) => s.q);
      }
      return base;
    })(),
  );

  // ── Class tab filter ─────────────────────────────────────────────────────
  let classFilter  = $state<string | null>(null);
  let infoClassId  = $state<string | null>(null);
  let confirmClearClassId = $state<string | null>(null);

  async function clearBuiltInClass(classId: string) {
    for (const question of corpusQuestions.filter(q => q.classId === classId)) await removeQuestion(question);
    confirmClearClassId = null;
    if (classFilter === classId) classFilter = null;
  }

  function isMCQQuestion(q: Question): boolean {
    return (q.choices != null && Object.keys(q.choices).length >= 2) ||
      /^[A-Ea-e]$/.test(q.answer ?? '') ||
      /^[A-Ea-e]$/.test(q.solution ?? '');
  }

  function setClassFilter(id: string | null) {
    classFilter = id;
    if (id !== null) { select({ type: 'all' }); appState.setLastClassId(id); }
  }

  // When classFilter is active it overrides the sidebar tree; search and type filter still apply.
  let displayQuestions = $derived(
    applySortOrder(
      classFilter === null
        ? filtered
        : (() => {
            let qs = corpusQuestions.filter((q) => q.classId === classFilter);
            if (typeFilter === 'mcq') qs = qs.filter(isMCQQuestion);
            else if (typeFilter === 'frq') qs = qs.filter((q) => !isMCQQuestion(q));
            if (graphFilter) qs = qs.filter((q) => q.tags.includes('graph'));
            if (algorithmFilter) qs = qs.filter(canCalculateValues);
            qs = qs.filter(matchesTagFilter);
            if (errorFilter) qs = qs.filter((q) => !!q.renderError);
            if (indicatorFilter) qs = qs.filter(matchesIndicator);
            if (searchQuery) {
              const scored = qs.map((q) => {
                const text = questionSearchText(q);
                return { q, score: fuzzyScoreMultiLower(searchQuery, [
                  { text: text.body, weight: 2 },
                  { text: text.tags, weight: 1.5 },
                  { text: text.solution, weight: 1 },
                  { text: text.answer, weight: 1 },
                ]) };
              });
              qs = scored
                .filter((s) => s.score > 0)
                .sort((a, b) => b.score - a.score)
                .map((s) => s.q);
            }
            return qs;
          })(),
    )
  );

  // ── List window ──────────────────────────────────────────────────────────
  // Only one page of cards is mounted; selection, ranges and bulk actions use all displayQuestions.
  const LIST_PAGE_SIZE = 100;
  let listPage = $state(0);
  let listEl = $state<HTMLDivElement | null>(null);
  let listPageCount = $derived(Math.max(1, Math.ceil(displayQuestions.length / LIST_PAGE_SIZE)));
  let currentListPage = $derived(Math.min(listPage, listPageCount - 1));
  let pageQuestions = $derived(displayQuestions.slice(currentListPage * LIST_PAGE_SIZE, (currentListPage + 1) * LIST_PAGE_SIZE));
  let listFilterKey = $derived(JSON.stringify([selection, classFilter, typeFilter, graphFilter, algorithmFilter, errorFilter, indicatorFilter, selectedTags, tagMatchAll, searchQuery, sortBy]));
  $effect(() => {
    listFilterKey;
    untrack(() => {
      const idx = selectedQ ? displayQuestions.findIndex((q) => q.id === selectedQ!.id) : -1;
      listPage = idx === -1 ? 0 : Math.floor(idx / LIST_PAGE_SIZE);
      if (listEl) listEl.scrollTop = 0;
    });
  });

  function showListPage(pageIndex: number) {
    listPage = Math.max(0, Math.min(listPageCount - 1, pageIndex));
    if (listEl) { listEl.scrollTop = 0; if (listEl.getBoundingClientRect().top < 0) listEl.scrollIntoView({ block: 'start' }); }
  }

  // ── Multi-select and bulk metadata editing ───────────────────────────────
  let selectedIds = $state(new Set<string>());
  let selectionAnchorId = $state<string | null>(null);
  let bulkClassId = $state<BulkChoice>(BULK_KEEP);
  let bulkUnitId = $state<BulkChoice>(BULK_KEEP);
  let bulkSectionId = $state<BulkChoice>(BULK_KEEP);
  let bulkNewClassName = $state('');
  let bulkNewUnitName = $state('');
  let bulkNewSectionName = $state('');
  let bulkPointsInput = $state<string | number>('');
  let bulkTagMode = $state<BulkTagMode>('keep');
  let bulkTagsInput = $state('');

  let selectedQuestions = $derived(corpusQuestions.filter((q) => selectedIds.has(q.id)));
  let selectedVisibleCount = $derived(displayQuestions.filter((q) => selectedIds.has(q.id)).length);
  // Display order first, then selected questions a filter currently hides.
  let selectedInOrder = $derived([...new Set([...displayQuestions, ...selectedQuestions]
    .filter((q) => selectedIds.has(q.id))
    .map((q) => catalogQuestionIds.get(`${sourceBankId(q)}/${q.id}`) ?? q.id))]);
  let addResult = $state<{ message: string; ok: boolean } | null>(null);
  $effect(() => { selectedIds; untrack(() => addResult = null); });
  let bulkContextClassId = $derived(
    isBulkRealValue(bulkClassId)
      ? bulkClassId
      : bulkClassId === BULK_KEEP
        ? commonSelectedValue(selectedQuestions.map((q) => q.classId))
        : '',
  );
  let bulkUnitOptions = $derived(allClasses.find((cls) => cls.id === bulkContextClassId)?.units ?? []);
  let bulkContextUnitId = $derived(
    isBulkRealValue(bulkUnitId)
      ? bulkUnitId
      : bulkUnitId === BULK_KEEP
        ? commonSelectedValue(selectedQuestions.map((q) => q.unitId))
        : '',
  );
  let bulkSectionOptions = $derived(
    bulkUnitOptions.find((unit) => unit.id === bulkContextUnitId)?.sections ?? []
  );
  let hasBulkMetadataChange = $derived(
    bulkClassId !== BULK_KEEP
    || bulkUnitId !== BULK_KEEP
    || bulkSectionId !== BULK_KEEP
    || String(bulkPointsInput ?? '').trim().length > 0
    || bulkTagMode !== 'keep'
  );

  $effect(() => {
    const visibleIds = new Set(displayQuestions.map((q) => q.id));
    const next = [...selectedIds].filter((id) => visibleIds.has(id));
    if (next.length !== selectedIds.size) {
      selectedIds = new Set(next);
    }
    if (selectionAnchorId && !visibleIds.has(selectionAnchorId)) selectionAnchorId = next.at(-1) ?? null;
  });

  // Question counts for tree badges
  function classCount(classId: string) {
    return corpusQuestions.filter((q) => q.classId === classId).length;
  }
  function unitCount(classId: string, unitId: string) {
    return corpusQuestions.filter((q) => q.classId === classId && q.unitId === unitId).length;
  }
  function sectionCount(classId: string, unitId: string, sectionId: string) {
    return corpusQuestions.filter(
      (q) => q.classId === classId && q.unitId === unitId && q.sectionId === sectionId,
    ).length;
  }

  // ── Toast ────────────────────────────────────────────────────────────────
  let importToast = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function setToast(message: string) {
    if (toastTimer) clearTimeout(toastTimer);
    importToast = message;
    toastTimer = setTimeout(() => (importToast = ''), 3500);
  }

  // ── Question preview ─────────────────────────────────────────────────────
  let selectedQ        = $state<Question | null>(null);
  let previewedQuestion = $derived.by(() => {
    const question = selectedQ;
    return question ? corpusQuestions.find(q => q.id === question.id) ?? question : null;
  });
  // Close a preview only when its source is removed from the displayed corpus.
  let selectionCorpus = '';
  $effect(() => {
    const key = selectedBankIds.join('|');
    if (key === selectionCorpus) return;
    selectionCorpus = key;
    untrack(() => {
      if (selectedQ && !selectedBankIds.includes(sourceBankId(selectedQ))) {
        selectedQ = null; previewSvg = null; previewFor = null; previewError = null;
      }
    });
  });
  let previewSvg       = $state<string | null>(null);
  let previewFor       = $state<string | null>(null);
  let previewError     = $state<string | null>(null);
  let previewBusy      = $state(false);
  let algorithmSeedInput = $state('');
  let sidebarCollapsed = $state(false);
  let sidebarWidth     = $state(260);
  let previewWidth     = $state(480);
  let imageLibraryOpen = $state(false);

  // ── Bulk render check ────────────────────────────────────────────────────
  let bulkRunning      = $state(false);
  let bulkProgress     = $state(0);
  let bulkTotal        = $state(0);
  let bulkErrors       = $state(0);
  let bulkCancelled    = false;

  function startResize(which: 'sidebar' | 'preview', e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = which === 'sidebar' ? sidebarWidth : previewWidth;
    let dragged = false;

    function onMove(ev: MouseEvent) {
      if (!dragged && Math.abs(ev.clientX - startX) > 4) dragged = true;
      if (dragged) {
        const dx = ev.clientX - startX;
        if (which === 'sidebar') {
          const newWidth = Math.max(140, Math.min(520, startW + dx));
          sidebarWidth = newWidth;
          // Auto-hide if dragged far past minimum, but allow dragging back to show
          if (newWidth === 140 && dx < -50) {
            sidebarCollapsed = true;
          } else if (dx >= -50) {
            sidebarCollapsed = false;
          }
        } else {
          previewWidth = Math.max(280, Math.min(900, startW - dx));
        }
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!dragged) {
        if (which === 'sidebar') sidebarCollapsed = !sidebarCollapsed;
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async function runBulkCheck() {
    const qs = displayQuestions;
    bulkRunning = true;
    bulkProgress = 0;
    bulkTotal = qs.length;
    bulkErrors = 0;
    bulkCancelled = false;

    for (const q of qs) {
      if (bulkCancelled) break;
      const result = await compileSvg(previewSource(q), { images: sourceImages(q) });
      bulkProgress++;
      const err = result.error ?? null;
      if (err !== null) {
        bulkErrors++;
        const pos = findDelimiterIssues(q.body)
          ?? (q.solution ? findDelimiterIssues(q.solution) : null);
        const enhanced = pos ? `${err}\n\n${pos}` : err;
        if (q.renderError !== enhanced) await updateQuestion(q, { renderError: enhanced, checked: true }, { validationOnly: true });
      } else {
        if (q.renderError != null) await updateQuestion(q, { renderError: undefined, checked: true }, { validationOnly: true });
        else await updateQuestion(q, { checked: true }, { validationOnly: true });
      }
      // Yield to event loop between each question
      await new Promise(r => setTimeout(r, 0));
    }
    bulkRunning = false;
  }

  let currentTheme = $state(document.documentElement.getAttribute('data-theme') ?? 'auto');
  let prefersDark = $state(window.matchMedia('(prefers-color-scheme: dark)').matches);

  $effect(() => {
    const themeObs = new MutationObserver(() => {
      currentTheme = document.documentElement.getAttribute('data-theme') ?? 'auto';
    });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => themeObs.disconnect();
  });

  $effect(() => {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      prefersDark = e.matches;
    });
  });

  let isDark = $derived(currentTheme !== 'auto'
    ? currentTheme.includes('dark') || currentTheme.includes('mocha') || currentTheme.includes('frappe') || currentTheme === 'dracula' || currentTheme === 'nord' || currentTheme === 'one-dark'
    : prefersDark);

  function previewSource(q: Question): string {
    const colors = getThemeColors(currentTheme, prefersDark);
    const resolvedNarrative = resolveQuestionNarrative(q, sourceNarratives(q));
    const structured = q.parts ? formatParts(q.parts, !resolvedNarrative) : q.body;
    const body = q.choices && Object.keys(q.choices).length >= 2
      ? formatBody(structured, q.choices)
      : structured;
    const bodyWithNarrative = resolvedNarrative?.body.trim() ? `${resolvedNarrative.body.trim()}\n\n${body}` : body;
    const graphTypst = q.graphTypst?.trim();
    const withGraph = graphTypst && !(/Recovered graph/i.test(graphTypst) && /Recovered graph/i.test(bodyWithNarrative))
      ? `${bodyWithNarrative}\n\n${graphTypst}`
      : bodyWithNarrative;

    const imports = autoImports(withGraph);
    let preview = `${imports}#set page(width: 14cm, height: auto, margin: 0.75cm, fill: rgb("${colors.bgTypst}"))
#set text(font: "New Computer Modern", size: 15pt, fill: rgb("${colors.textTypst}"))
#set par(justify: false)

${withGraph}`;

    // Add answer if present
    if (q.answer) {
      preview += `\n\n*Answer:* ${q.answer}`;
    }

    // Add solution if present
    if (q.solution) {
      preview += `\n\n*Solution:*\n${q.solution}`;
    }

    return preview;
  }

  const previewConsumerId = previewConsumer('bank');
  $effect(() => () => cancelPreview(previewConsumerId));
  $effect(() => {
    const q = previewedQuestion;
    const dark = isDark;
    if (!q) { previewSvg = null; previewFor = null; previewError = null; previewBusy = false; return; }
    const src = previewSource(q);
    // Re-render only when an image this question uses changes.
    imageStore.revisionOf(scanImageRefs(src));
    previewBusy = true;
    let cancelled = false;
    // A different question renders promptly; the delay only coalesces rapid key navigation.
    const timer = setTimeout(() => {
      if (cancelled) return;
      compileSvg(src, { consumer: previewConsumerId, images: sourceImages(q) }).then(async result => {
        if (cancelled || result.cancelled) return;
        perf.end('bank-select-preview', 'Bank: select to preview');
        previewBusy = false;
        if (result.svg) {
          previewSvg = result.svg;
          previewFor = q.id;
          previewError = null;
          if (q.renderError != null) await updateQuestion(q, { renderError: undefined, checked: true }, { validationOnly: true });
          else if (!q.checked) await updateQuestion(q, { checked: true }, { validationOnly: true });
        } else {
          const err = result.error ?? 'Error';
          previewError = err;
          previewSvg = null;
          previewFor = q.id;
          if (q.renderError !== err) await updateQuestion(q, { renderError: err, checked: true }, { validationOnly: true });
        }
      });
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  });

  $effect(() => {
    const q = selectedQ;
    // The seed field is only for typing a seed; the variant shown is in the Variant menu.
    if (q) algorithmSeedInput = '';
  });

  function selectQ(q: Question) {
    selectedQ = selectedQ?.id === q.id ? null : q;
    if (q.classId) appState.setLastClassId(q.classId);
  }

  async function closeQuestionPreview() {
    const id = selectedQ?.id;
    selectedQ = null;
    await tick();
    const card = id ? listEl?.querySelector<HTMLElement>(`[data-qid="${CSS.escape(id)}"]`) : null;
    const searchInput = document.querySelector<HTMLInputElement>('#tut-bank-filters .search');
    (card ?? searchInput)?.focus({ preventScroll: true });
  }

  function isBulkRealValue(value: BulkChoice): value is string {
    return value !== BULK_KEEP && value !== BULK_CLEAR && value !== BULK_ADD;
  }

  function commonSelectedValue(values: Array<string | undefined>): string {
    if (values.length === 0) return '';
    const normalized = values.map((value) => value ?? '');
    return normalized.every((value) => value === normalized[0]) ? normalized[0] : '';
  }

  function findBulkClass(classId: string, createdClass?: Class): Class | undefined {
    return createdClass?.id === classId ? createdClass : allClasses.find((cls) => cls.id === classId);
  }

  function findBulkUnit(classId: string, unitId: string, createdClass?: Class, createdUnit?: Unit): Unit | undefined {
    if (createdUnit && unitId === createdUnit.id) return createdUnit;
    return findBulkClass(classId, createdClass)?.units.find((unit) => unit.id === unitId);
  }

  function isQuestionSelected(q: Question): boolean {
    return selectedIds.has(q.id);
  }

  function clearQuestionSelection() {
    selectedIds = new Set();
    selectionAnchorId = null;
  }

  function previewQuestion(q: Question) {
    if (selectedQ?.id !== q.id) { perf.untilPaint('Bank: select to highlighted'); perf.begin('bank-select-preview'); }
    selectedQ = q;
    if (q.classId) appState.setLastClassId(q.classId);
  }

  function selectVisibleQuestions() {
    selectedIds = new Set(displayQuestions.map((q) => q.id));
    selectionAnchorId = displayQuestions.at(-1)?.id ?? null;
    if (!selectedQ && displayQuestions[0]) selectedQ = displayQuestions[0];
  }

  function toggleQuestionSelection(q: Question) {
    const next = new Set(selectedIds);
    if (next.has(q.id)) next.delete(q.id);
    else next.add(q.id);
    selectedIds = next;
    selectionAnchorId = q.id;
    previewQuestion(q);
  }

  function handleSelectionCheckboxClick(q: Question, event: MouseEvent) {
    event.stopPropagation();
    previewQuestion(q);

    if (event.shiftKey && selectedIds.size > 0) {
      selectQuestionRange(q, true);
      return;
    }

    toggleQuestionSelection(q);
  }

  function handleQuestionClick(q: Question, event: MouseEvent) {
    previewQuestion(q);
    if (selectedIds.size === 0) return;

    if (event.shiftKey) {
      selectQuestionRange(q, true);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      toggleQuestionSelection(q);
      return;
    }

    selectionAnchorId = q.id;
  }

  function selectQuestionRange(q: Question, additive: boolean) {
    const ids = displayQuestions.map((question) => question.id);
    const targetIndex = ids.indexOf(q.id);
    if (targetIndex === -1) return;

    const anchorIndex = selectionAnchorId ? ids.indexOf(selectionAnchorId) : -1;
    if (anchorIndex === -1) {
      selectedIds = new Set(additive ? [...selectedIds, q.id] : [q.id]);
      selectionAnchorId = q.id;
      return;
    }

    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    const next = additive ? new Set(selectedIds) : new Set<string>();
    for (const id of ids.slice(start, end + 1)) next.add(id);
    selectedIds = next;
    selectionAnchorId = q.id;
  }

  function parseMetadataTags(input: string): string[] {
    return [...new Set(
      input
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    )];
  }

  function onBulkClassChange(value: BulkChoice) {
    bulkClassId = value;
    bulkUnitId = BULK_KEEP;
    bulkSectionId = BULK_KEEP;
    if (value !== BULK_ADD) bulkNewClassName = '';
    bulkNewUnitName = '';
    bulkNewSectionName = '';
  }

  function onBulkUnitChange(value: BulkChoice) {
    bulkUnitId = value;
    bulkSectionId = BULK_KEEP;
    if (value !== BULK_ADD) bulkNewUnitName = '';
    bulkNewSectionName = '';
  }

  function onBulkSectionChange(value: BulkChoice) {
    bulkSectionId = value;
    if (value !== BULK_ADD) bulkNewSectionName = '';
  }

  function resetBulkEditor() {
    bulkClassId = BULK_KEEP;
    bulkUnitId = BULK_KEEP;
    bulkSectionId = BULK_KEEP;
    bulkNewClassName = '';
    bulkNewUnitName = '';
    bulkNewSectionName = '';
    bulkPointsInput = '';
    bulkTagMode = 'keep';
    bulkTagsInput = '';
  }

  async function applyBulkMetadata() {
    const targets = selectedQuestions;
    if (!targets.length) return;

    const pointsText = String(bulkPointsInput ?? '').trim();
    let points: number | undefined;
    if (pointsText) {
      points = Number(pointsText);
      if (!Number.isFinite(points) || points < 0) {
        setToast('Point value must be zero or greater');
        return;
      }
    }

    const tags = parseMetadataTags(bulkTagsInput);
    if ((bulkTagMode === 'add' || bulkTagMode === 'remove' || bulkTagMode === 'replace') && tags.length === 0) {
      setToast('Enter at least one tag');
      return;
    }

    let resolvedClassId: BulkChoice = bulkClassId;
    let resolvedUnitId: BulkChoice = bulkUnitId;
    let resolvedSectionId: BulkChoice = bulkSectionId;
    let createdClass: Class | undefined;
    let createdUnit: Unit | undefined;
    let createdSection: Section | undefined;
    const pendingNew = '__pending-new__';
    const newClassName = bulkClassId === BULK_ADD ? bulkNewClassName.trim() : '';
    const newUnitName = bulkUnitId === BULK_ADD ? bulkNewUnitName.trim() : '';
    const newSectionName = bulkSectionId === BULK_ADD ? bulkNewSectionName.trim() : '';

    if (bulkClassId === BULK_ADD && !newClassName) {
      setToast('Enter a class name');
      return;
    }

    let unitClassId = '';
    if (bulkUnitId === BULK_ADD) {
      if (!newUnitName) {
        setToast('Enter a unit name');
        return;
      }

      unitClassId = bulkClassId === BULK_ADD
        ? pendingNew
        : isBulkRealValue(resolvedClassId)
          ? resolvedClassId
          : commonSelectedValue(targets.map((q) => q.classId));
      if (!unitClassId) {
        setToast('Choose or add a class before adding a unit');
        return;
      }
      if (unitClassId !== pendingNew && !findBulkClass(unitClassId)) {
        setToast('Choose a valid class before adding a unit');
        return;
      }
    }

    let sectionClassId = '';
    let sectionUnitId = '';
    if (bulkSectionId === BULK_ADD) {
      if (!newSectionName) {
        setToast('Enter a section name');
        return;
      }
      if (bulkClassId === BULK_ADD && bulkUnitId !== BULK_ADD) {
        setToast('Add a unit before adding a section to a new class');
        return;
      }

      sectionClassId = bulkClassId === BULK_ADD
        ? pendingNew
        : isBulkRealValue(resolvedClassId)
          ? resolvedClassId
          : commonSelectedValue(targets.map((q) => q.classId));
      sectionUnitId = bulkUnitId === BULK_ADD
        ? pendingNew
        : isBulkRealValue(resolvedUnitId)
          ? resolvedUnitId
          : commonSelectedValue(targets.map((q) => q.unitId));
      if (!sectionClassId) {
        setToast('Choose or add a class before adding a section');
        return;
      }
      if (!sectionUnitId) {
        setToast('Choose or add a unit before adding a section');
        return;
      }
      if (
        sectionClassId !== pendingNew
        && sectionUnitId !== pendingNew
        && !findBulkUnit(sectionClassId, sectionUnitId)
      ) {
        setToast('Choose a valid unit before adding a section');
        return;
      }
    }

    if (bulkClassId === BULK_ADD) {
      createdClass = customClasses.add(newClassName);
      resolvedClassId = createdClass.id;
    }

    if (bulkUnitId === BULK_ADD) {
      const classId = isBulkRealValue(resolvedClassId) ? resolvedClassId : unitClassId;
      if (!classId || classId === pendingNew) {
        setToast('Enter a class name');
        return;
      }
      createdUnit = customClasses.addUnit(classId, newUnitName);
      resolvedUnitId = createdUnit.id;
      if (!isBulkRealValue(resolvedClassId)) resolvedClassId = classId;
    }

    if (bulkSectionId === BULK_ADD) {
      const classId = isBulkRealValue(resolvedClassId) ? resolvedClassId : sectionClassId;
      const unitId = isBulkRealValue(resolvedUnitId) ? resolvedUnitId : sectionUnitId;
      if (!classId || classId === pendingNew) {
        setToast('Choose or add a class before adding a section');
        return;
      }
      if (!unitId || unitId === pendingNew) {
        setToast('Choose or add a unit before adding a section');
        return;
      }
      if (!findBulkUnit(classId, unitId, createdClass, createdUnit)) {
        setToast('Choose a valid unit before adding a section');
        return;
      }

      createdSection = customClasses.addSection(classId, unitId, newSectionName);
      resolvedSectionId = createdSection.id;
      if (!isBulkRealValue(resolvedClassId)) resolvedClassId = classId;
      if (!isBulkRealValue(resolvedUnitId)) resolvedUnitId = unitId;
    }

    let changed = 0;
    for (const q of targets) {
      const updates: Partial<Omit<Question, 'id' | 'createdAt'>> = {};

      if (resolvedClassId === BULK_CLEAR) {
        updates.classId = undefined;
        updates.unitId = undefined;
        updates.sectionId = undefined;
      } else if (isBulkRealValue(resolvedClassId)) {
        updates.classId = resolvedClassId;
        updates.unitId = undefined;
        updates.sectionId = undefined;
      }

      if (resolvedUnitId === BULK_CLEAR) {
        updates.unitId = undefined;
        updates.sectionId = undefined;
      } else if (isBulkRealValue(resolvedUnitId)) {
        if (isBulkRealValue(resolvedClassId)) updates.classId = resolvedClassId;
        updates.unitId = resolvedUnitId;
        updates.sectionId = undefined;
      }

      if (resolvedSectionId === BULK_CLEAR) {
        updates.sectionId = undefined;
      } else if (isBulkRealValue(resolvedSectionId)) {
        if (isBulkRealValue(resolvedClassId)) updates.classId = resolvedClassId;
        if (isBulkRealValue(resolvedUnitId)) updates.unitId = resolvedUnitId;
        updates.sectionId = resolvedSectionId;
      }

      if (points !== undefined) updates.points = points;

      if (bulkTagMode === 'clear') {
        updates.tags = [];
      } else if (bulkTagMode === 'replace') {
        updates.tags = tags;
      } else if (bulkTagMode === 'add') {
        const currentTags = Array.isArray(q.tags) ? q.tags : [];
        updates.tags = [...new Set([...currentTags, ...tags])];
      } else if (bulkTagMode === 'remove') {
        const currentTags = Array.isArray(q.tags) ? q.tags : [];
        const remove = new Set(tags);
        updates.tags = currentTags.filter((tag) => !remove.has(tag.toLowerCase()));
      }

      if (Object.keys(updates).length === 0) continue;
      await updateQuestion(q, updates);
      changed++;
    }

    if (selectedQ) selectedQ = corpusQuestions.find((q) => q.id === selectedQ?.id) ?? selectedQ;
    if (createdClass) {
      bulkClassId = createdClass.id;
      bulkNewClassName = '';
    }
    if (createdUnit) {
      bulkUnitId = createdUnit.id;
      bulkNewUnitName = '';
    }
    if (createdSection) {
      bulkSectionId = createdSection.id;
      bulkNewSectionName = '';
    }
    setToast(`Updated ${changed} question${changed !== 1 ? 's' : ''}`);
  }

  async function deleteSelectedQuestions() {
    const targets = selectedQuestions;
    if (!targets.length) return;
    if (!confirm(`Delete ${targets.length} selected question${targets.length !== 1 ? 's' : ''}?`)) return;

    const ids = new Set(targets.map((q) => q.id));
    for (const question of targets) await removeQuestion(question);
    if (selectedQ && ids.has(selectedQ.id)) selectedQ = null;
    clearQuestionSelection();
    setToast(`Deleted ${targets.length} question${targets.length !== 1 ? 's' : ''}`);
  }

  function navigate(delta: number) {
    if (!displayQuestions.length) return;
    const idx = selectedQ ? displayQuestions.findIndex(q => q.id === selectedQ!.id) : -1;
    const next = idx === -1
      ? (delta > 0 ? 0 : displayQuestions.length - 1)
      : Math.max(0, Math.min(displayQuestions.length - 1, idx + delta));
    const q = displayQuestions[next];
    if (!q) return;
    const pageIndex = Math.floor(next / LIST_PAGE_SIZE);
    const pageChanged = pageIndex !== currentListPage;
    const hadCardFocus = !!listEl?.contains(document.activeElement) && document.activeElement !== listEl;
    perf.untilPaint('Bank: select to highlighted'); perf.begin('bank-select-preview');
    selectedQ = q;
    listPage = pageIndex;
    tick().then(() => {
      const card = listEl?.querySelector<HTMLElement>(`[data-qid="${CSS.escape(q.id)}"]`);
      if (hadCardFocus) card?.focus({ preventScroll: true });
      card?.scrollIntoView({ block: 'nearest', behavior: pageChanged ? 'instant' : 'smooth' });
    });
  }

  function isTextEntryTarget(target: EventTarget | null): boolean {
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
    if (target instanceof HTMLInputElement) {
      return target.type !== 'checkbox' && target.type !== 'radio';
    }
    return false;
  }

  function onkeydown(e: KeyboardEvent) {
    if (!window.location.hash.startsWith('#/bank') || infoClassId) return;
    if (isTextEntryTarget(e.target) || filterMenuOpen || questionActions) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selectVisibleQuestions();
    } else if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); navigate(1); }
    else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); navigate(-1); }
    else if (e.key === 'Escape') { selectedQ = null; clearQuestionSelection(); }
  }

  function handleQuestionKeydown(q: Question, event: KeyboardEvent) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    previewQuestion(q);
    if (selectedIds.size === 0) return;

    if (event.shiftKey) {
      selectQuestionRange(q, true);
    } else if (event.ctrlKey || event.metaKey) {
      toggleQuestionSelection(q);
    } else {
      selectionAnchorId = q.id;
    }
  }

  // ── Editor ───────────────────────────────────────────────────────────────
  function openNew() {
    newInEditor(selection.type === 'section'
      ? { classId: selection.classId, unitId: selection.unitId, sectionId: selection.sectionId }
      : selection.type === 'unit' ? { classId: selection.classId, unitId: selection.unitId, sectionId: '' }
      : selection.type === 'class' ? { classId: selection.classId, unitId: '', sectionId: '' } : {},
      selectedBankIds.length === 1 ? selectedBankIds[0] : undefined);
  }

  function editQuestion(q: Question) {
    openInEditor(q, sourceBankId(q), resolveQuestionNarrative(q, sourceNarratives(q))?.body);
  }

  async function confirmDelete(q: Question) {
    if (confirm(`Delete question from “${sourceName(q)}”?\n\n"${q.body.slice(0, 80)}..."`)) await removeQuestion(q);
  }

  function duplicateQuestion(q: Question) {
    const bankId = sourceBankId(q);
    const narrative = resolveQuestionNarrative(q, sourceNarratives(q))?.body;
    const copy = editor.duplicate(editor.open(q, bankId, narrative));
    editor.setTarget(copy, bankId);
    window.location.hash = `#/editor/${copy.id}`;
  }

  let questionActions = $state<{ id: string; trigger: HTMLButtonElement } | null>(null);
  let questionMenuEl = $state<HTMLDivElement | null>(null);
  let questionMenuPosition = $state({ left: 0, top: 0 });
  let actionQuestion = $derived(questionActions ? pageQuestions.find(q => q.id === questionActions!.id) : undefined);
  const questionMenuItems = () => Array.from(questionMenuEl?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

  function closeQuestionActions(focus = true) {
    const trigger = questionActions?.trigger;
    questionActions = null;
    if (focus && trigger?.isConnected) trigger.focus({ preventScroll: true });
  }

  async function openQuestionActions(q: Question, trigger: HTMLButtonElement, last = false) {
    filterMenuOpen = false;
    questionActions = { id: q.id, trigger };
    await tick();
    if (questionActions?.trigger !== trigger || !questionMenuEl) return;
    const button = trigger.getBoundingClientRect();
    const menu = questionMenuEl.getBoundingClientRect();
    questionMenuPosition = {
      left: Math.max(8, Math.min(window.innerWidth - menu.width - 8, button.right - menu.width)),
      top: button.bottom + menu.height + 6 <= window.innerHeight - 8
        ? button.bottom + 6 : Math.max(8, button.top - menu.height - 6),
    };
    const items = questionMenuItems();
    (last ? items.at(-1) : items[0])?.focus({ preventScroll: true });
  }

  function toggleQuestionActions(q: Question, event: MouseEvent) {
    event.stopPropagation();
    if (questionActions?.id === q.id) closeQuestionActions();
    else void openQuestionActions(q, event.currentTarget as HTMLButtonElement);
  }

  function questionActionsTriggerKey(q: Question, event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      void openQuestionActions(q, event.currentTarget as HTMLButtonElement, event.key === 'ArrowUp');
    } else if (questionActions && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeQuestionActions();
    } else if (questionActions && event.key === 'Tab') closeQuestionActions(false);
  }

  function questionActionsKeydown(event: KeyboardEvent) {
    event.stopPropagation();
    const items = questionMenuItems();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = ({ ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 } as Record<string, number>)[event.key];
    if (next !== undefined && items.length) {
      event.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeQuestionActions();
    } else if (event.key === 'Tab') closeQuestionActions();
  }

  function duplicateFromQuestionMenu() {
    const q = actionQuestion;
    closeQuestionActions(false);
    if (q) duplicateQuestion(q);
  }

  async function deleteFromQuestionMenu() {
    const q = actionQuestion;
    const trigger = questionActions?.trigger;
    const card = trigger?.closest('.card');
    const candidates = [card?.nextElementSibling, card?.previousElementSibling, trigger?.closest('.main')?.querySelector('.search')];
    closeQuestionActions();
    if (!q) return;
    await confirmDelete(q);
    if (corpusQuestions.some(question => question.id === q.id)) return;
    if (selectedQ?.id === q.id) selectedQ = null;
    await tick();
    const next = candidates.find((node): node is HTMLElement => node instanceof HTMLElement && node.isConnected);
    next?.focus();
  }

  $effect(() => {
    if (questionActions && !actionQuestion) closeQuestionActions(false);
  });

  $effect(() => {
    if (!questionActions) return;
    const trigger = questionActions.trigger;
    const outside = (event: Event) => {
      if (!questionMenuEl?.contains(event.target as Node) && !trigger.contains(event.target as Node)) closeQuestionActions(false);
    };
    const dismiss = () => closeQuestionActions(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('hashchange', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('hashchange', dismiss);
    };
  });

  function canCalculateValues(q: Question): boolean {
    return Boolean(q.algorithmModel?.definitions.some((definition) => definition.rawExpression || definition.sampleValue));
  }

  // Store redrawn graphs, then point the question at them.
  async function applyVariant(q: Question, result: NonNullable<ReturnType<typeof calculateAlgorithmicQuestionVariant>>, extra: Partial<Question>) {
    for (const image of result.images ?? []) {
      if (!imageStore.has(image.name)) await imageStore.put(image.name, new TextEncoder().encode(image.svg), 'svg');
    }
    await updateQuestion(q, { ...result.updates, ...extra });
    const updated = { ...q, ...result.updates, ...extra };
    if (selectedQ?.id === q.id) selectedQ = updated;
  }

  /** A new variant: the seed typed in the preview, or a random one. */
  async function newVariant(q: Question, seed?: number) {
    const result = calculateAlgorithmicQuestionVariant(q, seed);
    if (!result) {
      setToast('No algorithm values available');
      return;
    }
    const history = withVariant(q, result.seed);
    await applyVariant(q, result, { algorithmHistory: history, algorithmVariant: history.indexOf(result.seed) + 1 });
    if (selectedQ?.id === q.id) algorithmSeedInput = '';
    setToast(`Variant ${history.indexOf(result.seed) + 1} (seed ${result.seed})`);
  }

  /** Show a variant from the history, or the imported original. */
  async function showVariant(q: Question, key: string) {
    if (key === 'original') {
      const result = calculateAlgorithmicQuestionOriginal(q);
      if (!result) return;
      // Use the original pictures when they're still stored; otherwise the graphs redrawn with the imported values.
      const keep = (result.images ?? []).filter((image) => !imageStore.has(image.name.replace(/-g[0-9a-f]{8}$/, '')));
      const back = new Map((result.images ?? []).filter((image) => !keep.includes(image)).map((image) => [image.name, image.name.replace(/-g[0-9a-f]{8}$/, '')]));
      const repoint = (text: string | undefined) => text?.replace(/\/imgs\/([\w-]+)/g, (match, name: string) => (back.has(name) ? `/imgs/${back.get(name)}` : match));
      const updates = { ...result.updates };
      for (const field of ['body', 'narrative', 'solution'] as const) if (typeof updates[field] === 'string') updates[field] = repoint(updates[field]);
      if (updates.choices) updates.choices = Object.fromEntries(Object.entries(updates.choices).map(([id, text]) => [id, repoint(text) ?? text]));
      await applyVariant(q, { ...result, updates, images: keep }, { algorithmHistory: variantSeeds(q) });
      setToast('Showing the original (imported) values');
      return;
    }
    const seed = Number(key);
    const result = calculateAlgorithmicQuestionVariant(q, seed);
    if (!result) return;
    const history = withVariant(q, seed);
    await applyVariant(q, result, { algorithmHistory: history, algorithmVariant: history.indexOf(seed) + 1 });
    setToast(`Showing variant ${history.indexOf(seed) + 1} (seed ${seed})`);
  }

  async function deleteVariant(q: Question, seed: number) {
    const updated = { ...q, algorithmHistory: withoutVariant(q, seed) };
    await updateQuestion(q, { algorithmHistory: updated.algorithmHistory });
    if (selectedQ?.id === q.id) selectedQ = updated;
  }

  async function clearOldVariants(q: Question) {
    const updated = { ...q, algorithmHistory: withoutOldVariants(q) };
    await updateQuestion(q, { algorithmHistory: updated.algorithmHistory });
    if (selectedQ?.id === q.id) selectedQ = updated;
    setToast('Old variants cleared');
  }

  function parseSeedInput(): number | undefined | null {
    const trimmed = algorithmSeedInput.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffffffff) return null;
    return parsed >>> 0;
  }

  function newSelectedVariant() {
    if (!previewedQuestion) return;
    const seed = parseSeedInput();
    if (seed === null) {
      setToast('Seed must be a whole number from 0 to 4294967295');
      return;
    }
    newVariant(previewedQuestion, seed);
  }

  // ── Label helpers ────────────────────────────────────────────────────────
  function questionLocation(q: Question): string {
    const cls = allClasses.find(entry => entry.id === q.classId);
    const unit = cls?.units.find(entry => entry.id === q.unitId);
    const section = unit?.sections.find(entry => entry.id === q.sectionId);
    return [cls?.name, unit ? unitLabel(unit) : '', section ? curriculumSectionLabel(section) : '']
      .filter(Boolean).join(' / ') || 'Unassigned curriculum';
  }

  function sectionLabel(q: Question): string {
    if (!q.classId || !q.unitId) return '';
    const unit = findUnit(q.classId, q.unitId);
    if (!unit) return '';
    if (!q.sectionId) return `Unit ${q.unitId}: ${unit.name}`;
    const sec = findSection(q.classId, q.unitId, q.sectionId);
    return sec ? curriculumSectionLabel(sec, ' — ') : q.sectionId;
  }

</script>

<svelte:window onkeydown={onkeydown} />

<div class="view">
  <!-- ── Sidebar: curriculum tree ────────────────────────────────────── -->
  <nav id="tut-bank-sidebar" class="sidebar" class:collapsed={sidebarCollapsed} style="width: {sidebarCollapsed ? 0 : sidebarWidth}px">
    <BankSwitcher bind:selected={selectedBankIds} />
    {#snippet chevron(expanded: boolean, toggle: () => void)}
      <button class="expander" class:open={expanded} tabindex="-1" onclick={toggle} title={expanded ? 'Collapse' : 'Expand'} aria-label={expanded ? 'Collapse' : 'Expand'}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" /></svg>
      </button>
    {/snippet}
    {#snippet count(n: number)}
      <span class="row-count" class:zero={n === 0}>{n}</span>
    {/snippet}

    <div class="tree" role="tree" aria-label="Question curriculum">
      <!-- "All Questions" root node -->
      <div class="tree-node all" class:active={selection.type === 'all'} role="treeitem" aria-selected={selection.type === 'all'} style="--depth: 0">
        <span class="expander-space"></span>
        <button class="row-main" onclick={() => select({ type: 'all' })} title="Show all questions">
          <span class="node-label">All Questions</span>
        </button>
        {@render count(corpusQuestions.length)}
      </div>

      {#each allClasses as cls}
        {@const clsOpen = expandedClasses.has(cls.id)}
        {@const clsActive = selection.type === 'class' && selection.classId === cls.id}
        <div class="tree-node class-row" class:active={clsActive} role="treeitem" aria-selected={clsActive} aria-expanded={clsOpen} style="--depth: 0">
          {@render chevron(clsOpen, () => toggleClass(cls.id))}
          <button
            class="row-main class-name-btn"
            onclick={() => { const wasOpen = clsOpen; selectClass(cls.id); if (wasOpen) toggleClass(cls.id); }}
            onkeydown={(e) => treeKey(e, clsOpen, () => toggleClass(cls.id))}
            title="Filter to {cls.name}"
          ><span class="node-label">{cls.name}</span></button>
          <button class="class-info-btn" onclick={(e) => { e.stopPropagation(); infoClassId = cls.id; }} title="Class info / rename">ⓘ</button>
          {@render count(classCount(cls.id))}
        </div>

        {#if clsOpen}
          {#each [...cls.units].sort(compareUnits) as unit}
            {@const expanded = expandedUnits.has(unit.id)}
            {@const unitActive = selection.type === 'unit' && selection.classId === cls.id && selection.unitId === unit.id}
            <div class="tree-node unit" class:active={unitActive} role="treeitem" aria-selected={unitActive} aria-expanded={unit.sections.length ? expanded : undefined} style="--depth: 1">
              {#if unit.sections.length}
                {@render chevron(expanded, () => toggleUnit(unit.id))}
              {:else}
                <span class="expander-space"></span>
              {/if}
              <button
                class="row-main"
                onclick={() => { select({ type: 'unit', classId: cls.id, unitId: unit.id }); if (unit.sections.length) toggleUnit(unit.id); }}
                onkeydown={(e) => treeKey(e, expanded, () => toggleUnit(unit.id))}
                title="Filter to {unitLabel(unit)}"
              >
                <span class="node-label">{unitLabel(unit)}</span>
              </button>
              {@render count(unitCount(cls.id, unit.id))}
            </div>

            {#if expanded}
              {#each unit.sections as sec}
                {@const secActive = selection.type === 'section' &&
                  selection.classId === cls.id &&
                  selection.unitId === unit.id &&
                  selection.sectionId === sec.id}
                <div class="tree-node section" class:active={secActive} role="treeitem" aria-selected={secActive} style="--depth: 2">
                  <span class="expander-space"></span>
                  <button
                    class="row-main"
                    title="Filter to {curriculumSectionLabel(sec)}"
                    onclick={() =>
                      select({
                        type: 'section',
                        classId: cls.id,
                        unitId: unit.id,
                        sectionId: sec.id,
                      })}
                  >
                    <span class="node-label">{curriculumSectionLabel(sec)}</span>
                  </button>
                  {@render count(sectionCount(cls.id, unit.id, sec.id))}
                </div>
              {/each}
            {/if}
          {/each}
        {/if}
      {/each}
    </div>
  </nav>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resize-handle" onmousedown={(e) => startResize('sidebar', e)} title="Drag to resize the sidebar; click to collapse or expand"></div>

  <!-- ── Main area ───────────────────────────────────────────────────── -->
  <div class="main">
    <!-- The sidebar is hidden on phones, so its bank switcher shows here instead. -->
    <div class="mobile-bank-switcher"><BankSwitcher bind:selected={selectedBankIds} /></div>
    <!-- The view switch stays in the same place in Questions and Curriculum. -->
    <div id="tut-type-tabs" class="type-tabs">
      <div class="bank-heading">
        <h1>{bankMode === 'questions' ? 'Questions' : 'Curriculum'}</h1>
        {#if bankMode === 'questions'}
          <span class="question-count" role="status" aria-label="{displayQuestions.length.toLocaleString()} questions">{displayQuestions.length.toLocaleString()}</span>
        {/if}
      </div>
      <div class="mode-switch" role="group" aria-label="Bank view">
        <button class:active={bankMode === 'questions'} aria-pressed={bankMode === 'questions'} onclick={() => bankMode = 'questions'}>Questions</button>
        <button class:active={bankMode === 'curriculum'} aria-pressed={bankMode === 'curriculum'} title="Each class’s units, sections and achievement indicators, with how many questions cover each"
          onclick={() => { filterMenuOpen = false; curriculumClassId = classFilter ?? (selection.type === 'all' ? openClassId : selection.classId) ?? ''; bankMode = 'curriculum'; }}>Curriculum</button>
      </div>
    </div>

    {#if bankMode === 'curriculum'}
      <CurriculumView classes={allClasses} questions={corpusQuestions} bind:classId={curriculumClassId} onshow={showFromCurriculum} />
    {:else}

    {#if allClasses.length > 1}
      <div class="class-tabs">
        <button class:active={classFilter === null} onclick={() => setClassFilter(null)} title="Show all classes">All</button>
        {#each allClasses as cls}
          <button class:active={classFilter === cls.id} onclick={() => setClassFilter(cls.id)} title="Show only {cls.name}">
            {cls.name}
          </button>
        {/each}
      </div>
    {/if}

    {#if confirmClearClassId}
      {@const cls = allClasses.find(c => c.id === confirmClearClassId)}
      <div class="clear-confirm">
        <span>Remove all {cls?.name} questions? This cannot be undone.</span>
        <div class="confirm-actions">
          <button class="ghost" onclick={() => confirmClearClassId = null} title="Keep all questions">Cancel</button>
          <button class="danger" onclick={() => clearBuiltInClass(confirmClearClassId!)} title="Permanently delete all questions in this class">Remove all</button>
        </div>
      </div>
    {:else if classFilter && CLASSES.find(c => c.id === classFilter)}
      <div class="clear-bar">
        <span class="clear-hint">These are bundled starter questions.</span>
        <button class="danger ghost" onclick={() => confirmClearClassId = classFilter} title="Permanently delete all questions in this class">Remove all questions…</button>
      </div>
    {/if}

    <div id="tut-bank-filters" class="sort-bar">
      <input
        class="search"
        type="search"
        placeholder="Search questions or tags…"
        aria-label="Search questions or tags"
        bind:value={search}
      />
      <div class="tag-filter" bind:this={filterMenuEl}>
        <button
          class="filter-trigger"
          class:active={activeFilterCount > 0}
          bind:this={filterTriggerEl}
          onclick={toggleFilters}
          title="Filter by question type, features, and tags"
          aria-expanded={filterMenuOpen}
          aria-controls="bank-filter-menu"
          aria-haspopup="dialog"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4" /></svg>
          Filters{#if activeFilterCount > 0}<span class="filter-count">{activeFilterCount}</span>{/if}
        </button>

        {#if filterMenuOpen}
          <div id="bank-filter-menu" class="tag-menu" role="dialog" aria-label="Question filters">
            <div class="filter-menu-title">
              <strong>Filters</strong>
              <button class="ghost" onclick={clearFilters} disabled={activeFilterCount === 0}>Reset filters</button>
            </div>
            <div class="filter-section">
              <span class="filter-label" id="bank-question-type">Question type</span>
              <div class="filters-section" role="group" aria-labelledby="bank-question-type">
                <button class:active={typeFilter === ''} aria-pressed={typeFilter === ''} onclick={() => typeFilter = ''} title="Show all question types">All Types</button>
                <button class:active={typeFilter === 'mcq'} aria-pressed={typeFilter === 'mcq'} onclick={() => typeFilter = 'mcq'} title="Show only multiple-choice questions">MCQ</button>
                <button class:active={typeFilter === 'frq'} aria-pressed={typeFilter === 'frq'} onclick={() => typeFilter = 'frq'} title="Show only free-response questions">FRQ</button>
              </div>
            </div>
            <div class="filter-section">
              <span class="filter-label" id="bank-question-features">Features</span>
              <div class="filters-section" role="group" aria-labelledby="bank-question-features">
                <button class:active={graphFilter} aria-pressed={graphFilter} onclick={() => graphFilter = !graphFilter} title="Show only questions tagged as graph">Graph</button>
                <button class:active={algorithmFilter} aria-pressed={algorithmFilter} onclick={() => algorithmFilter = !algorithmFilter} title="Show only algorithmic questions (questions that can calculate new values)">Algorithmic</button>
                {#if errorCount > 0}
                  <button class="error-filter-btn" class:active={errorFilter} aria-pressed={errorFilter} onclick={() => errorFilter = !errorFilter} title="Show only questions that failed the last render check">Errors · {errorCount}</button>
                {/if}
              </div>
            </div>
            <div class="tag-menu-head">
              <div class="tag-menu-label">
                <label class="filter-label" for="bank-tag-search">Tags</label>
                <div class="tag-mode" role="group" aria-label="Tag matching">
                  <button class:active={tagMatchAll} aria-pressed={tagMatchAll} onclick={() => tagMatchAll = true} title="Questions must have every checked tag">All</button>
                  <button class:active={!tagMatchAll} aria-pressed={!tagMatchAll} onclick={() => tagMatchAll = false} title="Questions with any checked tag">Any</button>
                </div>
              </div>
              <input
                id="bank-tag-search"
                class="tag-menu-search"
                type="search"
                placeholder="Find a tag…"
                bind:value={tagSearch}
              />
            </div>

            <div class="tag-menu-list">
              {#each visibleTagOptions as option (option.tag)}
                <label class="tag-option">
                  <input
                    type="checkbox"
                    checked={selectedTags.includes(option.tag)}
                    onchange={() => toggleTag(option.tag)}
                  />
                  <span class="tag-option-name">{option.tag}</span>
                  <span class="tag-option-count">{option.count}</span>
                </label>
              {:else}
                <p class="tag-empty">{tagOptions.length === 0 ? 'No tags in this view' : 'No tags match'}</p>
              {/each}
            </div>

            <div class="tag-menu-foot">
              <button class="ghost" onclick={clearTagFilter} disabled={selectedTags.length === 0}>Clear tags</button>
              <button class="primary" onclick={closeFilters}>Done</button>
            </div>
          </div>
        {/if}
      </div>
    </div>

    {#if activeFilterCount > 0}
      <div class="active-filters" aria-label="Active question filters">
        {#if typeFilter}<button onclick={() => typeFilter = ''} aria-label="Remove {typeFilter.toUpperCase()} filter">{typeFilter.toUpperCase()} <span aria-hidden="true">×</span></button>{/if}
        {#if graphFilter}<button onclick={() => graphFilter = false} aria-label="Remove Graph filter">Graph <span aria-hidden="true">×</span></button>{/if}
        {#if algorithmFilter}<button onclick={() => algorithmFilter = false} aria-label="Remove Algorithmic filter">Algorithmic <span aria-hidden="true">×</span></button>{/if}
        {#if errorFilter}<button onclick={() => errorFilter = false} aria-label="Remove Errors filter">Errors <span aria-hidden="true">×</span></button>{/if}
        {#each selectedTags as tag (tag)}<button onclick={() => toggleTag(tag)} aria-label="Remove tag {tag} filter">{tag} <span aria-hidden="true">×</span></button>{/each}
        <button class="ghost clear-filters" onclick={clearFilters}>Clear all</button>
      </div>
    {/if}

    <div class="list-toolbar">
      <div class="selection-tools">
        <button class="select-visible-btn" onclick={selectVisibleQuestions} disabled={displayQuestions.length === 0} title="Select every visible question">Select visible</button>
        <div class="sort-wrapper">
          <select id="sort-select" bind:value={sortBy} title="Sort questions" class="sort-select">
            <option value="import">Import order</option>
            <option value="date">Date added (newest first)</option>
            <option value="points">Point value (highest first)</option>
            <option value="unit">Unit</option>
            <option value="edited">Last edited (newest first)</option>
          </select>
          <span class="sort-prefix">Sort by </span>
        </div>
      </div>
      <div id="tut-toolbar" class="actions-section">
        <button onclick={() => imageLibraryOpen = true} title="Browse, upload, and manage stored images">Image library</button>
        {#if bulkRunning}
          <div class="check-progress-group">
            <div class="check-progress-bar">
              <div class="check-progress-fill" style="width: {(bulkProgress / bulkTotal) * 100}%"></div>
            </div>
            <span class="check-progress-text">{bulkProgress}/{bulkTotal}</span>
            <button onclick={() => bulkCancelled = true} title="Stop the render check">Cancel</button>
          </div>
        {:else}
          <button onclick={runBulkCheck} disabled={displayQuestions.length === 0} title="Render-check visible questions for Typst errors">Check{bulkErrors > 0 ? ` · ${bulkErrors} errors` : ''}</button>
        {/if}
      </div>
    </div>

    {#if selectedQuestions.length > 0}
      <div class="bulk-editor">
        <div class="bulk-summary">
          <strong>{selectedQuestions.length} selected</strong>
          {#if selectedVisibleCount !== selectedQuestions.length}
            <span>{selectedVisibleCount} visible</span>
          {/if}
          <AddToTestMenu ids={selectedInOrder} ondone={(message, ok) => addResult = { message, ok }} />
        </div>
        <div class="bulk-fields">
          <label>
            <span>Class</span>
            <select
              value={bulkClassId}
              onchange={(event) => onBulkClassChange((event.currentTarget as HTMLSelectElement).value as BulkChoice)}
            >
              <option value={BULK_KEEP}>Keep</option>
              <option value={BULK_CLEAR}>Clear</option>
              <option value={BULK_ADD}>Add new</option>
              {#each allClasses as cls}
                <option value={cls.id}>{cls.name}</option>
              {/each}
            </select>
          </label>

          {#if bulkClassId === BULK_ADD}
            <label class="bulk-new-field">
              <span>New class</span>
              <input type="text" placeholder="Class name" bind:value={bulkNewClassName} />
            </label>
          {/if}

          <label>
            <span>Unit</span>
            <select
              value={bulkUnitId}
              disabled={bulkClassId === BULK_CLEAR}
              onchange={(event) => onBulkUnitChange((event.currentTarget as HTMLSelectElement).value as BulkChoice)}
            >
              <option value={BULK_KEEP}>Keep</option>
              <option value={BULK_CLEAR}>Clear</option>
              <option value={BULK_ADD}>Add new</option>
              {#each bulkUnitOptions as unit}
                <option value={unit.id}>{unitLabel(unit)}</option>
              {/each}
            </select>
          </label>

          {#if bulkUnitId === BULK_ADD}
            <label class="bulk-new-field">
              <span>New unit</span>
              <input type="text" placeholder="Unit name" bind:value={bulkNewUnitName} />
            </label>
          {/if}

          <label>
            <span>Section</span>
            <select
              value={bulkSectionId}
              disabled={bulkClassId === BULK_CLEAR || bulkUnitId === BULK_CLEAR}
              onchange={(event) => onBulkSectionChange((event.currentTarget as HTMLSelectElement).value as BulkChoice)}
            >
              <option value={BULK_KEEP}>Keep</option>
              <option value={BULK_CLEAR}>Clear</option>
              <option value={BULK_ADD}>Add new</option>
              {#each bulkSectionOptions as sec}
                <option value={sec.id}>{sec.id} {sec.name}</option>
              {/each}
            </select>
          </label>

          {#if bulkSectionId === BULK_ADD}
            <label class="bulk-new-field">
              <span>New section</span>
              <input type="text" placeholder="Section name" bind:value={bulkNewSectionName} />
            </label>
          {/if}

          <label class="bulk-points-field">
            <span>Points</span>
            <input type="number" min="0" step="0.5" placeholder="Keep" bind:value={bulkPointsInput} />
          </label>

          <label>
            <span>Tags</span>
            <select bind:value={bulkTagMode}>
              <option value="keep">Keep</option>
              <option value="add">Add</option>
              <option value="remove">Remove</option>
              <option value="replace">Replace</option>
              <option value="clear">Clear</option>
            </select>
          </label>

          {#if bulkTagMode === 'add' || bulkTagMode === 'remove' || bulkTagMode === 'replace'}
            <label class="bulk-tags-field">
              <span>Tag list</span>
              <input type="text" placeholder="tag-one, tag-two" bind:value={bulkTagsInput} />
            </label>
          {/if}
        </div>
        <div class="bulk-actions">
          <button class="primary" onclick={applyBulkMetadata} disabled={!hasBulkMetadataChange} title="Apply metadata changes to selected questions">Apply</button>
          <button class="danger ghost" onclick={deleteSelectedQuestions} title="Delete selected questions">Delete</button>
          <button class="ghost" onclick={() => { clearQuestionSelection(); resetBulkEditor(); }} title="Clear selected questions">Clear</button>
        </div>
        {#if addResult}
          <p class="add-result" class:error={!addResult.ok} role="status">{addResult.message}{#if addResult.ok}{' · '}<a href="#/build">Open in Build</a>{/if}</p>
        {/if}
      </div>
    {/if}

    {#if indicatorFilter}
      {@const entry = indicatorFilter === UNTAGGED ? null : indicatorCatalog.get(indicatorFilter)}
      <div class="indicator-chip" role="status">
        <span>{indicatorFilter === UNTAGGED ? 'Questions without an achievement indicator' : `Indicator ${indicatorFilter}${entry ? `: ${indicatorLabel(entry)}` : ''}`}</span>
        <button class="ghost small" onclick={() => indicatorFilter = null} aria-label="Clear the indicator filter" title="Clear the indicator filter">✕</button>
      </div>
    {/if}

    <div class="list" bind:this={listEl}>
      {#if corpusLoading && corpusSources.length === 0}
        <div class="empty"><p>Loading selected banks…</p></div>
      {:else if corpusError && corpusSources.length === 0}
        <div class="empty"><p class="error">{corpusError}</p></div>
      {:else if corpusQuestions.length === 0}
        <div class="empty">
          <p>{selectedBankIds.length ? 'No questions in the selected banks.' : 'Select one or more question banks.'}</p>
          <button class="primary" onclick={openNew} title="Add a new question manually">Add your first question</button>
        </div>
      {:else if displayQuestions.length === 0}
        <div class="empty">
          <p>No questions match this filter.</p>
        </div>
      {:else}
        {#each pageQuestions as q (q.id)}
          <div
            class="card"
            class:selected={selectedQ?.id === q.id}
            class:bulkSelected={isQuestionSelected(q)}
            data-qid={q.id}
            role="button"
            tabindex="0"
            aria-pressed={selectedQ?.id === q.id}
            onclick={(event) => handleQuestionClick(q, event)}
            onkeydown={(event) => handleQuestionKeydown(q, event)}
          >
            <input
              class="select-box"
              type="checkbox"
              checked={isQuestionSelected(q)}
              aria-label="Select question"
              title="Select question"
              onclick={(event) => handleSelectionCheckboxClick(q, event)}
            />
            <div class="card-main">
              <div class="body"><QuestionSnippet body={q.parts ? q.parts.stem || q.parts.items[0]?.body || q.body : q.body} /></div>
              <div class="meta">
                {#if selectedBankIds.length > 1}<span class="tag source-bank">{sourceName(q)}</span>{/if}
                <span class="pts">{q.points} {q.points === 1 ? 'pt' : 'pts'}</span>
                {#if q.choices && Object.keys(q.choices).length >= 2}
                  <span class="badge-mc">MC</span>
                {:else if q.solution && /^[A-Ea-e]$/.test(q.solution)}
                  <span class="badge-mc">MC</span>
                {/if}
                {#if q.renderError}
                  <span class="badge-error" title={q.renderError}>❌</span>
                {:else if !q.checked}
                  <span class="badge-unchecked" title="Not yet render-checked — run Check to validate">◯</span>
                {/if}
                {#if sectionLabel(q)}
                  <span class="loc">{sectionLabel(q)}</span>
                {/if}
                {#each q.indicators ?? [] as id}
                  <span class="tag indicator" title={indicatorCatalog.get(id) ? indicatorLabel(indicatorCatalog.get(id)!) : 'Achievement indicator'}>{id}</span>
                {/each}
                {#each q.tags as tag}
                  <span class="tag">{tag}</span>
                {/each}
              </div>
            </div>
            <div class="card-actions">
              {#if canCalculateValues(q)}
                <button class="ghost" onclick={(e) => { e.stopPropagation(); newVariant(q); }} title="Calculate a new variant with a random seed">New variant</button>
              {/if}
              <button class="ghost" onclick={(e) => { e.stopPropagation(); editQuestion(q); }} title="Edit this question in {sourceName(q)}">Edit</button>
              <button
                class="ghost more-actions"
                aria-label="More question actions"
                aria-haspopup="menu"
                aria-controls={questionActions?.id === q.id ? 'bank-question-actions-menu' : undefined}
                aria-expanded={questionActions?.id === q.id}
                title="More question actions"
                onclick={(event) => toggleQuestionActions(q, event)}
                onkeydown={(event) => questionActionsTriggerKey(q, event)}
              ><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.75" /><circle cx="12" cy="12" r="1.75" /><circle cx="19" cy="12" r="1.75" /></svg></button>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    {#if listPageCount > 1}
      <nav class="bank-pagination" aria-label="Question pages">
        <button class="ghost" aria-label="Previous question page" disabled={currentListPage === 0} onclick={() => showListPage(currentListPage - 1)}>Previous</button>
        <span aria-live="polite">{(currentListPage * LIST_PAGE_SIZE + 1).toLocaleString()}–{Math.min((currentListPage + 1) * LIST_PAGE_SIZE, displayQuestions.length).toLocaleString()} of {displayQuestions.length.toLocaleString()}</span>
        <button class="ghost" aria-label="Next question page" disabled={currentListPage >= listPageCount - 1} onclick={() => showListPage(currentListPage + 1)}>Next</button>
      </nav>
    {/if}
    {/if}

    <div class="status">
      {corpusQuestions.length} question{corpusQuestions.length !== 1 ? 's' : ''} in {selectedBankIds.length} selected bank{selectedBankIds.length === 1 ? '' : 's'}
      {#if displayQuestions.length !== corpusQuestions.length}
        &nbsp;· {displayQuestions.length} shown
      {/if}
    </div>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resize-handle" onmousedown={(e) => startResize('preview', e)} class:hidden={!selectedQ} title="Drag to resize the question preview"></div>

  <!-- ── Preview panel ──────────────────────────────────────────────── -->
  <aside id="tut-preview-pane" class="preview-panel" class:hidden={!selectedQ} aria-label="Question preview" aria-hidden={!selectedQ} style="flex-basis: {previewWidth}px">
    {#if !previewedQuestion}
      <div class="preview-empty">Click a question to preview</div>
    {:else}
      {@const question = previewedQuestion}
      {@const selectedNarrative = resolveQuestionNarrative(question, sourceNarratives(question))}
      <header class="preview-header">
        <div class="preview-title-row">
          <h2>Question preview</h2>
          <button class="ghost preview-close" onclick={closeQuestionPreview} aria-label="Close question preview" title="Close question preview"><span aria-hidden="true">×</span></button>
        </div>
        <p class="preview-location" title={questionLocation(question)}>{questionLocation(question)}</p>
        <div class="preview-info-row">
          <div class="preview-meta">
            <span class="preview-bank" title={sourceName(question)}>{sourceName(question)}</span>
            <span aria-hidden="true">·</span>
            <span>{question.points} {question.points === 1 ? 'point' : 'points'}</span>
            <span aria-hidden="true">·</span>
            <span>{isMCQQuestion(question) ? 'Multiple choice' : 'Free response'}</span>
          </div>
          <button class="preview-edit" onclick={() => editQuestion(question)} title="Edit this question in {sourceName(question)}">Edit question</button>
        </div>
      </header>
      <div class="preview-body">
        {#if corpusLoading}
          <div class="preview-load-status" role="status"><span class="spinner" aria-hidden="true"></span>Loading selected banks…</div>
        {:else if corpusError}
          <div class="preview-load-status error" role="alert">{corpusError}</div>
        {/if}
        {#if canCalculateValues(question)}
          {@const seeds = variantSeeds(question)}
          {@const showing = question.algorithmSeed}
          <div class="preview-actions">
            <label class="variant-control">
              <span>Variant</span>
              <select
                value={showing !== undefined ? String(showing) : question.algorithmEvaluation ? 'current' : 'original'}
                onchange={(event) => showVariant(question, (event.currentTarget as HTMLSelectElement).value)}
                title="Show the original or an earlier variant"
              >
                {#if showing === undefined && question.algorithmEvaluation}
                  <!-- Calculated before seeds were saved with the question: the values are there, the seed isn't. -->
                  <option value="current" disabled>Current values (seed not recorded)</option>
                {/if}
                {#if (showing === undefined && !question.algorithmEvaluation) || canRestoreAlgorithmicOriginal(question)}
                  <option value="original">Original (imported values)</option>
                {/if}
                {#each seeds as seed, index (seed)}
                  <option value={String(seed)}>Variant {index + 1} · seed {seed}</option>
                {/each}
              </select>
            </label>
            <label class="seed-control">
              <span>Seed</span>
              <input
                type="number"
                min="0"
                max="4294967295"
                placeholder="random"
                value={algorithmSeedInput}
                oninput={(event) => {
                  algorithmSeedInput = (event.currentTarget as HTMLInputElement).value;
                }}
                onkeydown={(event) => { if (event.key === 'Enter') { event.preventDefault(); newSelectedVariant(); } }}
                title="Optional: a seed to reproduce a variant. Leave empty for a random one."
              />
            </label>
            <button class="primary small" onclick={newSelectedVariant} title="Calculate a new variant, using the seed field or a random seed">New variant</button>
          </div>
          {#if seeds.length > (showing === undefined ? 0 : 1)}
            <details class="variant-manager">
              <summary>Manage variants ({seeds.length})</summary>
              <ul>
                {#each seeds as seed, index (seed)}
                  <li>
                    <span>Variant {index + 1} · seed {seed}{seed === showing ? ' (showing)' : ''}</span>
                    <button class="ghost small" onclick={() => deleteVariant(question, seed)} disabled={seed === showing} title={seed === showing ? 'The variant being shown can’t be deleted' : 'Delete this variant'} aria-label="Delete variant {index + 1}">✕</button>
                  </li>
                {/each}
              </ul>
              <button class="ghost small" onclick={() => clearOldVariants(question)} title="Keep only the variant being shown">Clear old variants</button>
            </details>
          {/if}
        {/if}

        {#if selectedNarrative}
          <div class="narrative-callout">
            <strong>{narrativeLabel(question, sourceNarratives(question))}</strong>
            <p>{selectedNarrative.body}</p>
          </div>
        {/if}

        {#if previewBusy && !previewSvg}
          <div class="preview-empty" role="status">
            <div class="spinner" aria-hidden="true"></div>
            <span>Rendering question…</span>
          </div>
        {:else if previewSvg}
          {@const otherQuestion = previewFor !== question.id}
          <div class="preview-svg" class:stale={previewBusy || otherQuestion} aria-busy={previewBusy || otherQuestion} data-preview-for={previewFor}>
            <div class="preview-svg-content" aria-hidden={otherQuestion}>{@html previewSvg}</div>
            {#if otherQuestion}<span class="preview-updating" role="status">Updating preview…</span>{/if}
          </div>
        {:else if previewError}
          <div class="preview-empty error">
            <p>{previewError}</p>
            {#if question.renderError}
              <details>
                <summary>Full error</summary>
                <pre>{question.renderError}</pre>
              </details>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </aside>
</div>

{#if questionActions && actionQuestion}
  <div
    id="bank-question-actions-menu"
    class="question-actions-menu"
    role="menu"
    aria-label="Question actions"
    tabindex="-1"
    bind:this={questionMenuEl}
    use:portal
    style="left: {questionMenuPosition.left}px; top: {questionMenuPosition.top}px"
    onkeydown={questionActionsKeydown}
  >
    <button role="menuitem" tabindex="-1" onclick={duplicateFromQuestionMenu} title="Duplicate this question">Duplicate</button>
    <button class="danger" role="menuitem" tabindex="-1" onclick={deleteFromQuestionMenu} title="Permanently delete this question">Delete</button>
  </div>
{/if}

{#if infoClassId}
  <ClassInfoCard classId={infoClassId} onclose={() => infoClassId = null} />
{/if}

{#if importToast}
  <div class="toast" use:portal>{importToast}</div>
{/if}

{#if imageLibraryOpen}<ImageLibraryModal onclose={() => imageLibraryOpen = false} />{/if}
<style>
  .view {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  /* ── Sidebar ─────────────────────────────────────────────────────────── */
  .sidebar {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 0.75rem 0;
    background: color-mix(in srgb, var(--bg-2) 55%, var(--bg));
    transition: width 0.2s ease, padding 0.2s ease;
  }

  .sidebar.collapsed {
    width: 0 !important;
    padding: 0;
  }

  .sidebar :global(.bank-switcher) {
    flex-shrink: 0;
    margin-bottom: 0;
    padding-bottom: 0.85rem;
    border-bottom-color: var(--border-soft);
  }

  .resize-handle {
    position: relative;
    width: 10px;
    flex-shrink: 0;
    cursor: col-resize;
    background: transparent;
    transition: background 0.15s;
    z-index: 1;
  }

  .resize-handle::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(50% - 0.5px);
    width: 1px;
    background: var(--border-soft);
    transition: background-color 0.15s;
  }

  .resize-handle:hover {
    background: color-mix(in srgb, var(--primary) 4%, transparent);
  }
  .resize-handle:hover::before { background: var(--primary); }

  .resize-handle.hidden {
    display: none;
  }

  /* Curriculum navigation: generous rows, quiet counts and a tinted selection. */
  .tree {
    --row-h: 32px;
    --indent: 18px;
    --row-hover: color-mix(in srgb, var(--text) 4%, transparent);
    --row-active: color-mix(in srgb, var(--primary) 10%, transparent);
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
    padding: 0.75rem 0.5rem 0.5rem;
    font-size: 13px;
  }

  .tree-node {
    position: relative;
    display: flex;
    align-items: center;
    flex: 0 0 var(--row-h);
    height: var(--row-h);
    padding-left: calc(var(--depth) * var(--indent));
    padding-right: 8px;
    border: 1px solid transparent;
    border-radius: 7px;
    color: var(--text);
    user-select: none;
  }
  .tree-node:hover {
    background: var(--row-hover);
  }
  .tree-node.active {
    background: var(--row-active);
    color: var(--primary);
  }
  .tree-node:has(.row-main:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }
  .tree-node.class-row { margin-top: 0.35rem; }

  .expander,
  .expander-space {
    flex-shrink: 0;
    width: 20px;
    height: 100%;
  }
  .expander {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: none;
    border: none;
    box-shadow: none;
    cursor: pointer;
    color: var(--text-2);
  }
  .expander:hover { color: var(--text); }
  .expander svg {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 0.12s ease;
  }
  .expander.open svg { transform: rotate(90deg); }

  /* The name button stretches over the whole row so a click anywhere selects it. */
  .row-main {
    position: static;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0 0 0 2px;
    background: none;
    border: none;
    box-shadow: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    outline: none;
  }
  .row-main:hover { background: none; }
  .row-main::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  .node-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tree-node.all .node-label,
  .tree-node.class-row .node-label { font-weight: 600; }
  .tree-node.section { color: var(--text-2); }
  .tree-node.section.active { color: var(--primary); }

  .row-count {
    flex-shrink: 0;
    min-width: 24px;
    margin-left: 6px;
    padding: 1px 6px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--text-2) 8%, transparent);
    text-align: center;
    font-size: 11px;
    line-height: 18px;
    font-variant-numeric: tabular-nums;
    color: var(--text-2);
    pointer-events: none;
  }
  .row-count.zero { opacity: 0.45; }
  .tree-node.active .row-count { color: var(--primary); background: color-mix(in srgb, var(--primary) 9%, transparent); opacity: 1; }

  .class-info-btn {
    position: relative;
    z-index: 1;
    width: 20px;
    height: 20px;
    padding: 0;
    background: none;
    border: none;
    border-radius: 3px;
    box-shadow: none;
    color: var(--text-2);
    font-size: 12px;
    cursor: pointer;
    opacity: 0.4;
    transition: opacity 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .tree-node:hover .class-info-btn,
  .tree-node:focus-within .class-info-btn { opacity: 0.7; }
  .class-info-btn:hover { opacity: 1 !important; background: var(--row-hover); }

  /* ── Main area ───────────────────────────────────────────────────────── */
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }



  .search {
    flex: 1;
    min-width: 0;
    height: 40px;
    font-family: inherit;
    font-size: 14px;
  }



  .check-progress-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 200px;
  }

  .check-progress-bar {
    width: 100px;
    height: 24px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .check-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 80%, white) 100%);
    transition: width 200ms ease;
  }

  .check-progress-text {
    font-size: 12px;
    color: var(--text-2);
    min-width: 40px;
    text-align: center;
  }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    height: 200px;
    color: var(--text-2);
  }

  .card {
    display: flex;
    align-items: flex-start;
    gap: 0.875rem;
    padding: 0.875rem 1rem;
    background: var(--card-surface);
    box-shadow: none;
    border: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
    border-radius: var(--card-radius);
    transition: border-color 0.16s ease, background-color 0.16s ease;
  }

  .card:hover {
    border-color: var(--border);
    background: color-mix(in srgb, var(--text) 3%, var(--card-surface));
  }

  .card:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .card.bulkSelected {
    border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
    background: color-mix(in srgb, var(--primary) 4%, var(--card-surface));
    box-shadow: inset 3px 0 0 var(--primary);
  }

  .card.selected {
    border-color: color-mix(in srgb, var(--primary) 75%, var(--border));
    background: color-mix(in srgb, var(--primary) 6%, var(--card-surface));
  }

  .select-box {
    width: 15px;
    height: 15px;
    min-width: 15px;
    margin: 0.2rem 0 0;
    accent-color: var(--primary);
    cursor: pointer;
    flex: 0 0 auto;
  }

  .card-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .body {
    min-width: 0;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .pts {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
    background: var(--bg-3);
    border-radius: 4px;
    padding: 1px 6px;
  }

  .loc {
    font-size: 12px;
    color: var(--text-2);
    font-style: italic;
  }

  .badge-mc {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    border-radius: 3px;
    padding: 1px 5px;
  }

  .badge-error {
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    line-height: 1;
  }

  .badge-unchecked {
    font-size: 15px;
    color: var(--text-2);
    opacity: 0.55;
    flex-shrink: 0;
    line-height: 1;
    line-height: 1;
  }

  .tag.indicator { border: 1px solid var(--border); background: none; }
  .tag {
    font-size: 12px;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    border-radius: 4px;
    padding: 1px 6px;
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-shrink: 0;
  }

  .card-actions .more-actions {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    flex-shrink: 0;
    border-radius: 6px;
  }

  /* Full Typst previews include an SVG fill reset; give the dots their own ink. */
  .more-actions circle { fill: currentColor; }

  .question-actions-menu {
    position: fixed;
    z-index: 1000;
    display: grid;
    gap: 2px;
    width: 160px;
    max-width: calc(100vw - 16px);
    padding: 4px;
    border: 1px solid var(--border-soft);
    border-radius: 9px;
    background: var(--bg);
    box-shadow: 0 8px 24px var(--depth-shadow);
  }

  .question-actions-menu button {
    width: 100%;
    padding: 7px 10px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    box-shadow: none;
    color: var(--text);
    font-size: 13px;
    text-align: left;
  }

  .question-actions-menu button:hover,
  .question-actions-menu button:focus-visible {
    background: var(--bg-2);
    outline: none;
  }

  .question-actions-menu .danger { color: var(--danger); }
  .question-actions-menu .danger:hover,
  .question-actions-menu .danger:focus-visible { background: color-mix(in srgb, var(--danger) 10%, var(--bg)); }

  .bank-pagination {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    padding: 0.35rem 1rem;
    font-size: 12px;
    color: var(--text-2);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .status {
    padding: 0.4rem 1rem;
    font-size: 11px;
    color: var(--text-2);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .toast {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    background: var(--text);
    color: var(--bg);
    font-size: 13px;
    font-weight: 500;
    padding: 0.5rem 1.1rem;
    border-radius: 20px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    pointer-events: none;
    z-index: 200;
    animation: toast-in 0.2s ease;
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  /* ── Preview panel ───────────────────────────────────────────────────── */
  .preview-panel {
    flex: 0 0 480px;
    min-width: 0;
    overflow: hidden;
    background: color-mix(in srgb, var(--bg-2) 75%, var(--bg));
    display: flex;
    flex-direction: column;
    transition: flex-basis 0.2s ease;
  }

  .preview-panel.hidden {
    flex-basis: 0 !important;
    overflow: hidden;
  }

  .preview-header {
    flex-shrink: 0;
    position: relative;
    z-index: 2;
    padding: 0.85rem 1rem 1rem;
    border-bottom: 1px solid var(--border-soft);
    background: var(--bg);
  }

  .preview-title-row { display: flex; align-items: center; gap: 0.75rem; }
  .preview-title-row h2 { flex: 1; margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -0.01em; }
  .preview-title-row .preview-close { width: 30px; height: 30px; padding: 0; border-radius: 6px; font-size: 21px; line-height: 1; }

  .preview-location {
    margin: 0.25rem 0 0.65rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-2);
    font-size: 12px;
  }

  .preview-info-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; }
  .preview-meta { flex: 1 1 180px; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; color: var(--text-2); font-size: 12px; }
  .preview-meta > span { white-space: nowrap; }
  .preview-meta .preview-bank { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .preview-edit { padding: 5px 10px; border: 1px solid var(--border-soft); border-radius: 6px; background: var(--bg-2); box-shadow: none; font-size: 12px; white-space: nowrap; }

  .preview-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem 1rem;
    overflow: auto;
  }
  .preview-body > * { flex-shrink: 0; }

  .preview-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: var(--text-2);
    padding: 2rem;
    text-align: center;
    gap: 0.5rem;
  }

  .preview-empty.error {
    color: var(--danger);
    font-size: 11px;
    align-items: flex-start;
    white-space: pre-wrap;
    word-break: break-all;
    flex-direction: column;
    gap: 1rem;
  }

  .preview-empty.error p {
    margin: 0;
  }

  .preview-empty.error details {
    width: 100%;
    text-align: left;
  }

  .preview-empty.error summary {
    cursor: pointer;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .preview-empty.error pre {
    margin: 0;
    padding: 0.5rem;
    background: color-mix(in srgb, var(--danger) 12%, var(--bg));
    border-radius: 4px;
    font-size: 10px;
    overflow-x: auto;
  }

  .preview-load-status {
    margin: 0;
    padding: 0.45rem 0.6rem;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
    color: var(--text-2);
    font-size: 12px;
  }

  .preview-load-status.error { color: var(--danger); }
  .preview-load-status .spinner { width: 12px; height: 12px; flex: none; }

  .preview-actions {
    margin: 0;
    padding: 0.75rem;
    border: 1px solid var(--border-soft);
    border-radius: 8px;
    background: var(--bg);
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .seed-control {
    display: flex;
    flex: 1 1 90px;
    max-width: 130px;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    font-size: 12px;
    color: var(--text-2);
  }

  .seed-control input {
    width: 100%;
    height: 32px;
    min-width: 0;
    padding: 0.25rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
    color: var(--text);
    font: inherit;
  }

  .preview-actions span {
    font-size: 12px;
    color: var(--text-2);
  }

  .variant-control {
    display: flex;
    flex: 1 1 160px;
    min-width: 0;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    font-size: 12px;
    color: var(--text-2);
  }

  .variant-control select {
    max-width: 100%;
    min-width: 0;
    height: 32px;
    padding: 0.25rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
    color: var(--text);
    font: inherit;
  }

  .variant-manager {
    margin: 0;
    font-size: 12px;
    color: var(--text-2);
  }

  .variant-manager summary {
    cursor: pointer;
  }

  .variant-manager ul {
    list-style: none;
    margin: 0.35rem 0;
    padding: 0;
    display: grid;
    gap: 0.2rem;
  }

  .variant-manager li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .narrative-callout {
    margin: 0;
    padding: 0.75rem 0.875rem;
    border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--border));
    border-radius: 8px;
    background: color-mix(in srgb, var(--primary) 8%, var(--bg));
  }

  .narrative-callout strong {
    display: block;
    margin-bottom: 0.35rem;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--primary);
  }

  .narrative-callout p {
    margin: 0;
    white-space: pre-wrap;
    font-size: 0.92rem;
    color: var(--text);
  }

  .preview-svg {
    padding: 0;
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    background: var(--bg);
    box-shadow: 0 2px 8px -4px var(--depth-shadow);
    transition: opacity 0.15s;
  }

  .preview-svg { position: relative; }
  .preview-svg-content { overflow: hidden; border-radius: inherit; transition: opacity 0.15s; }
  .preview-svg.stale .preview-svg-content { opacity: 0.45; }
  .preview-updating {
    position: absolute;
    top: 1.1rem;
    right: 1.1rem;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 11px;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    pointer-events: none;
  }

  .preview-svg :global(svg) {
    display: block;
    width: 100%;
    height: auto;
    border-radius: inherit;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .mode-switch { display: flex; padding: 3px; gap: 2px; border: 1px solid var(--border-soft); border-radius: 9px; background: var(--bg-2); overflow: hidden; }
  .mode-switch button { border: 0; border-radius: 6px; box-shadow: none; background: none; padding: 5px 10px; font-size: 12px; font-weight: 600; color: var(--text-2); white-space: nowrap; }
  .mode-switch button.active { background: var(--bg); box-shadow: 0 1px 3px var(--depth-shadow); color: var(--text); }
  .type-tabs > .mode-switch { flex-shrink: 0; margin-left: auto; }
  .indicator-chip { display: flex; align-items: center; gap: .5rem; padding: .35rem 1rem; font-size: 12px; color: var(--text-2); border-bottom: 1px solid var(--border); background: var(--bg-2); flex-shrink: 0; }
  .indicator-chip span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .class-tabs {
    display: flex;
    gap: 0.35rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .class-tabs button {
    padding: 0.2rem 0.65rem;
    border-radius: 100px;
    border: 1px solid var(--border);
    background: none;
    font-size: 12px;
    cursor: pointer;
    color: var(--text-2);
    transition: all 0.15s;
  }
  .class-tabs button.active {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
    font-weight: 500;
  }

  .type-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    align-items: center;
    padding: 1rem 1rem 0.75rem;
    flex-shrink: 0;
  }

  .bank-heading {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 110px;
  }

  .bank-heading h1 {
    margin: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 20px;
    font-weight: 650;
    letter-spacing: -0.025em;
    line-height: 1.5;
  }

  .question-count {
    flex: none;
    padding: 1px 7px;
    border-radius: 6px;
    background: var(--bg-3);
    color: var(--text-2);
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .list-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .selection-tools {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    min-width: 0;
  }

  .filters-section {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .actions-section {
    display: flex;
    gap: 0.5rem;
    margin-left: auto;
    flex-wrap: wrap;
    align-items: center;
  }

  .actions-section button {
    padding: 5px 8px;
    border-radius: 6px;
    box-shadow: none;
    background: transparent;
    font-size: 12px;
    color: var(--text-2);
    white-space: nowrap;
  }

  .actions-section button:hover:not(:disabled) {
    background: var(--bg-3);
    color: var(--text);
  }

  .filters-section button {
    padding: 5px 10px;
    border-radius: 6px;
    background: var(--bg-2);
    box-shadow: inset 0 0 0 1px var(--border-soft);
    font-size: 12px;
    color: var(--text-2);
    white-space: nowrap;
  }

  .filters-section button.active {
    background: color-mix(in srgb, var(--primary) 12%, var(--bg));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 40%, var(--border));
    color: var(--primary);
  }

  .error-filter-btn {
    border-color: var(--danger) !important;
    color: var(--danger) !important;
  }
  .error-filter-btn:hover {
    background: color-mix(in srgb, var(--danger) 12%, transparent) !important;
  }
  .error-filter-btn.active {
    background: var(--danger) !important;
    color: white !important;
  }

  .sort-bar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0 1rem 0.5rem;
    flex-shrink: 0;
  }

  .tag-filter {
    flex-shrink: 0;
  }

  .filter-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    height: 40px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: none;
    background: var(--bg);
    font-size: 13px;
    white-space: nowrap;
  }

  .filter-trigger.active {
    border-color: var(--primary);
    color: var(--primary);
    font-weight: 600;
  }

  .filter-count {
    padding: 0 5px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .active-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    padding: 0 1rem 0.5rem;
    flex-shrink: 0;
  }

  .active-filters button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    max-width: 100%;
    overflow-wrap: anywhere;
    padding: 3px 8px;
    box-shadow: none;
    background: color-mix(in srgb, var(--primary) 10%, var(--bg));
    color: var(--primary);
    font-size: 12px;
    border-radius: 6px;
  }

  .active-filters .clear-filters { background: transparent; color: var(--text-2); }

  .tag-menu {
    position: absolute;
    top: calc(100% + 0.35rem);
    right: 1rem;
    z-index: 50;
    width: min(320px, calc(100% - 2rem));
    max-height: min(440px, calc(100dvh - 360px));
    overflow-y: auto;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 12px 32px var(--depth-shadow);
    display: flex;
    flex-direction: column;
  }

  .filter-menu-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.65rem 0.75rem 0.35rem;
    font-size: 14px;
  }

  .filter-menu-title button { font-size: 12px; }

  .filter-section { padding: 0.4rem 0.75rem; }

  .filter-label { display: block; margin: 0 0 0.4rem; font-size: 12px; font-weight: 600; color: var(--text-2); }

  .tag-menu-head {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.75rem 0.75rem 0.4rem;
    border-bottom: 1px solid var(--border);
  }

  .tag-menu-label { display: flex; align-items: center; justify-content: space-between; }
  .tag-menu-label .filter-label { margin: 0; }

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
    background: color-mix(in srgb, var(--primary) 12%, var(--bg));
    color: var(--primary);
    font-weight: 600;
  }

  .tag-menu-list {
    max-height: 180px;
    min-height: 40px;
    overflow-y: auto;
    padding: 0.25rem 0.5rem;
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

  .tag-menu-foot {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-top: 1px solid var(--border);
  }

  .tag-menu-foot button {
    font-size: 12px;
    padding: 0.3rem 0.75rem;
  }

  .select-visible-btn {
    flex-shrink: 0;
    padding: 0.3rem 0.65rem;
    border: 0;
    border-radius: 6px;
    box-shadow: none;
    background: transparent;
    color: var(--text-2);
    cursor: pointer;
    font-size: 12px;
  }

  .select-visible-btn:hover {
    border-color: var(--primary);
    color: var(--primary);
  }

  .select-visible-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .sort-wrapper {
    position: relative;
    display: inline-block;
    flex-shrink: 0;
    min-width: 0;
  }

  .sort-prefix {
    position: absolute;
    left: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 12px;
    color: var(--text-2);
    font-weight: 500;
    white-space: nowrap;
    pointer-events: none;
    z-index: 1;
  }

  .sort-select {
    width: 180px;
    max-width: 100%;
    font-size: 12px;
    padding: 0.3rem 0.5rem 0.3rem 55px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-2);
    cursor: pointer;
  }

  .sort-select:focus {
    outline: none;
    border-color: var(--primary);
  }

  .bulk-editor {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: end;
    padding: 0.65rem 1rem;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--primary) 7%, var(--bg));
    flex-shrink: 0;
  }

  .bulk-summary {
    display: grid;
    gap: 0.15rem;
    min-width: 7rem;
    align-self: center;
  }

  .bulk-summary strong {
    font-size: 13px;
  }

  .bulk-summary span {
    font-size: 11px;
    color: var(--text-2);
  }

  .bulk-summary :global(.add-to) {
    justify-self: start;
    margin-top: 0.3rem;
  }

  .add-result {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 12px;
  }

  .add-result.error {
    color: var(--danger);
  }

  .add-result a {
    color: var(--primary);
  }

  .bulk-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 0.5rem;
    align-items: end;
  }

  .bulk-fields label {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  .bulk-fields label span {
    color: var(--text-2);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .bulk-fields select,
  .bulk-fields input {
    width: 100%;
    min-width: 0;
    height: 30px;
    padding: 0.25rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text);
    font: inherit;
    font-size: 12px;
  }

  .bulk-fields select:focus,
  .bulk-fields input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .bulk-tags-field {
    grid-column: auto;
  }

  .bulk-actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    justify-content: flex-end;
  }

  .bulk-actions button {
    height: 30px;
    padding: 0.25rem 0.7rem;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
  }

  .bulk-summary :global(.add-to-trigger) {
    height: 30px;
    padding: 0.25rem 0.7rem;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
  }

  .bulk-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .mobile-bank-switcher { display: none; }

  @media (max-width: 960px) {
    .bulk-editor {
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    .bulk-summary {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      min-width: 0;
    }

    .bulk-fields {
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    }

    .bulk-actions {
      justify-content: flex-start;
      flex-wrap: wrap;
    }
  }

  .clear-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.375rem 1rem;
    background: color-mix(in srgb, var(--bg-2) 50%, transparent);
    border-bottom: 1px solid var(--border);
    font-size: 12px;
  }

  .clear-hint {
    flex: 1;
    color: var(--text-2);
  }

  .clear-confirm {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    background: color-mix(in srgb, var(--danger) 6%, var(--bg-2));
    border-bottom: 1px solid color-mix(in srgb, var(--danger) 20%, var(--border));
    font-size: 13px;
    color: var(--text);
  }

  .confirm-actions {
    display: flex;
    gap: 0.375rem;
    margin-left: auto;
    flex-shrink: 0;
  }

  @media (max-width: 760px) {
    .view {
      display: block;
      height: 100%;
      overflow: auto;
      -webkit-overflow-scrolling: touch;
    }

    .sidebar,
    .resize-handle,
    .preview-panel {
      display: none;
    }

    .mobile-bank-switcher { display: block; }

    .main {
      min-height: 100%;
      overflow: visible;
    }

    .class-tabs {
      overflow-x: auto;
      flex-wrap: nowrap;
      -webkit-overflow-scrolling: touch;
    }

    .class-tabs button,
    .type-tabs button,
    .actions-section button,
    .filters-section button,
    .filter-trigger,
    .tag-option,
    .tag-mode button,
    .tag-menu-foot button,
    .active-filters button,
    .select-visible-btn,
    .card-actions button,
    .confirm-actions button {
      min-height: 44px;
      font-size: 14px;
    }

    .type-tabs {
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
    }

    .type-tabs .mode-switch button { font-size: 12px; }

    .tag-menu { right: 0.75rem; width: min(320px, calc(100% - 1.5rem)); }

    .actions-section {
      flex: 0 0 auto;
      flex-wrap: nowrap;
      margin-left: auto;
    }

    .sort-bar {
      gap: 0.55rem;
      padding: 0 0.75rem 0.5rem;
    }

    .active-filters { padding: 0 0.75rem 0.5rem; }

    .list-toolbar { padding: 0.25rem 0.75rem; gap: 0.25rem; }

    .selection-tools { flex: 1 1 100%; justify-content: space-between; }

    .search,
    .sort-select,
    .tag-menu-search,
    .bulk-fields input,
    .bulk-fields select {
      min-height: 44px;
      font-size: 16px;
    }

    .bulk-editor {
      padding: 0.75rem;
    }

    .bulk-fields {
      grid-template-columns: 1fr;
    }

    .bulk-actions {
      display: grid;
      grid-template-columns: 1fr;
    }

    .bulk-summary :global(.add-to) {
      margin: 0 0 0 auto;
    }

    .list {
      overflow: visible;
      padding: 0.75rem;
      gap: 0.65rem;
    }

    .card {
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr);
      gap: 0.65rem;
      padding: 0.85rem;
      border-radius: 8px;
    }

    .select-box {
      width: 22px;
      height: 22px;
      min-width: 22px;
      margin-top: 0.1rem;
    }

    .body {
      max-height: 8.5rem;
      overflow: hidden;
    }

    .card-actions {
      grid-column: 1 / -1;
      display: flex;
      gap: 0.45rem;
      overflow-x: auto;
      padding-top: 0.25rem;
      -webkit-overflow-scrolling: touch;
    }

    .card-actions button {
      flex: 0 0 auto;
      padding-inline: 0.9rem;
    }

    .card-actions .more-actions { width: 44px; height: 44px; margin-left: auto; }
    .question-actions-menu button { min-height: 44px; font-size: 14px; }

    .clear-bar,
    .clear-confirm {
      align-items: stretch;
      flex-direction: column;
      padding: 0.75rem;
    }

    .confirm-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      margin-left: 0;
    }

    .status {
      padding: 0.65rem 0.75rem calc(0.85rem + env(safe-area-inset-bottom));
    }
  }

</style>
