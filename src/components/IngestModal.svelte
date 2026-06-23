<!--
  Two-stage bulk import modal.
  Stage 1: paste / drag-drop text or JSON, choose format + split strategy.
  Stage 2: review/edit each parsed question, bulk-assign curriculum, then import.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { CLASSES, DEMO_CLASSES } from '../lib/curriculum';
  import { appState } from '../lib/app-state.svelte';
  import { customClasses } from '../lib/custom-classes.svelte';
  import { latexToTypst, detectFormat, extractImageNames } from '../lib/latex-to-typst';
  import { parseBulkImportJson, type ParsedBulkImportKind } from '../lib/bulk-import';
  import { convertPartsEnvironment, stripLeadingAnswerLabel } from '../lib/ingest-helpers';
  import { compileSvg } from '../lib/typst/compiler';
  import { formatBody, formatParts } from '../lib/question-format';
  import type { Class, DraftQuestion, Section, Unit } from '../lib/types';
  import { imageKeyFromReference, imageStore, isSupportedExt, splitFilename } from '../lib/image-store.svelte';
  import { scanImageRefs } from '../lib/typst/image-shadow';

  interface Props {
    onclose: () => void;
    onimport: (questions: DraftQuestion[]) => void;
    initialDrafts?: DraftQuestion[];
    initialImportKind?: ParsedBulkImportKind;
  }

  let { onclose, onimport, initialDrafts, initialImportKind }: Props = $props();

  const DRAFT_KEY = 'ingest-draft';

  function startingDrafts(): DraftQuestion[] {
    return normalizeImportedQuestions(initialDrafts ?? []);
  }

  function startingDraftCount(): number {
    return startingDrafts().length;
  }

  function startingImportKind(): ParsedBulkImportKind | undefined {
    return initialImportKind;
  }

  // ── Stage routing ─────────────────────────────────────────────────────────
  //   1 — paste
  //   2 — upload images  (only shown when drafts reference \includegraphics)
  //   3 — review & assign
  let stage = $state<1 | 2 | 3>(startingDraftCount() ? 3 : 1);

  // ── Stage 1 state ─────────────────────────────────────────────────────────
  let rawText      = $state('');
  let format       = $state<'auto' | 'typst' | 'latex'>('auto');
  let splitBy      = $state<'question' | 'numbered' | 'delimiter' | 'blank'>('blank');
  let customDelim  = $state('---');
  let isDragOver   = $state(false);
  let importFileInput: HTMLInputElement | undefined = $state();
  let importSourceName = $state('');
  let hasDraft     = $state(!!localStorage.getItem(DRAFT_KEY));
  let appendMode   = $state(false);
  let isImageDragOver = $state(false);

  // ── Stage 2 state ─────────────────────────────────────────────────────────
  let questions    = $state<DraftQuestion[]>(startingDrafts());
  let selected     = $state(new Set<number>(startingDrafts().map((_, i) => i)));
  let focusedIdx   = $state(0);

  // Bulk-assign sidebar
  let bulkClassId   = $state((appState.demoMode ? [...CLASSES, ...DEMO_CLASSES] : CLASSES)[0]?.id ?? '');
  let bulkUnitId    = $state('');
  let bulkSectionId = $state('');
  let bulkPoints    = $state(5);
  let bulkTagInput  = $state('');
  let reviewImportKind = $state<ParsedBulkImportKind | undefined>(startingImportKind());

  let allClasses   = $derived(appState.demoMode ? [...CLASSES, ...DEMO_CLASSES, ...customClasses.classes] : [...CLASSES, ...customClasses.classes]);
  let bulkClass    = $derived(allClasses.find((c) => c.id === bulkClassId));
  let bulkUnits    = $derived(bulkClass?.units ?? []);
  let bulkUnit     = $derived(bulkUnits.find((u) => u.id === bulkUnitId));
  let bulkSections = $derived(bulkUnit?.sections ?? []);
  let packageMetadataMessage = $state('');

  // ── New-class / unit / section inline forms ───────────────────────────────
  let addingClass    = $state(false);
  let newClassName   = $state('');
  let addingUnit     = $state(false);
  let newUnitName    = $state('');
  let addingSection  = $state(false);
  let newSectionName = $state('');
  let packageClassName = $state('');
  let packageUnitName = $state('');
  let packageSectionName = $state('');

  let isCustomClass = $derived(customClasses.classes.some((c) => c.id === bulkClassId));
  let canCreatePackageMetadata = $derived(
    packageClassName.trim().length > 0
    && (!packageSectionName.trim() || packageUnitName.trim().length > 0),
  );

  interface PackageMetadataSummary {
    classes: Class[];
    classCount: number;
    unitCount: number;
    sectionCount: number;
    missingClasses: number;
    missingUnits: number;
    missingSections: number;
    missingCount: number;
  }

  function packageClassesFromQuestions(source: DraftQuestion[]): Class[] {
    const classes = new Map<string, Class>();

    for (const q of source) {
      const classId = q.classId?.trim();
      const className = q.className?.trim() || classId;
      if (!classId || !className) continue;

      let cls = classes.get(classId);
      if (!cls) {
        cls = { id: classId, name: className, units: [] };
        classes.set(classId, cls);
      }

      const unitId = q.unitId?.trim();
      const unitName = q.unitName?.trim() || unitId;
      if (!unitId || !unitName) continue;

      let unit = cls.units.find((candidate) => candidate.id === unitId);
      if (!unit) {
        unit = { id: unitId, name: unitName, sections: [] };
        cls.units.push(unit);
      }

      const sectionId = q.sectionId?.trim();
      const sectionName = q.sectionName?.trim() || sectionId;
      if (sectionId && sectionName && !unit.sections.some((candidate) => candidate.id === sectionId)) {
        unit.sections.push({ id: sectionId, name: sectionName });
      }
    }

    return [...classes.values()];
  }

  function packageMetadataSummary(classList: Class[]): PackageMetadataSummary {
    const existingClasses = new Map(allClasses.map((cls) => [cls.id, cls] as const));
    let missingClasses = 0;
    let missingUnits = 0;
    let missingSections = 0;

    for (const cls of classList) {
      const existingClass = existingClasses.get(cls.id);
      if (!existingClass) {
        missingClasses++;
        missingUnits += cls.units.length;
        missingSections += cls.units.reduce((count, unit) => count + unit.sections.length, 0);
        continue;
      }

      const existingUnits = new Map(existingClass.units.map((unit) => [unit.id, unit] as const));
      for (const unit of cls.units) {
        const existingUnit = existingUnits.get(unit.id);
        if (!existingUnit) {
          missingUnits++;
          missingSections += unit.sections.length;
          continue;
        }

        const existingSections = new Set(existingUnit.sections.map((section) => section.id));
        for (const section of unit.sections) {
          if (!existingSections.has(section.id)) missingSections++;
        }
      }
    }

    return {
      classes: classList,
      classCount: classList.length,
      unitCount: classList.reduce((count, cls) => count + cls.units.length, 0),
      sectionCount: classList.reduce((count, cls) => (
        count + cls.units.reduce((unitCount, unit) => unitCount + unit.sections.length, 0)
      ), 0),
      missingClasses,
      missingUnits,
      missingSections,
      missingCount: missingClasses + missingUnits + missingSections,
    };
  }

  let packageMetadata = $derived.by(() => packageMetadataSummary(packageClassesFromQuestions(questions)));
  let showPackageMetadataCard = $derived(Boolean(reviewImportKind) || packageMetadata.classCount > 0);

  let detectedCurriculum = $derived.by(() => {
    const units = new Map<string, { name: string; sections: Map<string, string> }>();
    for (const q of questions) {
      const unitId = q.unitId?.trim();
      const unitName = q.unitName?.trim();
      if (!unitId || !unitName) continue;

      let unit = units.get(unitId);
      if (!unit) {
        unit = { name: unitName, sections: new Map() };
        units.set(unitId, unit);
      }

      const sectionId = q.sectionId?.trim();
      const sectionName = q.sectionName?.trim();
      if (sectionId && sectionName && !unit.sections.has(sectionId)) {
        unit.sections.set(sectionId, sectionName);
      }
    }

    return {
      units,
      unitCount: units.size,
      sectionCount: [...units.values()].reduce((n, unit) => n + unit.sections.size, 0),
    };
  });

  let selectedClassMissing = $derived.by(() => {
    const existingUnits = new Map((bulkClass?.units ?? []).map((u) => [u.id, u] as const));
    let missingUnits = 0;
    let missingSections = 0;

    for (const [unitId, unit] of detectedCurriculum.units) {
      const existingUnit = existingUnits.get(unitId);
      if (!existingUnit) {
        missingUnits++;
        missingSections += unit.sections.size;
        continue;
      }
      const existingSectionIds = new Set(existingUnit.sections.map((s) => s.id));
      for (const sectionId of unit.sections.keys()) {
        if (!existingSectionIds.has(sectionId)) missingSections++;
      }
    }

    return { missingUnits, missingSections, missingCount: missingUnits + missingSections };
  });

  $effect(() => {
    if (allClasses.length === 0 && !addingClass) {
      addingClass = true;
    }
  });

  function confirmNewClass() {
    const name = newClassName.trim();
    if (!name) return;
    const cls  = customClasses.add(name);
    bulkClassId  = cls.id;
    addingClass  = false;
    newClassName = '';
    addingUnit   = true;
    newUnitName  = '';
  }

  function confirmNewUnit() {
    const name = newUnitName.trim();
    if (!name) return;
    const unit  = customClasses.addUnit(bulkClassId, name);
    bulkUnitId  = unit.id;
    addingUnit  = false;
    newUnitName = '';
  }

  function confirmNewSection() {
    const name = newSectionName.trim();
    if (!name) return;
    const sec    = customClasses.addSection(bulkClassId, bulkUnitId, name);
    bulkSectionId  = sec.id;
    addingSection  = false;
    newSectionName = '';
  }

  function addAutodetectedCurriculum() {
    if (!bulkClass || !isCustomClass) return;

    const existingUnits = new Map(bulkClass.units.map((u) => [u.id, new Set(u.sections.map((s) => s.id))] as const));
    let firstCreatedUnitId = '';
    let firstCreatedSectionId = '';

    for (const [unitId, unit] of detectedCurriculum.units) {
      if (!existingUnits.has(unitId)) {
        customClasses.addUnit(bulkClassId, unit.name, unitId);
        existingUnits.set(unitId, new Set());
        if (!firstCreatedUnitId) firstCreatedUnitId = unitId;
      }
    }

    for (const [unitId, unit] of detectedCurriculum.units) {
      const sectionIds = existingUnits.get(unitId);
      if (!sectionIds) continue;
      for (const [sectionId, sectionName] of unit.sections) {
        if (sectionIds.has(sectionId)) continue;
        customClasses.addSection(bulkClassId, unitId, sectionName, sectionId);
        sectionIds.add(sectionId);
        if (!firstCreatedSectionId) firstCreatedSectionId = sectionId;
      }
    }

    questions = questions.map((q) =>
      q.unitId || q.sectionId
        ? { ...q, classId: bulkClassId }
        : q,
    );

    const fallbackUnitId = firstCreatedUnitId || detectedCurriculum.units.keys().next().value || '';
    if (!bulkUnitId || !existingUnits.has(bulkUnitId)) {
      bulkUnitId = fallbackUnitId;
    }

    const selectedUnit = detectedCurriculum.units.get(bulkUnitId) ?? detectedCurriculum.units.get(fallbackUnitId);
    if (!bulkSectionId || !selectedUnit?.sections.has(bulkSectionId)) {
      bulkSectionId = firstCreatedSectionId || selectedUnit?.sections.keys().next().value || '';
    }
  }

  function cloneUnit(unit: Unit): Unit {
    return {
      id: unit.id,
      name: unit.name,
      sections: unit.sections.map((section) => ({ ...section })),
    };
  }

  function mergeSection(unit: Unit, incoming: Section) {
    const existing = unit.sections.find((section) => section.id === incoming.id);
    if (existing) {
      if (!existing.name && incoming.name) existing.name = incoming.name;
      return;
    }
    unit.sections.push({ ...incoming });
  }

  function mergeUnit(cls: Class, incoming: Unit) {
    const existing = cls.units.find((unit) => unit.id === incoming.id);
    if (!existing) {
      cls.units.push(cloneUnit(incoming));
      return;
    }
    if (!existing.name && incoming.name) existing.name = incoming.name;
    for (const section of incoming.sections) mergeSection(existing, section);
  }

  function mergePackageMetadataClass(incoming: Class): Class | null {
    const existingCustom = customClasses.classes.find((cls) => cls.id === incoming.id);
    const existingBuiltIn = [...CLASSES, ...DEMO_CLASSES].some((cls) => cls.id === incoming.id);
    if (!existingCustom && existingBuiltIn) return null;

    const merged: Class = existingCustom
      ? {
          id: existingCustom.id,
          name: existingCustom.name || incoming.name,
          units: existingCustom.units.map(cloneUnit),
        }
      : {
          id: incoming.id,
          name: incoming.name,
          units: [],
        };

    for (const unit of incoming.units) mergeUnit(merged, unit);
    return merged;
  }

  function addPackageMetadataClasses(classList: Class[], mode: 'manual' | 'auto'): number {
    const before = packageMetadataSummary(classList);
    if (before.classCount === 0) return 0;
    if (before.missingCount === 0) {
      packageMetadataMessage = 'Package metadata is already in the bank.';
      return 0;
    }

    const merged = before.classes
      .map(mergePackageMetadataClass)
      .filter((cls): cls is Class => Boolean(cls));

    if (merged.length === 0) {
      packageMetadataMessage = 'Package metadata matches built-in classes.';
      return 0;
    }

    const added = customClasses.importMany(merged);
    const first = merged[0];
    if (first) {
      bulkClassId = first.id;
      if (first.units.length === 1) {
        bulkUnitId = first.units[0].id;
        if (first.units[0].sections.length === 1) bulkSectionId = first.units[0].sections[0].id;
      }
    }

    packageMetadataMessage = added > 0
      ? (mode === 'auto' ? 'Added PQP curriculum metadata to the bank.' : 'Added package metadata to the bank.')
      : 'Package metadata is already in the bank.';

    return before.missingCount;
  }

  function addPackageMetadataToBank() {
    addPackageMetadataClasses(packageMetadata.classes, 'manual');
  }

  function addPackageMetadataToBankByDefault(kind: ParsedBulkImportKind | undefined, source: DraftQuestion[]) {
    if (kind !== 'portable-question-package') return;
    addPackageMetadataClasses(packageClassesFromQuestions(source), 'auto');
  }

  function createPackageMetadataForImport() {
    const className = packageClassName.trim();
    const unitName = packageUnitName.trim();
    const sectionName = packageSectionName.trim();
    if (!className || (sectionName && !unitName)) return;

    const cls = customClasses.add(className);
    const unit = unitName ? customClasses.addUnit(cls.id, unitName) : undefined;
    const section = unit && sectionName ? customClasses.addSection(cls.id, unit.id, sectionName) : undefined;

    bulkClassId = cls.id;
    bulkUnitId = unit?.id ?? '';
    bulkSectionId = section?.id ?? '';
    questions = questions.map((q) => ({
      ...q,
      classId: cls.id,
      className: cls.name,
      unitId: unit?.id ?? q.unitId,
      unitName: unit?.name ?? q.unitName,
      sectionId: section?.id ?? q.sectionId,
      sectionName: section?.name ?? q.sectionName,
    }));

    packageMetadataMessage = 'Added package metadata to the bank.';
  }

  $effect(() => { if (!bulkUnits.some((u) => u.id === bulkUnitId))      { bulkUnitId = ''; } });
  $effect(() => { if (!bulkSections.some((s) => s.id === bulkSectionId)) { bulkSectionId = ''; } });

  function cardLabel(q: DraftQuestion): string {
    if (!q.classId) return '';
    const cls = allClasses.find((c) => c.id === q.classId);
    if (!cls) return '';
    let label = cls.name;
    if (q.unitId) {
      const unit = cls.units.find((u) => u.id === q.unitId);
      if (unit) label += ` › ${unit.name}`;
      if (q.sectionId && unit) {
        const sec = unit.sections.find((s) => s.id === q.sectionId);
        if (sec) label += ` › ${sec.name}`;
      }
    }
    return label;
  }

  // ── Parsing (stage 1 → stage 2) ──────────────────────────────────────────

  const SOLUTION_MARKER = /^(\[solution\]|%\s*solution)/i;

  // If a chunk starts with a solution marker it belongs to the previous question.
  function mergeSolutionChunks(chunks: string[]): string[] {
    const out: string[] = [];
    for (const chunk of chunks) {
      if (out.length > 0 && SOLUTION_MARKER.test(chunk)) {
        out[out.length - 1] += '\n' + chunk;
      } else {
        out.push(chunk);
      }
    }
    return out;
  }

  function splitChunks(text: string): string[] {
    const questionMatches = [...text.matchAll(/^\s*\\question\b.*$/gm)];
    // \question can be used explicitly, or auto-detected when present.
    if (splitBy === 'question' || questionMatches.length > 0) {
      if (questionMatches.length === 0) return text.trim() ? [text.trim()] : [];
      return questionMatches
        .map((m, i) => {
          const start = m.index! + m[0].length;
          const end   = i + 1 < questionMatches.length ? questionMatches[i + 1].index! : text.length;
          return text.slice(start, end).trim();
        })
        .filter(Boolean)
        .map((chunk) => chunk.replace(/^\s*\\question\b.*\n?/, '').trim());
    }

    if (splitBy === 'numbered') {
      const re = /^(\d+)[.)]\s+/gm;
      const matches = [...text.matchAll(re)];
      if (matches.length === 0) return text.trim() ? [text.trim()] : [];
      return matches.map((m, i) => {
        const start = m.index! + m[0].length;
        const end   = i + 1 < matches.length ? matches[i + 1].index! : text.length;
        return text.slice(start, end).trim();
      }).filter(Boolean);
    }
    if (splitBy === 'delimiter') {
      return mergeSolutionChunks(text.split(customDelim).map((c) => c.trim()).filter(Boolean));
    }
    // blank lines — most common case; solutions separated by blank line from body merge back in
    return mergeSolutionChunks(text.split(/\n{2,}/).map((c) => c.trim()).filter(Boolean));
  }

  let detectedFormat = $derived<'latex' | 'typst'>(
    format === 'auto' ? detectFormat(rawText) : format,
  );

  let parsedPreview = $derived(splitChunks(rawText));

  /**
   * Strip question-level wrappers that would otherwise leak into bodies.
   * Keep math environments like `cases` intact so MiTeX can convert them.
   */
  function stripLatexStructural(text: string): string {
    return text
      .split('\n')
      .map((line) => {
        let l = line.replace(/^\s*\\(question|item)\b\s*/, '');
        l = l.replace(/^\s*\\begin\s*\{(?:choices|parts|subparts|subsubparts|solution)\}\s*$/i, '');
        l = l.replace(/^\s*\\end\s*\{(?:choices|parts|subparts|subsubparts|solution)\}\s*$/i, '');
        l = l.replace(/^\s*%.*$/, '');
        return l;
      })
      .join('\n');
  }

  function extractCommentMetadata(text: string): {
    tags: string;
    unitId: string;
    unitName: string;
    sectionId: string;
    sectionName: string;
  } {
    const tags: string[] = [];
    let unitId = '';
    let unitName = '';
    let sectionId = '';
    let sectionName = '';

    for (const line of text.split('\n')) {
      const m = /^\s*%\s*(.+?)\s*$/.exec(line);
      if (!m) continue;
      if (/^(?:\[solution\]|solution)\b/i.test(m[1])) continue;

      const unitMatch = /^unit\s+([A-Za-z0-9][A-Za-z0-9._-]*)\s*:\s*(.+)$/i.exec(m[1]);
      if (unitMatch) {
        unitId = unitMatch[1];
        unitName = unitMatch[2].trim();
        continue;
      }

      const sectionMatch = /^section\s+([A-Za-z0-9][A-Za-z0-9._-]*)\s*:\s*(.+)$/i.exec(m[1]);
      if (sectionMatch) {
        sectionId = sectionMatch[1];
        sectionName = sectionMatch[2].trim();
        continue;
      }

      const parts = m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((part) => !/^q\d+$/i.test(part) && !/^question\s*\d+$/i.test(part))
        .map((part) => part.replace(/\bQ\d+\b/gi, '').trim())
        .filter(Boolean);

      tags.push(...parts);
    }

    return { tags: tags.join(', '), unitId, unitName, sectionId, sectionName };
  }

  /**
   * Split a raw chunk into body + solution at a solution marker line.
   * Recognised markers (case-insensitive, at line start):
   *   [solution]   %solution   % solution
   * Text on the same line after the marker is included in the solution.
   */
  function parseSolution(chunk: string): { body: string; solution: string } {
    const beginMatch = /\\begin\s*\{solution\}/i.exec(chunk);
    const endMatch = /\\end\s*\{solution\}/i.exec(chunk);
    if (beginMatch && endMatch && endMatch.index > beginMatch.index) {
      const body = chunk.slice(0, beginMatch.index).trim();
      const solution = chunk
        .slice(beginMatch.index + beginMatch[0].length, endMatch.index)
        .trim();
      return { body, solution };
    }

    const re = /^(\[solution\]|%\s*solution)[ \t]*(.*)/im;
    const m  = re.exec(chunk);
    if (!m) return { body: chunk, solution: '' };

    const body       = chunk.slice(0, m.index).trim();
    const inlineText = m[2].trim();
    const lineEnd    = chunk.indexOf('\n', m.index + m[0].length);
    const afterLine  = lineEnd !== -1 ? chunk.slice(lineEnd + 1).trim() : '';
    const solution   = [inlineText, afterLine].filter(Boolean).join('\n').trim();

    return { body, solution };
  }

  function parseChoices(body: string): { stem: string; choices: Record<string, string>; answer: string } {
    // A. / A) / (A) / (A). / a. / a) / (a)
    const CHOICE_RE      = /^\s*\(?([A-Ea-e])[.)]\)?\s+(.*)/;
    // A*. / A*) — correct-answer marker before delimiter
    const STAR_BEFORE_RE = /^\s*\(?([A-Ea-e])\*[.)]\)?\s*(.*)/;
    // A. text * — correct-answer marker after text
    const STAR_AFTER_RE  = /^\s*\(?([A-Ea-e])[.)]\)?\s+(.*?)\s*\*\s*$/;
    // Strip common LaTeX italic/bold wrappers, then match "Answer: X" patterns.
    // Handles: Answer: A  /  Answer: (a)  /  {\it Answer: (a).}  /  \textit{Answer: (B)}
    function extractAnswer(line: string): string {
      const s = line.trim()
        .replace(/^\{\\(?:it|bf|em)\s+/, '')
        .replace(/^\\text(?:it|bf)\s*\{/, '')
        .replace(/\}\.?\s*$/, '')
        .trim();
      const m = /^(?:Answer|Ans)[.:\s]+\(?([A-Ea-e])\)?\.?\s*$/i.exec(s);
      return m ? m[1].toUpperCase() : '';
    }

    function parseLatexChoiceLine(line: string): { text: string; correct: boolean } | null {
      const trimmed = line.trim();
      if (/^\\correctchoice\b/i.test(trimmed)) {
        return { text: trimmed.replace(/^\\correctchoice\b/i, '').trim(), correct: true };
      }
      if (/^\\choice\b/i.test(trimmed)) {
        return { text: trimmed.replace(/^\\choice\b/i, '').trim(), correct: false };
      }
      return null;
    }

    const lines = body.split('\n');
    let answer = '';

    const choices: Record<string, string> = {};
    let curLetter: string | null = null;
    let curParts: string[] = [];
    let stemEnd = lines.length;
    let seenChoice = false;
    let choiceEnvBeginIdx = -1;

    function flush() {
      if (curLetter !== null && curParts.length > 0)
        choices[curLetter] = curParts.join(' ').trim();
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (/^\\begin\s*\{(?:choices|parts)\}\s*$/i.test(trimmed) || /^\\end\s*\{(?:choices|parts)\}\s*$/i.test(trimmed)) {
        if (/^\\begin\s*\{choices\}\s*$/i.test(trimmed)) choiceEnvBeginIdx = i;
        if (seenChoice && stemEnd === lines.length && choiceEnvBeginIdx !== -1) stemEnd = choiceEnvBeginIdx;
        continue;
      }

      if (/^\\part\b/i.test(trimmed)) {
        if (seenChoice && stemEnd === lines.length) stemEnd = i;
        // Treat AP-style parts as inline subprompts in the stem.
        if (curLetter !== null) flush();
        curLetter = null;
        curParts = [];
        continue;
      }

      const a = extractAnswer(line);
      if (a) { answer = a; continue; }

      const latexChoice = parseLatexChoiceLine(trimmed);
      if (latexChoice) {
        if (!seenChoice) stemEnd = choiceEnvBeginIdx !== -1 ? choiceEnvBeginIdx : i;
        seenChoice = true;
        flush();
        curLetter = String.fromCharCode(65 + Object.keys(choices).length);
        curParts = [latexChoice.text];
        if (latexChoice.correct) answer = curLetter;
        continue;
      }

      const starBefore = STAR_BEFORE_RE.exec(trimmed);
      if (starBefore) {
        if (!seenChoice) stemEnd = i;
        seenChoice = true;
        flush();
        curLetter = starBefore[1].toUpperCase();
        curParts = [starBefore[2].trim()];
        answer = curLetter;
        continue;
      }

      const starAfter = STAR_AFTER_RE.exec(trimmed);
      if (starAfter) {
        if (!seenChoice) stemEnd = i;
        seenChoice = true;
        flush();
        curLetter = starAfter[1].toUpperCase();
        curParts = [starAfter[2].trim()];
        answer = curLetter;
        continue;
      }

      const choiceM = CHOICE_RE.exec(trimmed);
      if (choiceM) {
        if (!seenChoice) stemEnd = i;
        seenChoice = true;
        flush();
        curLetter = choiceM[1].toUpperCase();
        curParts = [choiceM[2].trim()];
        continue;
      }

      if (!trimmed) continue;  // blank line — separator, not continuation

      if (curLetter !== null) curParts.push(line.trim());  // continuation
      else if (!seenChoice) stemEnd = i + 1;
    }
    flush();

    const stemLines = lines.slice(0, stemEnd);
    return { stem: stemLines.join('\n').trim(), choices, answer };
  }

  async function buildDraftQuestions(chunks: string[], fmt: 'latex' | 'typst'): Promise<DraftQuestion[]> {
    return Promise.all(chunks.map(async (raw) => {
      // Extract image refs while structure is still LaTeX / Typst. For Typst
      // paste the references use the `#image("/imgs/NAME")` form already.
      const imageRefs = [...new Set(
        (fmt === 'latex' ? extractImageNames(raw) : scanImageRefs(raw))
          .map(imageKeyFromReference)
          .filter(Boolean),
      )];
      const extracted = fmt === 'latex'
        ? extractCommentMetadata(raw)
        : { tags: '', unitId: '', unitName: '', sectionId: '', sectionName: '' };

      const { body: rawBody, solution: rawSolution } = parseSolution(raw);
      const bodyWithParts = fmt === 'latex' ? convertPartsEnvironment(rawBody) : rawBody;
      const cleanedBody = stripLatexStructural(bodyWithParts);
      const convert = async (s: string) => fmt === 'latex' ? latexToTypst(s) : s;

      const { stem, choices, answer } = parseChoices(cleanedBody);
      const hasChoices = Object.keys(choices).length >= 2;

      const convertedChoices = hasChoices
        ? Object.fromEntries(
            await Promise.all(
              Object.entries(choices).map(async ([k, v]) => [k, await convert(v)] as const),
            ),
          )
        : {};

      const body = hasChoices ? await convert(stem) : await convert(cleanedBody);

      // Split [solution] block: if the first line is a bare letter (A–E), that's the
      // MCQ answer; the rest (if any) is the written explanation.
      const firstSolLine = rawSolution ? rawSolution.split('\n')[0].trim() : '';
      const solLines = rawSolution ? rawSolution.split('\n') : [];
      const labeledSolution = firstSolLine ? stripLeadingAnswerLabel(firstSolLine) : { letter: '', text: '' };
      const solLetter = labeledSolution.letter;
      const solText = labeledSolution.letter
        ? [labeledSolution.text, ...solLines.slice(1)].filter(Boolean).join('\n').trim()
        : rawSolution;

      const solutionWithParts = fmt === 'latex' ? convertPartsEnvironment(solText) : solText;
      const draftAnswer   = solLetter || answer;  // prefer explicit letter, fallback to inline answer
      const draftSolution = solutionWithParts ? await convert(solutionWithParts) : '';

      return {
        body,
        answer:  draftAnswer,
        solution: draftSolution,
        choices: hasChoices ? convertedChoices : undefined,
        points: hasChoices ? 1 : bulkPoints,
        tagInput: extracted.tags,
        classId: '',
        unitId: extracted.unitId,
        sectionId: extracted.sectionId,
        unitName: extracted.unitName,
        sectionName: extracted.sectionName,
        images: imageRefs.length > 0 ? imageRefs : undefined,
        rawLatex: fmt === 'latex' ? raw : undefined,
        rawFormat: fmt,
      };
    }));
  }

  function editableDraftBody(q: DraftQuestion): string {
    return q.parts ? formatParts(q.parts, !q.narrative) : q.body;
  }

  function normalizeImportedQuestions(questions: DraftQuestion[]): DraftQuestion[] {
    return questions
      .filter((q) => editableDraftBody(q).trim())
      .map((q) => {
        const images = q.images
          ? [...new Set(q.images.map(imageKeyFromReference).filter(Boolean))]
          : [];
        return {
          ...q,
          body: editableDraftBody(q),
          parts: undefined,
          tagInput: q.tagInput ?? '',
          images: images.length > 0 ? images : undefined,
        };
      });
  }

  // ── Draft persistence ─────────────────────────────────────────────────────

  function saveDraft(qs: DraftQuestion[]) {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(qs));
  }

  function restoreDraft() {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      questions  = normalizeImportedQuestions(JSON.parse(raw));
      selected   = new Set();
      focusedIdx = 0;
      stage      = 3;
      hasDraft   = false;
      initPreviews();
    } catch {
      localStorage.removeItem(DRAFT_KEY);
      hasDraft = false;
    }
  }

  function discardDraft() {
    localStorage.removeItem(DRAFT_KEY);
    hasDraft = false;
  }

  // Auto-save draft whenever questions change in the review stage
  $effect(() => {
    if (stage === 3 && questions.length > 0) saveDraft(questions);
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  /** Invoked by Continue on stage 1. Builds drafts, then picks stage 2 (if any
   *  image refs) or stage 3 (review) as the next screen. */
  async function continueFromPaste() {
    importError = '';
    const looksLikeJson =
      /"(?:questions|body|points|tagInput|classId|unitId|sectionId)"\s*:/.test(rawText);
    const shouldTryJson = importSourceName.toLowerCase().endsWith('.json') || looksLikeJson;
    const jsonImport = shouldTryJson ? parseBulkImportJson(rawText) : null;

    let newQuestions: DraftQuestion[];
    if (jsonImport) {
      if (jsonImport.error) {
        importError = jsonImport.error;
        return;
      }
      newQuestions = normalizeImportedQuestions(jsonImport.questions);
      reviewImportKind = jsonImport.kind;
      addPackageMetadataToBankByDefault(jsonImport.kind, newQuestions);
    } else if (shouldTryJson) {
      importError = 'Invalid JSON bulk import file.';
      return;
    } else {
      newQuestions = await buildDraftQuestions(parsedPreview, detectedFormat);
      reviewImportKind = undefined;
    }

    if (appendMode) {
      const offset = questions.length;
      qPreviews = [...qPreviews, ...newQuestions.map(() => ({ svg: null, error: '', compiling: false }))];
      qTimers   = [...qTimers, ...new Array(newQuestions.length).fill(undefined)];
      qVisible  = [...qVisible, ...new Array(newQuestions.length).fill(false)];
      qDirty    = [...qDirty,   ...new Array(newQuestions.length).fill(true)];
      questions = [...questions, ...newQuestions];
      selected  = new Set(newQuestions.map((_, i) => offset + i));
      appendMode = false;
      stage = 3;
      return;
    }

    questions  = newQuestions;
    selected   = new Set(questions.map((_, i) => i));
    focusedIdx = 0;
    hasDraft   = false;
    localStorage.removeItem(DRAFT_KEY);
    await refreshKnownImages();

    const hasImageRefs = questions.some((q) => q.images && q.images.length > 0);
    if (hasImageRefs) {
      stage = 2;
    } else {
      stage = 3;
      initPreviews();
    }
  }

  function continueFromImages() {
    selected = new Set(questions.map((_, i) => i));
    stage = 3;
    initPreviews();
  }

  function goBack() {
    if (stage === 3 && referencedImages.length > 0) stage = 2;
    else stage = 1;
  }

  // Unique image basenames referenced across all drafts.
  let referencedImages = $derived<string[]>(
    [...new Set(questions.flatMap((q) => q.images ?? []))].sort(),
  );

  // Total / current step used by the "Step X of Y" badge in headers.
  // On stage 1 we peek at the raw paste to predict whether stage 2 will appear.
  let pasteHasImages = $derived(
    detectedFormat === 'latex'
      ? /\\includegraphics\b/.test(rawText)
      : /"\/imgs\//.test(rawText),
  );
  let totalSteps   = $derived(
    stage === 1 ? (pasteHasImages ? 3 : 2) : (referencedImages.length > 0 ? 3 : 2),
  );
  let currentStep  = $derived(stage === 3 ? totalSteps : stage);

  let importWarning = $state('');
  let importError = $state('');

  function doImport(force = false) {
    const toImportIndices = [...selected];
    const errorCount = toImportIndices.filter((i) => qPreviews[i]?.error).length;
    if (!force && errorCount > 0) {
      importWarning = `${errorCount} question${errorCount !== 1 ? 's have' : ' has'} a compile error. Import anyway?`;
      return;
    }
    importWarning = '';
    const importSet = new Set(toImportIndices);
    const valid = questions
      .filter((q, i) => importSet.has(i) && q.body.trim())
      .map((q) => ({
        ...q,
        classId:   q.classId   || bulkClassId,
        unitId:    q.unitId    || bulkUnitId,
        sectionId: q.sectionId || bulkSectionId,
      }));
    onimport(valid);

    const remaining = questions.filter((_, i) => !importSet.has(i));
    if (remaining.length === 0) {
      localStorage.removeItem(DRAFT_KEY);
      onclose();
    } else {
      for (const i of toImportIndices) clearTimeout(qTimers[i]);
      questions = remaining;
      qPreviews = qPreviews.filter((_, i) => !importSet.has(i));
      qTimers   = qTimers.filter((_, i) => !importSet.has(i));
      qVisible  = qVisible.filter((_, i) => !importSet.has(i));
      qDirty    = qDirty.filter((_, i) => !importSet.has(i));
      selected  = new Set();
      focusedIdx = Math.min(focusedIdx, questions.length - 1);
      saveDraft(questions);
    }
  }

  // ── Stage 2 selection ─────────────────────────────────────────────────────

  function toggleSelect(i: number) {
    const s = new Set(selected);
    s.has(i) ? s.delete(i) : s.add(i);
    selected = s;
  }

  function selectAll()   { selected = new Set(questions.map((_, i) => i)); }
  function deselectAll() { selected = new Set(); }

  function removeSelected() {
    // Cancel in-flight timers for removed questions before shifting indices
    for (const i of selected) clearTimeout(qTimers[i]);
    questions  = questions.filter((_, i) => !selected.has(i));
    qPreviews  = qPreviews.filter((_, i) => !selected.has(i));
    qTimers    = qTimers.filter((_, i) => !selected.has(i));
    selected   = new Set();
    focusedIdx = Math.min(focusedIdx, questions.length - 1);
  }

  function removeQuestion(i: number) {
    clearTimeout(qTimers[i]);
    questions  = questions.filter((_, j) => j !== i);
    qPreviews  = qPreviews.filter((_, j) => j !== i);
    qTimers    = qTimers.filter((_, j) => j !== i);
    const s    = new Set<number>();
    for (const idx of selected) { if (idx < i) s.add(idx); else if (idx > i) s.add(idx - 1); }
    selected   = s;
    focusedIdx = Math.min(focusedIdx, questions.length - 1);
  }

  function applyBulkCurriculum() {
    const s        = new Set(selected);
    const newTags  = bulkTagInput.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    questions = questions.map((q, i) => {
      if (!s.has(i)) return q;
      let tagInput = q.tagInput;
      if (newTags.length > 0) {
        // Merge: append new tags, deduplicate, preserve existing order
        const existing = q.tagInput.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        const merged   = [...new Set([...existing, ...newTags])];
        tagInput = merged.join(', ');
      }
      return { ...q, classId: bulkClassId, unitId: bulkUnitId, sectionId: bulkSectionId, tagInput };
    });
  }

  // ── Keyboard shortcuts (stage 2) ─────────────────────────────────────────

  let cardRefs: HTMLDivElement[] = [];

  function isInputFocused(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement;
    return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { onclose(); return; }
    if (stage !== 3) return;

    if (isInputFocused(e)) return; // let inputs handle their own keys

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIdx = Math.min(focusedIdx + 1, questions.length - 1);
      cardRefs[focusedIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIdx = Math.max(focusedIdx - 1, 0);
      cardRefs[focusedIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === ' ') {
      e.preventDefault();
      toggleSelect(focusedIdx);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeQuestion(focusedIdx);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      selected.size === questions.length ? deselectAll() : selectAll();
    }
  }

  // ── File drag-and-drop ────────────────────────────────────────────────────

  function onDragOver(e: DragEvent)  { e.preventDefault(); isDragOver = true; }
  function onDragLeave()             { isDragOver = false; }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    importError = '';
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    importSourceName = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
      rawText = (ev.target?.result as string) ?? '';
    };
    reader.readAsText(file);
  }

  function onChooseImportFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    importSourceName = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
      rawText = (ev.target?.result as string) ?? '';
    };
    reader.readAsText(file);
    importError = '';
    if (importFileInput) importFileInput.value = '';
  }

  // ── Textarea auto-resize action ───────────────────────────────────────────

  function autoresize(node: HTMLTextAreaElement) {
    function resize() {
      node.style.height = 'auto';
      node.style.overflowY = 'hidden';
      node.style.height = `${node.scrollHeight}px`;
    }

    node.addEventListener('input', resize);
    resize();
    return { destroy() { node.removeEventListener('input', resize); } };
  }

  // ── Derived counts ────────────────────────────────────────────────────────

  let selectedCount = $derived(selected.size);
  let validCount    = $derived(questions.filter((q) => q.body.trim()).length);

  // ── Re-convert ────────────────────────────────────────────────────────────

  let reconverting    = $state(false);
  let showOriginal    = $state(false);
  let reconvertableCount = $derived(questions.filter((q) => !!q.rawLatex).length);

  async function reconvertQuestion(i: number) {
    const q = questions[i];
    if (!q.rawLatex) return;
    const [rebuilt] = await buildDraftQuestions([q.rawLatex], q.rawFormat ?? 'latex');
    // Preserve manually edited curriculum and metadata; take freshly converted content.
    questions[i] = {
      ...rebuilt,
      rawLatex:    q.rawLatex,
      rawFormat:   q.rawFormat,
      classId:     q.classId,
      unitId:      q.unitId    || rebuilt.unitId,
      sectionId:   q.sectionId || rebuilt.sectionId,
      unitName:    q.unitName  || rebuilt.unitName,
      sectionName: q.sectionName || rebuilt.sectionName,
      points:      q.points,
      tagInput:    q.tagInput,
    };
    qDirty[i] = true;
    scheduleRecompile(i);
  }

  async function reconvertAll() {
    reconverting = true;
    for (let i = 0; i < questions.length; i++) {
      if (questions[i].rawLatex) await reconvertQuestion(i);
    }
    reconverting = false;
  }

  // ── Per-question preview ──────────────────────────────────────────────────

  interface QPreview { svg: string | null; error: string; compiling: boolean; }

  let qPreviews  = $state<QPreview[]>(startingDrafts().map(() => ({ svg: null, error: '', compiling: false })));
  let qTimers: Array<ReturnType<typeof setTimeout> | undefined> = new Array(startingDraftCount()).fill(undefined);
  let qVisible   = $state<boolean[]>(new Array(startingDraftCount()).fill(false));
  let qDirty     = $state<boolean[]>(new Array(startingDraftCount()).fill(true));
  let previewTheme = $state<'light' | 'dark'>('dark');

  function questionContent(i: number): string {
    const q    = questions[i];
    const structuredParts = q?.parts;
    let body = '';
    if (structuredParts) {
      body = formatParts(structuredParts);
    } else {
      body = q?.choices && Object.keys(q.choices).length >= 2
        ? formatBody(q.body, q.choices)
        : (q?.body ?? '');
    }
    const blocks = [body];
    if (q?.answer)   blocks.push(`*Answer:* ${q.answer}`);
    if (q?.solution?.trim()) blocks.push(`*Explanation:* ${q.solution.trim()}`);
    return blocks.join('\n\n');
  }

  function wrapForPreview(content: string, dark: boolean): string {
    const bg = dark ? 'rgb("#1c1c1e")' : 'white';
    const fg = dark ? 'rgb("#e0e0e0")' : 'black';
    return [
      `#set page(width: 200pt, height: auto, margin: (x: 8pt, y: 8pt), fill: ${bg})`,
      `#set text(size: 11pt, fill: ${fg})`,
      content,
    ].join('\n');
  }

  function scheduleRecompile(i: number) {
    if (i < 0 || i >= questions.length) return;
    clearTimeout(qTimers[i]);
    qDirty[i] = true;
    const content = questionContent(i);
    const dark    = previewTheme === 'dark';
    if (!content.trim()) {
      qPreviews[i] = { svg: null, error: '', compiling: false };
      qTimers[i]   = undefined;
      qDirty[i]    = false;
      return;
    }
    if (!qVisible[i]) {
      qPreviews[i] = { svg: qPreviews[i]?.svg ?? null, error: '', compiling: false };
      qTimers[i]   = undefined;
      return;
    }
    qDirty[i] = false;
    qPreviews[i] = { svg: qPreviews[i]?.svg ?? null, error: '', compiling: true };
    qTimers[i]   = setTimeout(async () => {
      const result = await compileSvg(wrapForPreview(content, dark));
      if (i < qPreviews.length) {
        qPreviews[i] = { svg: result.svg ?? null, error: result.error ?? '', compiling: false };
      }
      qTimers[i] = undefined;
    }, 400);
  }

  function initPreviews() {
    qTimers.forEach((t) => clearTimeout(t));
    qPreviews = questions.map(() => ({ svg: null, error: '', compiling: false }));
    qTimers   = new Array(questions.length).fill(undefined);
    qVisible  = new Array(questions.length).fill(false);
    qDirty    = new Array(questions.length).fill(true);
  }

  function trackQuestionVisibility(node: HTMLElement, index: number) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        qVisible[index] = entry.isIntersecting;
        if (entry.isIntersecting && (qDirty[index] || !qPreviews[index]?.svg)) {
          scheduleRecompile(index);
        }
      }
    }, { root: null, threshold: 0.01 });

    observer.observe(node);

    return {
      destroy() {
        observer.disconnect();
      },
    };
  }

  // Recompile all when theme changes
  $effect(() => {
    void previewTheme;
    untrack(() => {
      for (let i = 0; i < questions.length; i++) {
        if (qVisible[i]) scheduleRecompile(i);
        else qDirty[i] = true;
      }
    });
  });

  // ── Image handling ────────────────────────────────────────────────────────

  let imageUploadInput: HTMLInputElement | undefined = $state();
  let imageMessage     = $state('');
  let knownImageNames  = $state<string[]>([...imageStore.names]);
  let autoRenameImages = $state(false);

  async function refreshKnownImages(): Promise<void> {
    await imageStore.init();
    knownImageNames = [...imageStore.names];
  }

  // Counts for the Images section header.
  let storedImageKeys = $derived(
    new Set(knownImageNames.map((n) => imageKeyFromReference(n).toLowerCase()).filter(Boolean)),
  );

  function isImageStored(name: string): boolean {
    const key = imageKeyFromReference(name).toLowerCase();
    return Boolean(key && storedImageKeys.has(key));
  }

  let missingImages = $derived(
    referencedImages.filter((n) => !isImageStored(n)),
  );

  $effect(() => {
    if (stage === 2 || stage === 3) void refreshKnownImages();
  });

  // When a new image lands in storage, recompile questions that reference it.
  $effect(() => {
    const keys = storedImageKeys;
    untrack(() => {
      for (let i = 0; i < questions.length; i++) {
        const refs = questions[i]?.images;
        if (refs?.some((n) => keys.has(imageKeyFromReference(n).toLowerCase()))) scheduleRecompile(i);
      }
    });
  });

  interface ImageSaveResult {
    fileName: string;
    key: string;
    displayName?: string;
    matched: string | null;
    renamedFrom?: string;
    renamedTo?: string;
    status: 'saved' | 'skipped' | 'error';
    error?: string;
  }

  const IMAGE_CALL_REF_RE = /(#?image\s*\(\s*)"([^"]+)"/g;
  const IMAGE_SLUG_STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'find', 'solve', 'use', 'using',
    'given', 'where', 'which', 'what', 'when', 'then', 'all', 'each', 'your', 'answer',
    'to', 'of', 'in', 'on', 'at', 'by', 'as', 'is', 'are', 'below', 'above', 'shown',
    'question', 'image', 'figure',
  ]);

  function plainImageSlugText(q: DraftQuestion): string {
    return [
      q.body,
      q.solution ?? '',
      ...(q.choices ? Object.values(q.choices) : []),
    ]
      .join(' ')
      .replace(IMAGE_CALL_REF_RE, ' ')
      .replace(/\$[^$]*\$/g, ' ')
      .replace(/#[a-zA-Z][\w-]*(?:\([^)]*\))?/g, ' ')
      .replace(/\\[a-zA-Z]+/g, ' ');
  }

  function slugWords(value: string): string {
    const words = value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 1 && !IMAGE_SLUG_STOPWORDS.has(word))
      .slice(0, 6);
    return words.join('-') || 'image';
  }

  function compactSlug(value: string, fallback = ''): string {
    return (value || fallback)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function abbreviateWords(value: string, fallback = ''): string {
    const source = value.trim() || fallback;
    const words = source
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((word) => word && !IMAGE_SLUG_STOPWORDS.has(word));
    if (!words.length) return compactSlug(source, fallback);
    const initials = words.map((word) => word[0]).join('');
    return initials.length >= 2 ? initials.slice(0, 8) : compactSlug(source, fallback).slice(0, 12);
  }

  function compactCurriculumId(value: string, prefix: string, padNumeric = false): string {
    const slug = compactSlug(value);
    if (!slug) return '';
    const withoutPrefix = slug.replace(new RegExp(`^${prefix}-?`), '');
    const formatted = padNumeric && /^\d+$/.test(withoutPrefix)
      ? withoutPrefix.padStart(2, '0')
      : withoutPrefix;
    return `${prefix}${formatted}`;
  }

  function curriculumImagePrefix(q: DraftQuestion, questionIndex: number): string {
    const cls = allClasses.find((candidate) => candidate.id === q.classId);
    const unit = cls?.units.find((candidate) => candidate.id === q.unitId);
    const section = unit?.sections.find((candidate) => candidate.id === q.sectionId);
    const parts = [
      compactSlug(cls?.id ?? q.classId, 'uncategorized'),
      compactCurriculumId(q.unitId, 'u', true),
      compactCurriculumId(q.sectionId, 's'),
      `q${String(questionIndex + 1).padStart(3, '0')}`,
    ].filter(Boolean);
    if (section?.name) parts.push(abbreviateWords(section.name, section.id));
    return parts.join('-');
  }

  function imageRefQuestionIndex(refName: string): number {
    const refKey = imageKeyFromReference(refName).toLowerCase();
    return questions.findIndex((q) =>
      (q.images ?? []).some((name) => imageKeyFromReference(name).toLowerCase() === refKey),
    );
  }

  function imageRefIndexInQuestion(q: DraftQuestion, refName: string): number {
    const refKey = imageKeyFromReference(refName).toLowerCase();
    return (q.images ?? []).findIndex((name) => imageKeyFromReference(name).toLowerCase() === refKey);
  }

  function uniqueImageKey(base: string, usedKeys: Set<string>, originalKey: string): string {
    const cleanBase = (imageKeyFromReference(base) || 'image').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 72) || 'image';
    const originalLower = originalKey.toLowerCase();
    let candidate = cleanBase;
    let suffix = 2;
    while (usedKeys.has(candidate.toLowerCase()) && candidate.toLowerCase() !== originalLower) {
      const suffixText = `-${suffix}`;
      candidate = `${cleanBase.slice(0, Math.max(1, 72 - suffixText.length))}${suffixText}`;
      suffix++;
    }
    return candidate;
  }

  function automaticImageKey(refName: string, fallbackKey: string, usedKeys: Set<string>): string {
    const originalKey = imageKeyFromReference(refName || fallbackKey) || fallbackKey;
    const qIndex = imageRefQuestionIndex(refName);
    if (qIndex < 0) return uniqueImageKey(originalKey, usedKeys, originalKey);

    const q = questions[qIndex];
    const imageIndex = imageRefIndexInQuestion(q, refName);
    const slug = slugWords(plainImageSlugText(q));
    const imageSuffix = (q.images?.length ?? 0) > 1 && imageIndex >= 0 ? `-image-${imageIndex + 1}` : '';
    return uniqueImageKey(`${curriculumImagePrefix(q, qIndex)}-${slug}${imageSuffix}`, usedKeys, originalKey);
  }

  function replaceImageRefInText(value: string | undefined, oldKeyLower: string, newReference: string): string | undefined {
    if (!value) return value;
    return value.replace(IMAGE_CALL_REF_RE, (full, prefix: string, path: string) => {
      const pathKey = imageKeyFromReference(path).toLowerCase();
      return pathKey === oldKeyLower ? `${prefix}"/imgs/${newReference}"` : full;
    });
  }

  function applyImageRename(oldRef: string, newKey: string, ext: string) {
    const oldKeyLower = imageKeyFromReference(oldRef).toLowerCase();
    const newKeyLower = imageKeyFromReference(newKey).toLowerCase();
    if (!oldKeyLower || oldKeyLower === newKeyLower) return;
    const newReference = ext ? `${newKey}.${ext.toLowerCase()}` : newKey;

    const touched: number[] = [];
    questions = questions.map((q, index) => {
      const images = q.images ?? [];
      const imageTouched = images.some((name) => imageKeyFromReference(name).toLowerCase() === oldKeyLower);
      const body = replaceImageRefInText(q.body, oldKeyLower, newReference) ?? q.body;
      const solution = replaceImageRefInText(q.solution, oldKeyLower, newReference) ?? q.solution;
      const choices = q.choices
        ? Object.fromEntries(
            Object.entries(q.choices).map(([letter, value]) => [
              letter,
              replaceImageRefInText(value, oldKeyLower, newReference) ?? value,
            ]),
          )
        : undefined;
      const textTouched = body !== q.body
        || solution !== q.solution
        || (choices && JSON.stringify(choices) !== JSON.stringify(q.choices));

      if (!imageTouched && !textTouched) return q;
      touched.push(index);
      const nextImages = [...new Set(images.map((name) =>
        imageKeyFromReference(name).toLowerCase() === oldKeyLower ? newKey : name,
      ))];
      return {
        ...q,
        body,
        solution,
        choices,
        images: nextImages.length > 0 ? nextImages : undefined,
      };
    });

    for (const index of touched) scheduleRecompile(index);
  }

  async function saveFile(file: File, usedKeys: Set<string>): Promise<ImageSaveResult> {
    const { ext } = splitFilename(file.name);
    const fileKey = imageKeyFromReference(file.name);
    if (!ext || !isSupportedExt(ext)) {
      return { fileName: file.name, key: fileKey, matched: null, status: 'skipped' };
    }
    if (!fileKey) {
      return { fileName: file.name, key: '', matched: null, status: 'skipped' };
    }

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // Match to a referenced basename (case-insensitive) if one exists;
      // otherwise store under the file's own stem so later references work too.
      const refMatch = referencedImages.find((n) => imageKeyFromReference(n).toLowerCase() === fileKey.toLowerCase());
      const originalKey = imageKeyFromReference(refMatch ?? fileKey);
      const key = autoRenameImages && refMatch
        ? automaticImageKey(refMatch, fileKey, usedKeys)
        : uniqueImageKey(originalKey, usedKeys, originalKey);
      await imageStore.put(key, bytes, ext);
      usedKeys.add(key.toLowerCase());
      if (refMatch && key.toLowerCase() !== imageKeyFromReference(refMatch).toLowerCase()) {
        applyImageRename(refMatch, key, ext);
      }
      const renamed = refMatch && key.toLowerCase() !== imageKeyFromReference(refMatch).toLowerCase();
      return {
        fileName: file.name,
        key,
        displayName: `${key}.${ext.toLowerCase()}`,
        matched: refMatch ?? null,
        renamedFrom: renamed ? `${imageKeyFromReference(refMatch)}.${ext.toLowerCase()}` : undefined,
        renamedTo: renamed ? `${key}.${ext.toLowerCase()}` : undefined,
        status: 'saved',
      };
    } catch (err) {
      return {
        fileName: file.name,
        key: fileKey,
        matched: null,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function onUploadImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    imageMessage = `Uploading ${files.length} file${files.length === 1 ? '' : 's'}...`;
    const results: ImageSaveResult[] = [];
    const usedKeys = new Set(knownImageNames.map((name) => imageKeyFromReference(name).toLowerCase()).filter(Boolean));
    for (const file of Array.from(files)) results.push(await saveFile(file, usedKeys));
    const savedKeys = results.filter((r) => r.status === 'saved').map((r) => r.key).filter(Boolean);
    if (savedKeys.length > 0) {
      knownImageNames = [...new Set([...knownImageNames, ...savedKeys])].sort();
    }
    await refreshKnownImages();

    const matched = results.filter((r) => r.status === 'saved' && r.matched !== null);
    const unmatched = results.filter((r) => r.status === 'saved' && r.matched === null);
    const renamed = results.filter((r) => r.status === 'saved' && r.renamedFrom);
    const skipped = results.filter((r) => r.status === 'skipped');
    const failed = results.filter((r) => r.status === 'error');
    const parts: string[] = [];
    if (matched.length) parts.push(`${matched.length} matched`);
    if (renamed.length) parts.push(`${renamed.length} renamed`);
    if (unmatched.length) parts.push(`${unmatched.length} saved but not referenced`);
    if (skipped.length) parts.push(`${skipped.length} skipped (unsupported extension)`);
    if (failed.length) parts.push(`${failed.length} failed`);

    const detailParts: string[] = [];
    if (renamed.length) {
      detailParts.push(`Renamed: ${renamed.slice(0, 3).map((r) => `${r.renamedFrom} -> ${r.renamedTo ?? r.displayName ?? r.key}`).join(', ')}`);
    }
    if (unmatched.length) {
      detailParts.push(`Unmatched: ${unmatched.slice(0, 4).map((r) => `${r.fileName} -> ${r.displayName ?? r.key}`).join(', ')}`);
    }
    if (skipped.length) {
      detailParts.push(`Skipped: ${skipped.slice(0, 4).map((r) => r.fileName).join(', ')}`);
    }
    if (failed.length) {
      detailParts.push(`Error: ${failed[0].fileName}: ${failed[0].error ?? 'unknown error'}`);
    }
    if (missingImages.length > 0) {
      detailParts.push(`Still missing: ${missingImages.slice(0, 4).join(', ')}${missingImages.length > 4 ? ', ...' : ''}`);
    }

    imageMessage = [parts.join(' · ') || 'No files processed', detailParts.join(' · ')].filter(Boolean).join('. ');
    if (imageUploadInput) imageUploadInput.value = '';
  }

  async function removeImage(name: string) {
    if (!confirm(`Remove image "${name}" from browser storage?`)) return;
    await imageStore.remove(name);
    await refreshKnownImages();
  }

  function onImageDragOver(e: DragEvent) { e.preventDefault(); isImageDragOver = true; }
  function onImageDragLeave()             { isImageDragOver = false; }
  function onImageDrop(e: DragEvent) {
    e.preventDefault();
    isImageDragOver = false;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) onUploadImages(files);
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- ── Stage 1 ─────────────────────────────────────────────────────────── -->
{#if stage === 1}
<div class="overlay" role="dialog" aria-modal="true" aria-label="Bulk Import Step 1">
  <div class="modal stage1-modal">

    <header>
      <div class="header-left">
        <span class="step-badge">{appendMode ? 'Add More' : `Step 1 of ${totalSteps}`}</span>
        <h2>{appendMode ? `Add More Questions` : 'Bulk Import'}</h2>
        {#if appendMode}
          <span class="count-badge">{questions.length} in queue</span>
        {/if}
      </div>
      <button class="ghost" onclick={onclose} title="Close">✕</button>
    </header>

    <div class="stage1-body">

      {#if hasDraft}
        <div class="draft-banner">
          <span>You have an unsaved import draft.</span>
          <button class="ghost small" onclick={restoreDraft} title="Restore your previous in-progress import">Restore</button>
          <button class="ghost small" onclick={discardDraft} title="Discard the saved draft and start fresh">Discard</button>
        </div>
      {/if}

      <!-- Controls row -->
      <div class="controls-row">
        <label class="control-group">
          <span class="control-label">Format</span>
          <select bind:value={format}>
            <option value="auto">Auto-detect</option>
            <option value="typst">Typst</option>
            <option value="latex">LaTeX</option>
          </select>
        </label>

        <label class="control-group">
          <span class="control-label">Split by</span>
          <select bind:value={splitBy}>
            <option value="question">Question commands (\question)</option>
            <option value="numbered">Question numbers (1. 2. 3.)</option>
            <option value="delimiter">Custom delimiter</option>
            <option value="blank">Blank lines</option>
          </select>
        </label>

        {#if splitBy === 'delimiter'}
          <label class="control-group">
            <span class="control-label">Delimiter</span>
            <input type="text" bind:value={customDelim} style="width: 8rem;" />
          </label>
        {/if}

        <label class="control-group">
          <span class="control-label">Default pts</span>
          <input type="number" bind:value={bulkPoints} min="0" step="0.5" style="width: 5rem;" />
        </label>
      </div>

      <!-- Paste area -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="drop-zone"
        class:drag-over={isDragOver}
        ondragover={onDragOver}
        ondragleave={onDragLeave}
        ondrop={onDrop}
      >
        <textarea
          class="paste-area"
          placeholder="Paste questions here, or drag and drop a .tex / .txt / .typ / .pqp.json / .json file…"
          bind:value={rawText}
          spellcheck="false"
          oninput={() => { importError = ''; importSourceName = ''; }}
        ></textarea>
        {#if isDragOver}
          <div class="drag-message">Drop file to load</div>
        {/if}
      </div>

      <div class="import-file-row">
        <input
          type="file"
          accept=".json,.pqp,.pqp.json,.tex,.txt,.typ,text/plain,text/x-tex,application/json"
          bind:this={importFileInput}
          onchange={onChooseImportFile}
        />
        <span class="hint-text">
          Supports pasted LaTeX / Typst, Portable Question Package files (<code>.pqp.json</code>), and OCR export files like <code>bulk_import.json</code>.
        </span>
      </div>

      <!-- Status bar -->
      <div class="status-bar">
        <span>
          {#if rawText.trim() === ''}
            <span class="muted">No content yet</span>
          {:else if parsedPreview.length === 0}
            <span class="warn">No questions detected — try a different split strategy</span>
          {:else}
            <span class="ok">
              {parsedPreview.length} question{parsedPreview.length !== 1 ? 's' : ''} detected
              · format: <strong>{detectedFormat === 'latex' ? 'LaTeX → Typst' : 'Typst'}</strong>
            </span>
          {/if}
        </span>
        <span class="hint-text">
          MCQ choices (A. / A) / (A)) are auto-detected · mark the answer with <code>Answer: B</code> · embed solutions with <code>[solution]</code>
        </span>
      </div>

      {#if importError}
        <p class="import-error">{importError}</p>
      {/if}
    </div>

    <footer>
      {#if appendMode}
        <button onclick={() => { appendMode = false; stage = 3; }} title="Return to the import queue">← Back to queue</button>
      {:else}
        <button onclick={onclose} title="Cancel import and close">Cancel</button>
      {/if}
      <button
        class="primary"
        disabled={parsedPreview.length === 0}
        onclick={continueFromPaste}
        title={appendMode ? 'Parse and append to the current queue' : 'Proceed to review the parsed questions'}
      >{appendMode ? 'Parse & Add →' : 'Continue →'}</button>
    </footer>

  </div>
</div>

<!-- ── Stage 2 — Image upload (only when drafts reference \includegraphics) ─── -->
{:else if stage === 2}
<div class="overlay" role="dialog" aria-modal="true" aria-label="Bulk Import Step 2">
  <div class="modal stage-images-modal">

    <header>
      <div class="header-left">
        <span class="step-badge">Step 2 of {totalSteps}</span>
        <h2>Upload Images</h2>
      </div>
      <button class="ghost" onclick={onclose} title="Close">✕</button>
    </header>

    <div class="stage-images-body">
      <p class="stage-intro">
        The imported questions reference
        <strong>{referencedImages.length}</strong>
        image{referencedImages.length === 1 ? '' : 's'}. Upload them now so they
        appear in the preview — or skip and upload later from the review screen.
      </p>

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="drop-zone image-drop-zone"
        class:drag-over={isImageDragOver}
        ondragover={onImageDragOver}
        ondragleave={onImageDragLeave}
        ondrop={onImageDrop}
      >
        <div class="drop-zone-inner">
          <p class="drop-zone-title">
            {isImageDragOver ? 'Drop to upload' : 'Drag & drop image files here'}
          </p>
          <p class="drop-zone-sub">or</p>
          <input
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.svg,.webp,.gif,.pdf,image/*,application/pdf"
            bind:this={imageUploadInput}
            onchange={(e) => onUploadImages((e.currentTarget as HTMLInputElement).files)}
            style="display: none"
          />
          <button
            class="primary"
            onclick={() => imageUploadInput?.click()}
            title="Select image files to upload — matched to LaTeX references by filename"
          >
            📂 Choose files…
          </button>
          <p class="drop-zone-hint">
            Supported: .png, .jpg, .jpeg, .svg, .webp, .gif, .pdf — match by filename.
          </p>
          <div class="auto-rename-control">
            <input
              id="auto-rename-images-upload"
              type="checkbox"
              bind:checked={autoRenameImages}
              aria-describedby="auto-rename-images-upload-hint"
            />
            <label for="auto-rename-images-upload">Automatically rename matched images with curriculum and question metadata</label>
          </div>
          <p id="auto-rename-images-upload-hint" class="drop-zone-hint">
            Example: a screenshot filename can become <code>ap-calc-bc-u03-s3-1-q003-chain-rule.png</code>, and the question reference is updated.
          </p>
          {#if imageMessage}
            <p class="image-message">{imageMessage}</p>
          {/if}
        </div>
      </div>

      <div class="image-status-panel">
        <div class="image-status-header">
          <span>Referenced images</span>
          <span class="muted">
          {referencedImages.length - missingImages.length}/{referencedImages.length} uploaded
          </span>
        </div>
        <ul class="image-list stage-image-list">
          {#each referencedImages as name}
            {@const stored = isImageStored(name)}
            <li class="image-row" class:missing={!stored}>
              <span class="img-status" title={stored ? 'Uploaded' : 'Missing'}>
                {stored ? '✓' : '✗'}
              </span>
              <span class="img-name" title={name}>{name}</span>
              {#if stored}
                <button
                  class="ghost tiny"
                  onclick={() => removeImage(name)}
                  title="Remove from browser storage"
                >✕</button>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    </div>

    <footer>
      <button onclick={goBack} title="Return to the paste step">← Back</button>
      <span class="spacer"></span>
      {#if missingImages.length > 0}
        <span class="skip-hint">
          {missingImages.length} still missing — previews will show Typst errors for those.
        </span>
      {/if}
      <button class="primary" onclick={continueFromImages} title={missingImages.length > 0 ? 'Continue without uploading the missing images' : 'Proceed to review the parsed questions'}>
        {missingImages.length > 0 ? 'Skip & Continue →' : 'Continue to Review →'}
      </button>
    </footer>

  </div>
</div>

<!-- ── Stage 3 — Review & Assign ─────────────────────────────────────────── -->
{:else}
<div class="overlay" role="dialog" aria-modal="true" aria-label="Bulk Import Step 2">
  <div class="modal stage2-modal">

    <header>
      <div class="header-left">
        <span class="step-badge">Step {totalSteps} of {totalSteps}</span>
        <h2>Review & Assign <span class="count-badge">{questions.length}</span></h2>
      </div>
      <div class="header-hint">↑↓ navigate · Space select · Del remove · Ctrl+A all</div>
      {#if reconvertableCount > 0}
        <button
          class="ghost small"
          class:active={showOriginal}
          onclick={() => showOriginal = !showOriginal}
          title="Toggle display of original LaTeX source alongside converted Typst"
        >LaTeX</button>
        <button
          class="ghost small"
          disabled={reconverting}
          onclick={reconvertAll}
          title="Re-run the LaTeX→Typst converter on all original sources — useful after editing latex-to-typst.ts"
        >{reconverting ? 'Converting…' : '↺ Re-convert'}</button>
      {/if}
      <button
        class="ghost small theme-toggle"
        onclick={() => previewTheme = previewTheme === 'light' ? 'dark' : 'light'}
        title="Toggle preview theme"
      >{previewTheme === 'light' ? '☾ Dark' : '☀ Light'}</button>
      <button class="ghost" onclick={onclose} title="Close">✕</button>
    </header>

    <div class="stage2-body">

      <!-- Left sidebar: bulk assign -->
      <aside class="sidebar">

        {#if referencedImages.length > 0}
          <div class="images-section">
            <p class="sidebar-heading">
              Images
              <span class="images-count">
                {referencedImages.length - missingImages.length}/{referencedImages.length} stored
              </span>
            </p>

            <ul class="image-list">
              {#each referencedImages as name}
                {@const stored = isImageStored(name)}
                <li class="image-row" class:missing={!stored}>
                  <span class="img-status" title={stored ? 'Uploaded' : 'Missing'}>
                    {stored ? '✓' : '✗'}
                  </span>
                  <span class="img-name" title={name}>{name}</span>
                  {#if stored}
                    <button
                      class="ghost tiny"
                      onclick={() => removeImage(name)}
                      title="Remove from browser storage"
                    >✕</button>
                  {/if}
                </li>
              {/each}
            </ul>

            <input
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.svg,.webp,.gif,.pdf,image/*,application/pdf"
              bind:this={imageUploadInput}
              onchange={(e) => onUploadImages((e.currentTarget as HTMLInputElement).files)}
              style="display: none"
            />
            <button
              class="primary full-width small"
              onclick={() => imageUploadInput?.click()}
              title="Select image files to upload — matched to LaTeX references by filename"
            >
              📂 Upload images…
            </button>
            <div class="auto-rename-control compact">
              <input
                id="auto-rename-images-review"
                type="checkbox"
                bind:checked={autoRenameImages}
                aria-describedby="auto-rename-images-review-hint"
              />
              <label for="auto-rename-images-review">Auto-rename matched images with metadata</label>
            </div>
            {#if imageMessage}
              <p class="image-message">{imageMessage}</p>
            {/if}
            <p id="auto-rename-images-review-hint" class="image-hint">
              Files are matched to LaTeX <code>\includegraphics</code> names by filename. Auto-rename uses curriculum metadata, the staged question number, and body keywords, then rewrites the question references.
            </p>
          </div>
        {/if}

        {#if showPackageMetadataCard}
          <div class="metadata-card">
            <p class="sidebar-heading">
              Package Metadata
              {#if packageMetadata.classCount > 0}
                <span class="images-count">
                  {packageMetadata.classCount} class{packageMetadata.classCount === 1 ? '' : 'es'}
                </span>
              {/if}
            </p>
            {#if packageMetadata.classCount > 0}
              <div class="metadata-summary">
                <strong>{packageMetadata.classes.map((cls) => cls.name).join(', ')}</strong>
                <span>
                  {packageMetadata.unitCount} unit{packageMetadata.unitCount === 1 ? '' : 's'}
                  · {packageMetadata.sectionCount} section{packageMetadata.sectionCount === 1 ? '' : 's'}
                </span>
                <span>
                  {#if packageMetadata.missingCount > 0}
                    {packageMetadata.missingClasses} class{packageMetadata.missingClasses === 1 ? '' : 'es'},
                    {packageMetadata.missingUnits} unit{packageMetadata.missingUnits === 1 ? '' : 's'},
                    {packageMetadata.missingSections} section{packageMetadata.missingSections === 1 ? '' : 's'} missing
                  {:else}
                    Already in the bank
                  {/if}
                </span>
              </div>
              <button
                class="primary full-width small"
                onclick={addPackageMetadataToBank}
                disabled={packageMetadata.missingCount === 0}
                title="Create missing classes, units, and sections from this package"
              >
                Add metadata to bank
              </button>
            {:else}
              <div class="metadata-inputs">
                <label>
                  <span>Class</span>
                  <input type="text" bind:value={packageClassName} placeholder="Grade 12 Pre-Calculus" />
                </label>
                <label>
                  <span>Unit</span>
                  <input type="text" bind:value={packageUnitName} placeholder="Unit 1: Functions" />
                </label>
                <label>
                  <span>Section</span>
                  <input type="text" bind:value={packageSectionName} placeholder="Section 1.1: Transformations" />
                </label>
              </div>
              <button
                class="primary full-width small"
                onclick={createPackageMetadataForImport}
                disabled={!canCreatePackageMetadata}
                title="Create this class, unit, and section and assign them to the imported questions"
              >
                Add metadata to bank
              </button>
            {/if}
            {#if packageMetadataMessage}
              <p class="image-message">{packageMetadataMessage}</p>
            {/if}
          </div>
        {/if}

        <p class="sidebar-heading">Bulk Assign</p>

        <div class="sidebar-field">
          <span class="label">Class</span>
          {#if allClasses.length === 0 && !addingClass}
            <div class="empty-curriculum-hint">
              No classes yet. Create one to assign imported questions.
            </div>
          {/if}
          <select
            value={addingClass ? '' : bulkClassId}
            onchange={(e) => {
              const v = (e.currentTarget as HTMLSelectElement).value;
              if (v === '__new__') { addingClass = true; newClassName = ''; }
              else { bulkClassId = v; addingClass = false; }
            }}
          >
            <option value="">— none —</option>
            {#each allClasses as cls}
              <option value={cls.id}>{cls.name}</option>
            {/each}
            <option value="__new__">＋ New class…</option>
          </select>
          {#if addingClass}
            <div class="new-class-row">
              <input
                type="text"
                bind:value={newClassName}
                placeholder="Class name"
                class="new-class-input"
                onkeydown={(e) => {
                  if (e.key === 'Enter') confirmNewClass();
                  if (e.key === 'Escape') { addingClass = false; }
                }}
              />
              <button class="primary small" onclick={confirmNewClass} disabled={!newClassName.trim()} title="Create this class">Add</button>
              <button class="ghost small" onclick={() => { addingClass = false; }} title="Cancel">✕</button>
            </div>
          {/if}
        </div>

        <div class="sidebar-field">
          <span class="label">Unit</span>
          <select
            value={addingUnit ? '__new_unit__' : bulkUnitId}
            disabled={bulkUnits.length === 0 && !isCustomClass}
            onchange={(e) => {
              const v = (e.currentTarget as HTMLSelectElement).value;
              if (v === '__new_unit__') { addingUnit = true; newUnitName = ''; }
              else { bulkUnitId = v; addingUnit = false; }
            }}
          >
            <option value="">— none —</option>
            {#each bulkUnits as u}
              <option value={u.id}>{u.name}</option>
            {/each}
            {#if isCustomClass && bulkClassId}
              <option value="__new_unit__">＋ Add unit…</option>
            {/if}
          </select>
          {#if addingUnit}
            <div class="new-class-row">
              <input
                type="text"
                bind:value={newUnitName}
                placeholder="Unit name"
                class="new-class-input"
                onkeydown={(e) => {
                  if (e.key === 'Enter') confirmNewUnit();
                  if (e.key === 'Escape') { addingUnit = false; }
                }}
              />
              <button class="primary small" onclick={confirmNewUnit} disabled={!newUnitName.trim()} title="Create this unit">Add</button>
              <button class="ghost small" onclick={() => { addingUnit = false; }} title="Cancel">✕</button>
            </div>
          {/if}
        </div>

        <div class="sidebar-field">
          <span class="label">Section</span>
          <select
            value={addingSection ? '__new_sec__' : bulkSectionId}
            disabled={bulkSections.length === 0 && !(isCustomClass && bulkUnitId)}
            onchange={(e) => {
              const v = (e.currentTarget as HTMLSelectElement).value;
              if (v === '__new_sec__') { addingSection = true; newSectionName = ''; }
              else { bulkSectionId = v; addingSection = false; }
            }}
          >
            <option value="">— none —</option>
            {#each bulkSections as s}
              <option value={s.id}>{s.name}</option>
            {/each}
            {#if isCustomClass && bulkUnitId}
              <option value="__new_sec__">＋ Add section…</option>
            {/if}
          </select>
          {#if addingSection}
            <div class="new-class-row">
              <input
                type="text"
                bind:value={newSectionName}
                placeholder="Section name"
                class="new-class-input"
                onkeydown={(e) => {
                  if (e.key === 'Enter') confirmNewSection();
                  if (e.key === 'Escape') { addingSection = false; }
                }}
              />
              <button class="primary small" onclick={confirmNewSection} disabled={!newSectionName.trim()} title="Create this section">Add</button>
              <button class="ghost small" onclick={() => { addingSection = false; }} title="Cancel">✕</button>
            </div>
          {/if}
        </div>

        {#if detectedCurriculum.unitCount > 0}
          <div class="sidebar-field">
            <span class="label">Detected curriculum</span>
            <div class="empty-curriculum-hint">
              {detectedCurriculum.unitCount} unit{detectedCurriculum.unitCount === 1 ? '' : 's'}
              and {detectedCurriculum.sectionCount} section{detectedCurriculum.sectionCount === 1 ? '' : 's'}
              are detected in comments.
              {#if bulkClass}
                {selectedClassMissing.missingCount > 0
                  ? ` ${selectedClassMissing.missingUnits} unit${selectedClassMissing.missingUnits === 1 ? '' : 's'} and ${selectedClassMissing.missingSections} section${selectedClassMissing.missingSections === 1 ? '' : 's'} are missing from ${bulkClass.name}.`
                  : ` All detected curriculum already exists in ${bulkClass.name}.`}
              {/if}
            </div>
            <button
              class="ghost full-width small"
              onclick={addAutodetectedCurriculum}
              disabled={!isCustomClass || detectedCurriculum.unitCount === 0}
              title={isCustomClass ? 'Create the missing units and sections from comment metadata' : 'Select a custom class to add curriculum'}
            >
              Add autodetected units/sections
            </button>
            {#if !isCustomClass}
              <p class="image-hint">
                Switch to a custom class to create new units and sections.
              </p>
            {/if}
          </div>
        {/if}

        <div class="sidebar-field">
          <span class="label">Tags <span class="hint">(comma-separated, appended)</span></span>
          <input type="text" bind:value={bulkTagInput} placeholder="e.g. calculus, limits" />
        </div>

        <button
          class="primary full-width"
          disabled={selectedCount === 0}
          onclick={applyBulkCurriculum}
          title="Apply the class / unit / section and tags above to all selected questions"
        >
          Apply to {selectedCount || 'selected'}
        </button>

        <div class="select-links">
          <button class="link" onclick={selectAll} title="Select all questions">Select all</button>
          <span>·</span>
          <button class="link" onclick={deselectAll} title="Deselect all questions">None</button>
        </div>
      </aside>

      <!-- Right: question list -->
      <div class="question-list">
        {#each questions as q, i (i)}
          <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
          <div
            class="q-card"
            class:focused={focusedIdx === i}
            class:checked={selected.has(i)}
            bind:this={cardRefs[i]}
            use:trackQuestionVisibility={i}
            onclick={() => focusedIdx = i}
          >
            <label class="q-check" onclick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={selected.has(i)}
                onchange={() => toggleSelect(i)}
              />
            </label>

            <span class="q-num">{i + 1}</span>

            <div class="q-fields">
              {#if showOriginal && q.rawLatex}
                <div class="q-original">
                  <div class="q-original-label">
                    Original LaTeX
                    <button
                      class="link reconvert-one"
                      onclick={() => reconvertQuestion(i)}
                      title="Re-run converter on this question's original LaTeX"
                    >↺ re-convert</button>
                  </div>
                  <pre class="q-original-pre">{q.rawLatex}</pre>
                </div>
              {/if}
              <textarea
                class="q-body"
                bind:value={q.body}
                use:autoresize
                oninput={() => { q.parts = undefined; scheduleRecompile(i); }}
                rows={2}
                spellcheck="false"
                placeholder="Question body (Typst markup)"
              ></textarea>

              <div class="q-meta-row">
                <label class="q-meta-field">
                  <span class="label">pts</span>
                  <input type="number" bind:value={q.points} min="0" step="0.5" class="pts-input" />
                </label>
                <label class="q-meta-field" style="flex: 1">
                  <span class="label">tags</span>
                  <input
                    type="text"
                    bind:value={q.tagInput}
                    placeholder="comma-separated"
                    class="tags-input"
                  />
                </label>
                {#if q.choices && Object.keys(q.choices).length >= 2}
                  <span class="badge-mcq">MCQ</span>
                {/if}
                {#if q.images && q.images.length > 0}
                  {@const missing = q.images.filter((n) => !isImageStored(n))}
                  <span
                    class="badge-img"
                    class:badge-img-missing={missing.length > 0}
                    title={
                      missing.length > 0
                        ? `Missing images: ${missing.join(', ')}`
                        : `Images: ${q.images.join(', ')}`
                    }
                  >
                    🖼 {q.images.length}{missing.length > 0 ? ` (${missing.length} missing)` : ''}
                  </span>
                {/if}
                <button
                  class="link sol-toggle"
                  onclick={() => { if (!q.solution) q.solution = ' '; else q.solution = ''; }}
                  title={q.solution ? 'Remove explanation' : 'Add explanation'}
                >
                  {q.solution ? '− explanation' : '+ explanation'}
                </button>
              </div>

              {#if q.choices && Object.keys(q.choices).length >= 2}
                <div class="q-choices">
                  <span class="label">Choices <span class="hint">(click ○ to mark the correct answer)</span></span>
                  {#each Object.keys(q.choices).sort() as letter}
                    <label class="q-choice-row">
                      <input
                        type="radio"
                        name="ans-{i}"
                        checked={q.answer === letter}
                        onchange={() => { q.answer = letter; scheduleRecompile(i); }}
                        title="Mark {letter} as correct"
                      />
                      <span class="q-choice-letter">{letter}</span>
                      <textarea
                        bind:value={q.choices[letter]}
                        use:autoresize
                        oninput={() => scheduleRecompile(i)}
                        class="q-choice-input"
                        placeholder="Choice {letter}"
                        spellcheck="false"
                        rows={1}
                      ></textarea>
                    </label>
                  {/each}
                  {#if q.answer}
                    <button
                      class="link clear-ans"
                      onclick={() => { q.answer = ''; scheduleRecompile(i); }}
                      title="Clear the marked correct answer"
                    >clear correct answer</button>
                  {/if}
                </div>
              {/if}

              {#if cardLabel(q)}
                <div class="q-assignment-badge">{cardLabel(q)}</div>
              {/if}

              {#if q.solution !== ''}
                <label class="q-sol-label">
                  <span class="label">Solution <span class="hint">(optional)</span></span>
                  <textarea
                    class="q-body q-sol"
                    bind:value={q.solution}
                    use:autoresize
                    oninput={() => scheduleRecompile(i)}
                    rows={2}
                    spellcheck="false"
                    placeholder="Written solution (optional)"
                  ></textarea>
                </label>
              {/if}

            </div>

            <div class="q-preview-col" class:preview-dark={previewTheme === 'dark'} class:is-compiling={qPreviews[i]?.compiling}>
              {#if qPreviews[i]?.svg}
                {@html qPreviews[i].svg}
              {:else if qPreviews[i]?.error}
                <pre class="q-preview-error">{qPreviews[i].error}</pre>
              {:else if qPreviews[i]?.compiling}
                <span class="q-preview-loading">…</span>
              {/if}
            </div>

            <button class="ghost remove-btn" onclick={() => removeQuestion(i)} title="Remove">✕</button>
          </div>
        {/each}

        {#if questions.length === 0}
          <div class="empty-list">All questions removed.</div>
        {/if}
      </div>

    </div>

    <footer>
      <button onclick={goBack} title="Return to the paste step">← Back</button>
      <button
        onclick={() => { rawText = ''; importSourceName = ''; appendMode = true; stage = 1; }}
        title="Paste another batch of questions and append them to the queue"
      >＋ Add more</button>
      <button
        class="danger-ghost"
        disabled={selectedCount === 0}
        onclick={removeSelected}
        title="Remove the selected questions from the import list"
      >
        Remove {selectedCount > 0 ? `(${selectedCount})` : 'selected'}
      </button>
      <span class="spacer"></span>
      {#if importWarning}
        <span class="import-warning">
          ⚠ {importWarning}
          <button class="link" onclick={() => doImport(true)} title="Import anyway, ignoring the warning">Yes, import</button>
          <button class="link" onclick={() => importWarning = ''} title="Go back and review">Cancel</button>
        </span>
      {:else}
        <button
          class="primary"
          disabled={selectedCount === 0}
          onclick={() => doImport()}
          title="Add {selectedCount} checked question{selectedCount !== 1 ? 's' : ''} to the bank — uncheck questions to skip them"
        >
          Import ({selectedCount}) →
        </button>
      {/if}
    </footer>

  </div>
</div>
{/if}

<style>
  /* ── Shared overlay ─────────────────────────────────────────────────── */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }

  .modal {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 2rem);
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 1.25rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }

  header h2 {
    font-size: 15px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .step-badge {
    font-size: 11px;
    font-weight: 500;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    border-radius: 4px;
    padding: 0.1rem 0.45rem;
  }

  .count-badge {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-2);
    background: var(--bg-3);
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
  }

  .header-hint {
    font-size: 11px;
    color: var(--text-2);
    white-space: nowrap;
  }

  footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .spacer { flex: 1; }

  .import-warning {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 13px;
    color: #e07b30;
  }

  /* ── Stage 1 ────────────────────────────────────────────────────────── */
  .stage1-modal {
    width: 860px;
    max-width: 100%;
  }

  .stage1-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .draft-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: color-mix(in srgb, var(--primary) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
    border-radius: var(--radius);
    padding: 0.5rem 0.75rem;
    font-size: 13px;
    flex-shrink: 0;
  }

  .draft-banner span { flex: 1; }

  .controls-row {
    display: flex;
    align-items: flex-end;
    gap: 1rem;
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .control-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .drop-zone {
    flex: 1;
    min-height: 0;
    position: relative;
    border: 1.5px dashed var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .drop-zone.drag-over {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 6%, transparent);
  }

  .import-file-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .import-file-row input[type='file'] {
    max-width: 100%;
    color: var(--text-2);
  }

  .paste-area {
    flex: 1;
    min-height: 320px;
    resize: none;
    border: none;
    background: var(--bg-2);
    font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
    font-size: 12.5px;
    line-height: 1.6;
    padding: 0.75rem 1rem;
    color: var(--text);
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .drag-message {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--primary) 8%, transparent);
    font-size: 15px;
    font-weight: 500;
    color: var(--primary);
    pointer-events: none;
  }

  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    font-size: 12.5px;
    flex-shrink: 0;
    padding: 0.1rem 0;
  }

  .hint-text {
    font-size: 11.5px;
    color: var(--text-2);
    white-space: nowrap;
  }

  .hint-text code {
    font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
    font-size: 11px;
    background: var(--bg-3);
    border-radius: 3px;
    padding: 0.05rem 0.3rem;
  }

  .import-error {
    font-size: 12.5px;
    color: var(--danger);
    margin: 0;
  }

  .muted  { color: var(--text-2); }
  .warn   { color: var(--danger); }
  .ok     { color: var(--text-2); }
  .ok strong { color: var(--text); }

  /* ── Stage 2 (image upload) ─────────────────────────────────────────── */
  .stage-images-modal {
    width: 680px;
    max-width: 100%;
  }

  .stage-images-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem 1.25rem;
    overflow-y: auto;
  }

  .stage-intro {
    margin: 0;
    font-size: 13px;
    color: var(--text-2);
    line-height: 1.5;
  }

  .stage-intro strong { color: var(--text); }

  .image-drop-zone {
    min-height: 180px;
    border: 1.5px dashed var(--border);
    border-radius: var(--radius);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.25rem;
    text-align: center;
    transition: border-color 0.1s, background 0.1s;
  }

  .image-drop-zone.drag-over {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 6%, transparent);
  }

  .drop-zone-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .drop-zone-title {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
  }

  .drop-zone-sub {
    margin: 0;
    font-size: 12px;
    color: var(--text-2);
  }

  .drop-zone-hint {
    margin: 0.2rem 0 0;
    font-size: 11.5px;
    color: var(--text-2);
  }

  .drop-zone-hint code {
    font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
    font-size: 10.5px;
    background: var(--bg-3);
    border-radius: 3px;
    padding: 0.05rem 0.25rem;
  }

  .auto-rename-control {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    max-width: 100%;
    min-width: 0;
    margin-top: 0.25rem;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    line-height: 1.35;
    text-align: left;
  }

  .auto-rename-control input {
    width: auto;
    min-width: 14px;
    flex-shrink: 0;
    accent-color: var(--primary);
  }

  .auto-rename-control label {
    cursor: pointer;
    flex: 1;
    min-width: 0;
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .auto-rename-control.compact {
    align-items: flex-start;
    width: 100%;
    box-sizing: border-box;
    margin-top: 0;
    color: var(--text-2);
    font-size: 11.5px;
  }

  .image-status-panel {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem 0.9rem;
    background: var(--bg-2);
  }

  .image-status-header {
    display: flex;
    justify-content: space-between;
    font-size: 11.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-2);
    margin-bottom: 0.4rem;
  }

  .image-status-header .muted {
    text-transform: none;
    letter-spacing: normal;
    font-weight: 400;
  }

  .stage-image-list {
    max-height: 260px;
    font-size: 12.5px;
  }

  .skip-hint {
    font-size: 12px;
    color: var(--text-2);
    margin-right: 0.5rem;
  }

  /* ── Stage 3 ────────────────────────────────────────────────────────── */
  .stage2-modal {
    width: min(1200px, 100%);
    height: calc(100vh - 2rem);
  }

  .stage2-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* Sidebar */
  .sidebar {
    width: 230px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    overflow-y: auto;
  }

  .sidebar-heading {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-2);
    margin: 0;
  }

  .sidebar-field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .sidebar-field select {
    font-size: 12px;
    width: 100%;
  }

  .full-width { width: 100%; }

  .select-links {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 12px;
    color: var(--text-2);
  }

  /* Question list */
  .question-list {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .q-card {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    cursor: pointer;
    transition: border-color 0.1s;
  }

  .q-card.focused {
    border-color: var(--primary);
    outline: 2px solid color-mix(in srgb, var(--primary) 25%, transparent);
    outline-offset: -1px;
  }

  .q-card.checked {
    background: color-mix(in srgb, var(--primary) 5%, var(--bg));
  }

  .q-check {
    padding-top: 0.2rem;
    flex-shrink: 0;
  }

  .q-num {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-2);
    min-width: 1.5rem;
    padding-top: 0.25rem;
    flex-shrink: 0;
    text-align: right;
  }

  .q-fields {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    container-type: inline-size;
  }

  .q-body {
    width: 100%;
    box-sizing: border-box;
    font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
    font-size: 12px;
    line-height: 1.55;
    resize: none;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
    padding: 0.35rem 0.5rem;
    color: var(--text);
  }

  .q-meta-row {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
  }

  .q-meta-field {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .pts-input  { width: 4.5rem; }
  .tags-input { width: 100%; }

  .q-assignment-badge {
    display: inline-block;
    margin-top: 0.3rem;
    padding: 0.1rem 0.5rem;
    background: color-mix(in srgb, var(--primary) 15%, transparent);
    color: var(--primary);
    border: 1px solid color-mix(in srgb, var(--primary) 40%, transparent);
    border-radius: 100px;
    font-size: 11px;
    font-weight: 500;
  }

  .badge-mcq {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    border-radius: 3px;
    padding: 0.1rem 0.4rem;
    align-self: flex-end;
    margin-bottom: 0.2rem;
    white-space: nowrap;
  }

  .badge-img {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 600;
    color: var(--text-2);
    background: var(--bg-3);
    border-radius: 3px;
    padding: 0.1rem 0.4rem;
    align-self: flex-end;
    margin-bottom: 0.2rem;
    white-space: nowrap;
  }

  .badge-img-missing {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
  }

  .images-section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding-bottom: 0.75rem;
    margin-bottom: 0.25rem;
    border-bottom: 1px solid var(--border);
  }

  .metadata-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.65rem;
    margin-bottom: 0.75rem;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .metadata-card .sidebar-heading {
    margin: 0;
  }

  .metadata-summary {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 11.5px;
    line-height: 1.35;
    color: var(--text-2);
  }

  .metadata-summary strong {
    color: var(--text);
    font-weight: 600;
  }

  .metadata-inputs {
    display: grid;
    gap: 0.45rem;
  }

  .metadata-inputs label {
    display: grid;
    gap: 0.2rem;
  }

  .metadata-inputs span {
    color: var(--text-2);
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .images-count {
    float: right;
    font-weight: 400;
    text-transform: none;
    letter-spacing: normal;
  }

  .image-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    max-height: 180px;
    overflow-y: auto;
    font-size: 12px;
  }

  .image-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.15rem 0.25rem;
    border-radius: 3px;
  }

  .image-row.missing {
    background: color-mix(in srgb, var(--danger) 8%, transparent);
  }

  .img-status {
    flex-shrink: 0;
    width: 0.9rem;
    font-weight: 700;
    font-size: 11px;
    text-align: center;
    color: var(--primary);
  }

  .image-row.missing .img-status {
    color: var(--danger);
  }

  .img-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
    font-size: 11.5px;
  }

  button.tiny {
    font-size: 10px;
    padding: 0.05rem 0.3rem;
    line-height: 1;
    color: var(--text-2);
  }

  .image-message {
    font-size: 11.5px;
    color: var(--text-2);
    margin: 0;
  }

  .image-hint {
    font-size: 11px;
    color: var(--text-2);
    line-height: 1.4;
    margin: 0;
  }

  .image-hint code {
    font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
    font-size: 10.5px;
    background: var(--bg-3);
    border-radius: 3px;
    padding: 0.05rem 0.25rem;
  }

  .sol-toggle {
    flex-shrink: 0;
    font-size: 11px;
    align-self: flex-end;
    padding-bottom: 0.2rem;
  }

  .q-sol-label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .q-sol { opacity: 0.85; }

  .q-choices {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.35rem 0.55rem;
    margin-top: 0.1rem;
  }

  @container (max-width: 48rem) {
    .q-choices {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (max-width: 28rem) {
    .q-choices {
      grid-template-columns: 1fr;
    }
  }

  .q-choice-row {
    display: grid;
    grid-template-columns: 1rem 1.15rem minmax(0, 1fr);
    align-items: start;
    gap: 0.45rem;
    width: 100%;
    min-width: 0;
    padding: 0.1rem 0;
    align-self: start;
  }

  .q-choice-row input[type='radio'] {
    margin: 0;
    justify-self: center;
    margin-top: 0.28rem;
  }

  .q-choice-letter {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-2);
    width: 100%;
    text-align: center;
    padding-top: 0.2rem;
  }

  .q-choice-input {
    width: 100%;
    min-width: 0;
    font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
    font-size: 11.5px;
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
    color: var(--text);
    resize: none;
    overflow: hidden;
    line-height: 1.25;
    height: auto;
    min-height: calc(1.25em + 0.4rem + 2px);
  }

  .clear-ans {
    align-self: flex-start;
    font-size: 11px;
    margin-top: 0.1rem;
  }

  .hint { color: var(--text-2); font-weight: 400; }

  .remove-btn {
    flex-shrink: 0;
    font-size: 11px;
    padding: 0.2rem 0.4rem;
    color: var(--text-2);
    align-self: flex-start;
    margin-top: 0.1rem;
  }

  .empty-list {
    padding: 3rem;
    text-align: center;
    color: var(--text-2);
    font-size: 13px;
  }

  /* ── In-card preview column ─────────────────────────────────────────── */
  .theme-toggle {
    font-size: 11px;
    font-weight: 400;
    padding: 0.15rem 0.4rem;
    color: var(--text-2);
  }

  .q-preview-col {
    width: 260px;
    flex-shrink: 0;
    border-left: 1px solid var(--border);
    background: white;
    transition: opacity 0.15s;
    overflow: hidden;
  }

  .q-preview-col.preview-dark { background: #1c1c1e; }
  .q-preview-col.is-compiling { opacity: 0.45; }

  .q-preview-col :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }

  .q-preview-loading {
    display: block;
    color: var(--text-2);
    font-size: 11px;
    padding: 0.25rem 0;
  }

  .q-preview-error {
    font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
    font-size: 10px;
    color: var(--danger);
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
  }

  /* ── Misc shared ────────────────────────────────────────────────────── */
  .label {
    display: block;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-2);
  }

  .link {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--primary);
    font-size: 12px;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .link:hover { color: var(--primary-hover); }

  button.small { font-size: 11px; padding: 0.15rem 0.4rem; }

  .danger-ghost {
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.3rem 0.75rem;
    font-size: 13px;
    cursor: pointer;
    color: var(--danger);
  }

  .danger-ghost:hover:not(:disabled) { background: color-mix(in srgb, var(--danger) 8%, transparent); }
  .danger-ghost:disabled { opacity: 0.4; cursor: default; }

  .new-class-row {
    display: flex;
    gap: 0.3rem;
    align-items: center;
    margin-top: 0.3rem;
  }

  .new-class-input {
    flex: 1;
    font-size: 12px;
    min-width: 0;
  }

  /* ── Re-convert / show-original ─────────────────────────────────────────── */

  button.ghost.small.active {
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    color: var(--primary);
    border-color: color-mix(in srgb, var(--primary) 35%, transparent);
  }

  .q-original {
    margin-bottom: 0.4rem;
    border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    border-radius: 5px;
    overflow: hidden;
  }

  .q-original-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-2);
    padding: 0.25rem 0.5rem;
    background: color-mix(in srgb, var(--bg-2) 60%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  }

  .reconvert-one {
    font-size: 10px;
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
    margin-left: auto;
    color: var(--primary);
    opacity: 0.75;
  }
  .reconvert-one:hover { opacity: 1; }

  .q-original-pre {
    margin: 0;
    padding: 0.4rem 0.5rem;
    font-size: 11px;
    line-height: 1.5;
    font-family: monospace;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--text-2);
    background: var(--bg);
    max-height: 140px;
    overflow-y: auto;
  }
</style>
