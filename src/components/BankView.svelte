<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { bank } from '../lib/bank.svelte';
  import { narratives } from '../lib/narratives.svelte';
  import { CLASSES, DEMO_CLASSES, findUnit, findSection } from '../lib/curriculum';
  import { customClasses } from '../lib/custom-classes.svelte';
  import type { Class, Question, Section, Unit } from '../lib/types';
  import ImageLibraryModal from './media/ImageLibraryModal.svelte';
  import { editor, newInEditor, openInEditor } from '../lib/editor/editor-state.svelte';
  import ClassInfoCard from './ClassInfoCard.svelte';
  import AddToTestMenu from './AddToTestMenu.svelte';
  import { appState } from '../lib/app-state.svelte';
  import { compileSvg, cancelPreview, findDelimiterIssues, previewConsumer } from '../lib/typst/compiler';
  import { perf } from '../lib/perf-diagnostics';
  import { bankView } from '../lib/bank-switch-view.svelte';
  import { formatBody, formatParts } from '../lib/question-format';
  import { imageStore } from '../lib/image-store.svelte';
  import { fuzzyScoreMultiLower, narrativeIndex, narrativeSearchText, questionSearchText } from '../lib/search-index';
  import { getThemeColors } from '../lib/theme-colors';
  import { scanImageRefs } from '../lib/typst/image-shadow';
  import { calculateAlgorithmicQuestionVariant } from '../lib/algorithm-variant';
  import { narrativeLabel, resolveQuestionNarrative } from '../lib/narrative-utils';
  import { portal } from '../lib/portal';
  import { autoImports } from '../lib/typst/auto-imports';

  let allClasses = $derived(appState.demoMode ? [...CLASSES, ...DEMO_CLASSES, ...customClasses.classes] : [...CLASSES, ...customClasses.classes]);

  // ── Sidebar accordion ────────────────────────────────────────────────────
  let openClassId = $state<string | null>(null);

  $effect(() => {
    if (openClassId !== null) return;
    openClassId = allClasses[0]?.id ?? null;
  });

  function toggleClass(id: string) {
    openClassId = openClassId === id ? null : id;
  }

  function selectClass(id: string) {
    if (!openClassId || openClassId !== id) toggleClass(id);
    select({ type: 'class', classId: id });
    appState.setLastClassId(id);
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
  let errorFilter = $state(false);
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
  let tagMenuOpen = $state(false);
  let tagSearch = $state('');
  let tagMenuEl = $state<HTMLDivElement | null>(null);

  function matchesTagFilter(q: Question): boolean {
    if (selectedTags.length === 0) return true;
    const tags = new Set((q.tags ?? []).map((t) => t.toLowerCase()));
    return tagMatchAll
      ? selectedTags.every((t) => tags.has(t))
      : selectedTags.some((t) => tags.has(t));
  }

  /** Questions the tag list is drawn from: current class/unit/section scope only. */
  let tagScopeQuestions = $derived.by(() => {
    if (classFilter !== null) return bank.questions.filter((q) => q.classId === classFilter);
    const sel = selection;
    if (sel.type === 'class') return bank.questions.filter((q) => q.classId === sel.classId);
    if (sel.type === 'unit') {
      return bank.questions.filter((q) => q.classId === sel.classId && q.unitId === sel.unitId);
    }
    if (sel.type === 'section') {
      return bank.questions.filter(
        (q) => q.classId === sel.classId && q.unitId === sel.unitId && q.sectionId === sel.sectionId,
      );
    }
    return bank.questions;
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
    if (!tagMenuOpen) return;
    const closeOnOutside = (e: PointerEvent) => {
      if (tagMenuEl && !tagMenuEl.contains(e.target as Node)) tagMenuOpen = false;
    };
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') tagMenuOpen = false;
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  });

  let errorCount = $derived(bank.questions.filter(q => q.renderError).length);

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
      let base = bank.questions;
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
      base = base.filter(matchesTagFilter);
      if (errorFilter) {
        base = base.filter((q) => !!q.renderError);
      }
      if (searchQuery) {
        // Fuzzy search across body, tags, solution, and answer (cached lowercase text)
        const byId = narrativeIndex(narratives.narratives);
        const scored = base.map((q) => ({
          q,
          score: (() => {
            const narrative = narrativeSearchText(q, byId);
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

  function clearBuiltInClass(classId: string) {
    bank.questions = bank.questions.filter((q) => q.classId !== classId);
    localStorage.setItem('math-test-bank-v2', JSON.stringify(bank.questions));
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
            let qs = bank.questions.filter((q) => q.classId === classFilter);
            if (typeFilter === 'mcq') qs = qs.filter(isMCQQuestion);
            else if (typeFilter === 'frq') qs = qs.filter((q) => !isMCQQuestion(q));
            if (graphFilter) qs = qs.filter((q) => q.tags.includes('graph'));
            qs = qs.filter(matchesTagFilter);
            if (errorFilter) qs = qs.filter((q) => !!q.renderError);
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
  let listFilterKey = $derived(JSON.stringify([selection, classFilter, typeFilter, graphFilter, errorFilter, selectedTags, tagMatchAll, searchQuery, sortBy]));
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

  let selectedQuestions = $derived(bank.questions.filter((q) => selectedIds.has(q.id)));
  let selectedVisibleCount = $derived(displayQuestions.filter((q) => selectedIds.has(q.id)).length);
  // Display order first, then selected questions a filter currently hides.
  let selectedInOrder = $derived([...new Set([...displayQuestions, ...selectedQuestions].filter((q) => selectedIds.has(q.id)).map((q) => q.id))]);
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
  function unitCount(classId: string, unitId: string) {
    return bank.questions.filter((q) => q.classId === classId && q.unitId === unitId).length;
  }
  function sectionCount(classId: string, unitId: string, sectionId: string) {
    return bank.questions.filter(
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
  // Selection and previews never carry over into another bank.
  let selectionBank = bankView.activeBankId;
  $effect(() => {
    const bankId = bankView.activeBankId;
    if (bankId === selectionBank) return;
    selectionBank = bankId;
    untrack(() => { selectedQ = null; selectedIds = new Set(); selectionAnchorId = null; listPage = 0; classFilter = null; previewSvg = null; previewFor = null; previewError = null; });
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
      const result = await compileSvg(previewSource(q));
      bulkProgress++;
      const err = result.error ?? null;
      if (err !== null) {
        bulkErrors++;
        const pos = findDelimiterIssues(q.body)
          ?? (q.solution ? findDelimiterIssues(q.solution) : null);
        const enhanced = pos ? `${err}\n\n${pos}` : err;
        if (q.renderError !== enhanced) bank.update(q.id, { renderError: enhanced, checked: true });
      } else {
        if (q.renderError != null) bank.update(q.id, { renderError: undefined, checked: true });
        else bank.update(q.id, { checked: true });
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
    const resolvedNarrative = resolveQuestionNarrative(q, narratives.narratives);
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
    const q = selectedQ ? bank.questions.find(q => q.id === selectedQ?.id) ?? selectedQ : null;
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
      compileSvg(src, { consumer: previewConsumerId }).then(result => {
        if (cancelled || result.cancelled) return;
        perf.end('bank-select-preview', 'Bank: select to preview');
        previewBusy = false;
        if (result.svg) {
          previewSvg = result.svg;
          previewFor = q.id;
          previewError = null;
          if (q.renderError != null) bank.update(q.id, { renderError: undefined, checked: true });
          else if (!q.checked) bank.update(q.id, { checked: true });
        } else {
          const err = result.error ?? 'Error';
          previewError = err;
          previewSvg = null;
          previewFor = q.id;
          if (q.renderError !== err) bank.update(q.id, { renderError: err, checked: true });
        }
      });
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  });

  $effect(() => {
    const q = selectedQ;
    algorithmSeedInput = q?.algorithmSeed !== undefined ? String(q.algorithmSeed) : '';
  });

  function selectQ(q: Question) {
    selectedQ = selectedQ?.id === q.id ? null : q;
    if (q.classId) appState.setLastClassId(q.classId);
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

  function applyBulkMetadata() {
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
      bank.update(q.id, updates);
      changed++;
    }

    if (selectedQ) selectedQ = bank.questions.find((q) => q.id === selectedQ?.id) ?? selectedQ;
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

  function deleteSelectedQuestions() {
    const targets = selectedQuestions;
    if (!targets.length) return;
    if (!confirm(`Delete ${targets.length} selected question${targets.length !== 1 ? 's' : ''}?`)) return;

    const ids = new Set(targets.map((q) => q.id));
    for (const id of ids) bank.remove(id);
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
    if (isTextEntryTarget(e.target)) return;
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
      : selection.type === 'class' ? { classId: selection.classId, unitId: '', sectionId: '' } : {});
  }

  function confirmDelete(q: Question) {
    if (confirm(`Delete question?\n\n"${q.body.slice(0, 80)}..."`)) bank.remove(q.id);
  }

  function duplicateQuestion(q: Question) {
    const copy = editor.duplicate(editor.open(q));
    window.location.hash = `#/editor/${copy.id}`;
  }

  function canCalculateValues(q: Question): boolean {
    return Boolean(q.algorithmModel?.definitions.some((definition) => definition.rawExpression || definition.sampleValue));
  }

  function calculateValues(q: Question, seed?: number) {
    const result = calculateAlgorithmicQuestionVariant(q, seed);
    if (!result) {
      setToast('No algorithm values available');
      return;
    }

    bank.update(q.id, result.updates);
    const updated = bank.questions.find((candidate) => candidate.id === q.id) ?? { ...q, ...result.updates };
    if (selectedQ?.id === q.id) selectedQ = updated;
    if (selectedQ?.id === q.id) algorithmSeedInput = String(result.seed);
    setToast(`Calculated values with seed ${result.seed}`);
  }

  function parseSeedInput(): number | undefined | null {
    const trimmed = algorithmSeedInput.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffffffff) return null;
    return parsed >>> 0;
  }

  function calculateSelectedValues() {
    if (!selectedQ) return;
    const seed = parseSeedInput();
    if (seed === null) {
      setToast('Seed must be an integer from 0 to 4294967295');
      return;
    }
    calculateValues(selectedQ, seed);
  }

  function truncate(s: string, n = 120): string {
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function unitLabel(unit: { id: string; name: string }): string {
    return /^\d+$/.test(unit.id) ? `Unit ${unit.id}: ${unit.name}` : unit.name;
  }

  // ── Label helpers ────────────────────────────────────────────────────────
  function sectionLabel(q: Question): string {
    if (!q.classId || !q.unitId) return '';
    const unit = findUnit(q.classId, q.unitId);
    if (!unit) return '';
    if (!q.sectionId) return `Unit ${q.unitId}: ${unit.name}`;
    const sec = findSection(q.classId, q.unitId, q.sectionId);
    return sec ? `${q.sectionId} — ${sec.name}` : q.sectionId;
  }

</script>

<svelte:window onkeydown={onkeydown} />

<div class="view">
  <!-- ── Sidebar: curriculum tree ────────────────────────────────────── -->
  <nav id="tut-bank-sidebar" class="sidebar" class:collapsed={sidebarCollapsed} style="width: {sidebarCollapsed ? 0 : sidebarWidth}px">
    <div class="tree">
      <!-- "All Questions" root node -->
      <button
        class="tree-node all"
        class:active={selection.type === 'all'}
        onclick={() => select({ type: 'all' })}
        title="Show all questions"
      >
        <span class="node-label">All Questions</span>
        <span class="badge">{bank.questions.length}</span>
      </button>

      {#each allClasses as cls}
        {@const clsOpen = openClassId === cls.id}
        <div class="class-group">
          <div class="class-header">
            <button class="expand-btn" onclick={() => toggleClass(cls.id)} title={clsOpen ? 'Collapse' : 'Expand'}>
              {clsOpen ? '▾' : '▸'}
            </button>
            <button
              class="class-name-btn"
              class:active={selection.type === 'class' && selection.classId === cls.id}
              onclick={() => { if (!clsOpen) toggleClass(cls.id); selectClass(cls.id); }}
              title="Filter to {cls.name}"
            >
              {cls.name}
            </button>
            <button class="class-info-btn" onclick={(e) => { e.stopPropagation(); infoClassId = cls.id; }} title="Class info / rename">ⓘ</button>
          </div>

          {#if clsOpen}
          <div>
          {#each [...cls.units].sort((a, b) => parseFloat(a.id) - parseFloat(b.id)) as unit}
            {@const expanded = expandedUnits.has(unit.id)}
            {@const uCount = unitCount(cls.id, unit.id)}
            <div class="unit-row">
              <button
                class="tree-node unit"
                class:active={selection.type === 'unit' &&
                  selection.classId === cls.id &&
                  selection.unitId === unit.id}
                onclick={() => select({ type: 'unit', classId: cls.id, unitId: unit.id })}
                title="Filter to {unitLabel(unit)}"
              >
                <span class="node-label">{unitLabel(unit)}</span>
                {#if uCount > 0}<span class="badge">{uCount}</span>{/if}
              </button>
              <button
                class="expand-btn"
                title={expanded ? 'Collapse' : 'Expand sections'}
                onclick={() => toggleUnit(unit.id)}
              >
                {expanded ? '▾' : '▸'}
              </button>
            </div>

            {#if expanded}
              <div class="sections">
                {#each unit.sections as sec}
                  {@const sCount = sectionCount(cls.id, unit.id, sec.id)}
                  <button
                    class="tree-node section"
                    title="Filter to {sec.id} {sec.name}"
                    class:active={selection.type === 'section' &&
                      selection.classId === cls.id &&
                      selection.unitId === unit.id &&
                      selection.sectionId === sec.id}
                    onclick={() =>
                      select({
                        type: 'section',
                        classId: cls.id,
                        unitId: unit.id,
                        sectionId: sec.id,
                      })}
                  >
                    <span class="node-label">{sec.id} {sec.name}</span>
                    {#if sCount > 0}<span class="badge dim">{sCount}</span>{/if}
                  </button>
                {/each}
              </div>
            {/if}
          {/each}
          </div>
          {/if}
        </div>
      {/each}
    </div>
  </nav>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resize-handle" onmousedown={(e) => startResize('sidebar', e)}></div>

  <!-- ── Main area ───────────────────────────────────────────────────── -->
  <div class="main">

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

    <div id="tut-type-tabs" class="type-tabs">
      <div class="filters-section">
        <button class:active={typeFilter === ''} onclick={() => typeFilter = ''} title="Show all question types">All Types</button>
        <button class:active={typeFilter === 'mcq'} onclick={() => typeFilter = 'mcq'} title="Show only multiple-choice questions">MCQ</button>
        <button class:active={typeFilter === 'frq'} onclick={() => typeFilter = 'frq'} title="Show only free-response questions">FRQ</button>
        <button class:active={graphFilter} onclick={() => graphFilter = !graphFilter} title="Show only questions tagged as graph">Graph</button>
        {#if errorCount > 0}
          <button
            class="error-filter-btn"
            class:active={errorFilter}
            onclick={() => (errorFilter = !errorFilter)}
            title="Show only questions that failed the last render check"
          >❌ {errorCount} error{errorCount !== 1 ? 's' : ''}</button>
        {/if}
      </div>
      <div id="tut-toolbar" class="actions-section">
        <button onclick={() => imageLibraryOpen = true} title="Browse, upload, and manage stored images">Image library</button>
        {#if bulkRunning}
          <div class="check-progress-group">
            <div class="check-progress-bar">
              <div class="check-progress-fill" style="width: {(bulkProgress / bulkTotal) * 100}%"></div>
            </div>
            <span class="check-progress-text">{bulkProgress}/{bulkTotal}</span>
            <button onclick={() => bulkCancelled = true} disabled={false} title="Stop the render check">
              Cancel
            </button>
          </div>
        {:else}
          <button onclick={runBulkCheck} disabled={displayQuestions.length === 0} title="Render-check visible questions for Typst errors">
            Check{bulkErrors > 0 ? ` · ${bulkErrors} errors` : ''}
          </button>
        {/if}
      </div>
    </div>

    <div class="sort-bar">
      <input
        class="search"
        type="search"
        placeholder="Search questions or tags…"
        bind:value={search}
      />
      <div class="tag-filter" bind:this={tagMenuEl}>
        <button
          class="tag-filter-btn"
          class:active={selectedTags.length > 0}
          onclick={() => (tagMenuOpen = !tagMenuOpen)}
          title="Filter by exact tags"
          aria-expanded={tagMenuOpen}
        >
          Tags{selectedTags.length > 0 ? ` · ${selectedTags.length}` : ''} ▾
        </button>

        {#if tagMenuOpen}
          <div class="tag-menu">
            <div class="tag-menu-head">
              <input
                class="tag-menu-search"
                type="search"
                placeholder="Find a tag…"
                bind:value={tagSearch}
              />
              <div class="tag-mode">
                <button class:active={tagMatchAll} onclick={() => (tagMatchAll = true)} title="Questions must have every checked tag">All</button>
                <button class:active={!tagMatchAll} onclick={() => (tagMatchAll = false)} title="Questions with any checked tag">Any</button>
              </div>
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
              <button onclick={clearTagFilter} disabled={selectedTags.length === 0}>Clear</button>
              <button onclick={() => (tagMenuOpen = false)}>Done</button>
            </div>
          </div>
        {/if}
      </div>
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

    <div class="list" bind:this={listEl}>
      {#if bank.questions.length === 0}
        <div class="empty">
          <p>No questions yet.</p>
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
              <pre class="body">{truncate(q.body)}</pre>
              <div class="meta">
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
                {#each q.tags as tag}
                  <span class="tag">{tag}</span>
                {/each}
              </div>
            </div>
            <div class="card-actions">
              {#if canCalculateValues(q)}
                <button class="ghost" onclick={(e) => { e.stopPropagation(); calculateValues(q); }} title="Calculate a new seeded set of algorithm values">Calculate values</button>
              {/if}
              <button class="ghost" onclick={(e) => { e.stopPropagation(); openInEditor(q); }} title="Edit this question">Edit</button>
              <button class="ghost" onclick={(e) => { e.stopPropagation(); duplicateQuestion(q); }} title="Duplicate this question">Duplicate</button>
              <button class="ghost danger" onclick={(e) => { e.stopPropagation(); confirmDelete(q); }} title="Permanently delete this question">Delete</button>
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

    <div class="status">
      {bank.questions.length} question{bank.questions.length !== 1 ? 's' : ''} in bank
      {#if displayQuestions.length !== bank.questions.length}
        &nbsp;· {displayQuestions.length} shown
      {/if}
    </div>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resize-handle" onmousedown={(e) => startResize('preview', e)} class:hidden={!selectedQ}></div>

  <!-- ── Preview panel ──────────────────────────────────────────────── -->
  <div id="tut-preview-pane" class="preview-panel" class:hidden={!selectedQ} style="flex-basis: {previewWidth}px">
    {#if !selectedQ}
      <div class="preview-empty">Click a question to preview</div>
    {:else}
      {#if canCalculateValues(selectedQ)}
        <div class="preview-actions">
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
            />
          </label>
          <button class="primary small" onclick={calculateSelectedValues} title="Calculate algorithm values for this question using the seed field">Calculate values</button>
          <button class="ghost small" onclick={() => { algorithmSeedInput = ''; calculateSelectedValues(); }} title="Generate a random seed and calculate values">Random seed</button>
          <span>{selectedQ.algorithmVariant ? `Variant ${selectedQ.algorithmVariant}` : 'Empty seed uses a random value'}</span>
        </div>
      {/if}

      {@const selectedNarrative = resolveQuestionNarrative(selectedQ, narratives.narratives)}
      {#if selectedNarrative}
        <div class="narrative-callout">
          <strong>{narrativeLabel(selectedQ, narratives.narratives)}</strong>
          <p>{selectedNarrative.body}</p>
        </div>
      {/if}

      {#if selectedQ.algorithmModel?.definitions.length || selectedQ.graphModel?.objects.length || selectedQ.decodeDiagnostics?.length}
        <details class="decode-inspector">
          <summary>Import inspector</summary>
          {#if selectedQ.algorithmModel?.definitions.length}
            <div class="inspector-section">
              <strong>Algorithm</strong>
              <p>Scope: {selectedQ.algorithmModel.scope.kind}</p>
              <ul>
                {#each selectedQ.algorithmModel.definitions as definition}
                  <li>{definition.name} · {definition.kind}{definition.rawExpression ? ` = ${definition.rawExpression}` : ''}{definition.sampleValue ? ` → ${definition.sampleValue}` : ''}</li>
                {/each}
              </ul>
              {#if selectedQ.algorithmModel.sequence.length}
                <p>Raw sequence</p>
                <ul>
                  {#each selectedQ.algorithmModel.sequence as entry}
                    <li>{entry.order}. {entry.kind}{entry.definitionName ? ` · ${entry.definitionName}` : ''} · {entry.text}</li>
                  {/each}
                </ul>
              {/if}
            </div>
          {/if}
          {#if selectedQ.graphModel?.objects.length}
            <div class="inspector-section">
              <strong>Graph</strong>
              <p>{selectedQ.graphModel.family} · {selectedQ.graphModel.objects.length} object{selectedQ.graphModel.objects.length === 1 ? '' : 's'}</p>
              <ul>
                {#each selectedQ.graphModel.objects as object}
                  <li>{object.kind}{object.expression ? ` · ${object.expression}` : ''}</li>
                {/each}
              </ul>
            </div>
          {/if}
          {#if selectedQ.decodeDiagnostics?.length}
            <div class="inspector-section">
              <strong>Diagnostics</strong>
              <ul>
                {#each selectedQ.decodeDiagnostics as diagnostic}
                  <li>{diagnostic.level} · {diagnostic.code} · {diagnostic.message}</li>
                {/each}
              </ul>
            </div>
          {/if}
        </details>
      {/if}

      {#if previewBusy && !previewSvg}
        <div class="preview-empty">
          <div class="spinner"></div>
        </div>
      {:else if previewSvg}
        {@const otherQuestion = previewFor !== selectedQ.id}
        <div class="preview-svg" class:stale={previewBusy || otherQuestion} aria-busy={previewBusy || otherQuestion} data-preview-for={previewFor}>
          <div class="preview-svg-content" aria-hidden={otherQuestion}>{@html previewSvg}</div>
          {#if otherQuestion}<span class="preview-updating" role="status">Updating preview…</span>{/if}
        </div>
      {:else if previewError}
        <div class="preview-empty error">
          <p>{previewError}</p>
          {#if selectedQ?.renderError}
            <details>
              <summary>Full error</summary>
              <pre>{selectedQ.renderError}</pre>
            </details>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</div>

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
    border-right: 1px solid var(--border);
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0.5rem 0;
    transition: width 0.2s ease, border-color 0.2s ease, padding 0.2s ease;
  }

  .sidebar.collapsed {
    width: 0 !important;
    padding: 0;
    border-right-color: transparent;
  }

  .resize-handle {
    width: 10px;
    flex-shrink: 0;
    cursor: col-resize;
    background: var(--bg-2);
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
    transition: background 0.15s;
    z-index: 1;
  }

  .resize-handle:hover {
    background: var(--bg-3);
  }

  .resize-handle.hidden {
    display: none;
  }

  .tree {
    display: flex;
    flex-direction: column;
  }

  .class-group {
    margin-bottom: 0.5rem;
  }

  .class-header {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-2);
    padding: 0.5rem 0.75rem 0.25rem;
    user-select: none;
  }
  .class-header > .expand-btn {
    flex-shrink: 0;
    padding: 4px 2px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-2);
    font-size: 9px;
    line-height: 1;
    border-radius: 4px;
  }
  .class-header > .expand-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }
  .class-name-btn {
    flex: 1;
    background: none;
    border: none;
    padding: 4px 0;
    cursor: pointer;
    color: var(--text-2);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    text-align: left;
    border-radius: 4px;
    transition: background 0.1s, color 0.1s;
  }
  .class-name-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }
  .class-name-btn.active {
    color: var(--primary);
  }

  .class-info-btn {
    width: 16px;
    height: 16px;
    padding: 0;
    background: none;
    border: none;
    border-radius: 50%;
    color: var(--text-2);
    font-size: 12px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .class-group:hover .class-info-btn { opacity: 0.5; }
  .class-info-btn:hover { opacity: 1 !important; background: var(--bg-2); }

  .tree-node {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    width: 100%;
    padding: 5px 0.75rem;
    background: none;
    border: none;
    border-radius: 0;
    text-align: left;
    cursor: pointer;
    font-size: 13px;
    color: var(--text);
    transition: background 0.1s;
  }

  .tree-node:hover {
    background: var(--bg-2);
  }

  .tree-node.active {
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
    font-weight: 500;
  }

  .tree-node.all {
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .tree-node.unit {
    font-size: 13px;
    padding-right: 0.25rem;
  }

  .tree-node.section {
    font-size: 12px;
    color: var(--text-2);
    padding-left: 1.5rem;
  }

  .tree-node.section.active {
    color: var(--primary);
  }

  .node-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    font-size: 11px;
    background: var(--bg-3);
    color: var(--text-2);
    border-radius: 8px;
    padding: 0 5px;
    flex-shrink: 0;
  }

  .badge.dim {
    opacity: 0.6;
  }

  .unit-row {
    display: flex;
    align-items: center;
  }

  .unit-row .tree-node {
    flex: 1;
    min-width: 0;
  }

  .expand-btn {
    flex-shrink: 0;
    padding: 4px 6px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-2);
    font-size: 10px;
    line-height: 1;
    border-radius: 4px;
  }

  .expand-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .sections {
    display: flex;
    flex-direction: column;
  }

  /* ── Main area ───────────────────────────────────────────────────────── */
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }



  .search {
    flex: 1;
    min-width: 200px;
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
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    transition: border-color 0.1s;
  }

  .card:hover {
    border-color: var(--primary);
  }

  .card.selected {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 5%, var(--bg-2));
  }

  .card.bulkSelected {
    border-color: color-mix(in srgb, var(--primary) 70%, var(--border));
    box-shadow: inset 3px 0 0 var(--primary);
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
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text);
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

  .tag {
    font-size: 12px;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    border-radius: 4px;
    padding: 1px 6px;
  }

  .card-actions {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
  }

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
    border-left: 1px solid var(--border);
    overflow-y: auto;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    transition: flex-basis 0.2s ease, border-color 0.2s ease;
  }

  .preview-panel.hidden {
    flex-basis: 0 !important;
    border-left-color: transparent;
    overflow: hidden;
  }

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

  .preview-actions {
    margin: 0.75rem 0.75rem 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .seed-control {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 12px;
    color: var(--text-2);
  }

  .seed-control input {
    width: 9.5rem;
    min-width: 0;
    padding: 0.25rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
    color: var(--text);
    font: inherit;
  }

  .preview-actions span {
    font-size: 12px;
    color: var(--text-2);
  }

  .narrative-callout {
    margin: 0.75rem 0.75rem 0;
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

  .decode-inspector {
    margin: 0.75rem;
    padding: 0.75rem 0.875rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-2);
  }

  .decode-inspector summary {
    cursor: pointer;
    font-weight: 600;
  }

  .inspector-section {
    margin-top: 0.75rem;
  }

  .inspector-section p,
  .inspector-section ul {
    margin: 0.25rem 0 0;
  }

  .preview-svg {
    padding: 0.75rem;
    transition: opacity 0.15s;
  }

  .preview-svg { position: relative; }
  .preview-svg-content { transition: opacity 0.15s; }
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
    box-shadow: 0 1px 8px rgba(0, 0, 0, 0.3);
    border-radius: 4px;
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
    gap: 0.35rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    flex-wrap: wrap;
    align-items: center;
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

  .type-tabs .actions-section button {
    padding: 6px 12px;
    border-radius: 3px;
    border: 1px solid var(--border);
    background: var(--bg-2);
    font-size: 13px;
    cursor: pointer;
    color: var(--text);
    transition: all 0.15s;
    white-space: nowrap;
  }

  .type-tabs .actions-section button:hover {
    border-color: var(--text-2);
    background: var(--bg-3);
  }

  .type-tabs .actions-section button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .type-tabs button {
    padding: 0.2rem 0.65rem;
    border-radius: 100px;
    border: 1px solid var(--border);
    background: none;
    font-size: 12px;
    cursor: pointer;
    color: var(--text-2);
    transition: all 0.15s;
    white-space: nowrap;
  }

  .type-tabs button:hover {
    border-color: var(--primary);
    color: var(--primary);
  }

  .type-tabs button.active {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
    font-weight: 500;
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
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .tag-filter {
    position: relative;
    flex-shrink: 0;
  }

  .tag-filter-btn {
    padding: 0.3rem 0.65rem;
    font-size: 12px;
    white-space: nowrap;
  }

  .tag-filter-btn.active {
    border-color: var(--primary);
    color: var(--primary);
    font-weight: 600;
  }

  .tag-menu {
    position: absolute;
    top: calc(100% + 0.35rem);
    right: 0;
    z-index: 50;
    width: 260px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
  }

  .tag-menu-head {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.5rem;
    border-bottom: 1px solid var(--border);
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

  .tag-menu-list {
    max-height: 260px;
    overflow-y: auto;
    padding: 0.25rem;
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
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem;
    border-top: 1px solid var(--border);
  }

  .tag-menu-foot button {
    flex: 1;
    font-size: 11px;
    padding: 0.25rem 0.4rem;
  }

  .select-visible-btn {
    flex-shrink: 0;
    padding: 0.3rem 0.65rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
    color: var(--text);
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
    width: 270px;
    font-size: 12px;
    padding: 0.3rem 0.5rem 0.3rem 55px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
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

  @media (max-width: 960px) {
    .sort-bar {
      flex-wrap: wrap;
    }

    .sort-wrapper,
    .sort-select {
      width: 100%;
    }

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

    .main {
      min-height: 100%;
      overflow: visible;
    }

    .class-tabs,
    .type-tabs,
    .sort-bar {
      overflow-x: auto;
      flex-wrap: nowrap;
      -webkit-overflow-scrolling: touch;
    }

    .class-tabs button,
    .type-tabs button,
    .type-tabs .actions-section button,
    .select-visible-btn,
    .card-actions button,
    .confirm-actions button {
      min-height: 44px;
      font-size: 14px;
    }

    .type-tabs {
      align-items: stretch;
      gap: 0.5rem;
      padding: 0.6rem 0.75rem;
      flex-wrap: wrap;
      overflow-x: visible;
    }

    .filters-section {
      flex: 0 1 auto;
      min-width: 0;
      flex-wrap: nowrap;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .actions-section {
      flex: 0 0 auto;
      flex-wrap: nowrap;
      margin-left: auto;
    }

    .sort-bar {
      display: grid;
      grid-template-columns: 1fr;
      align-items: stretch;
      gap: 0.55rem;
      padding: 0.65rem 0.75rem;
    }

    .search,
    .sort-wrapper,
    .sort-select {
      width: 100%;
      min-width: 0;
    }

    .search,
    .sort-select,
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
      font-size: 13px;
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
