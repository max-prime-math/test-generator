<!--
  Two-stage bulk import modal.
  Stage 1: paste / drag-drop text, choose format + split strategy.
  Stage 2: review/edit each parsed question, bulk-assign curriculum, then import.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { CLASSES, DEMO_CLASSES } from '../lib/curriculum';
  import { appState } from '../lib/app-state.svelte';
  import { customClasses } from '../lib/custom-classes.svelte';
  import { latexToTypst, detectFormat, extractImageNames } from '../lib/latex-to-typst';
  import { stripLeadingAnswerLabel } from '../lib/ingest-helpers';
  import { compileSvg } from '../lib/typst/compiler';
  import { formatBody } from '../lib/question-format';
  import type { DraftQuestion } from '../lib/types';
  import { imageStore, isSupportedExt, splitFilename } from '../lib/image-store.svelte';
  import { scanImageRefs } from '../lib/typst/image-shadow';

  interface Props {
    onclose: () => void;
    onimport: (questions: DraftQuestion[]) => void;
  }

  let { onclose, onimport }: Props = $props();

  const DRAFT_KEY = 'ingest-draft';

  // ── Stage routing ─────────────────────────────────────────────────────────
  //   1 — paste
  //   2 — upload images  (only shown when drafts reference \includegraphics)
  //   3 — review & assign
  let stage = $state<1 | 2 | 3>(1);

  // ── Stage 1 state ─────────────────────────────────────────────────────────
  let rawText      = $state('');
  let format       = $state<'auto' | 'typst' | 'latex'>('auto');
  let splitBy      = $state<'question' | 'numbered' | 'delimiter' | 'blank'>('blank');
  let customDelim  = $state('---');
  let isDragOver   = $state(false);
  let hasDraft     = $state(!!sessionStorage.getItem(DRAFT_KEY));
  let isImageDragOver = $state(false);

  // ── Stage 2 state ─────────────────────────────────────────────────────────
  let questions    = $state<DraftQuestion[]>([]);
  let selected     = $state(new Set<number>());
  let focusedIdx   = $state(0);

  // Bulk-assign sidebar
  let bulkClassId   = $state((appState.demoMode ? [...CLASSES, ...DEMO_CLASSES] : CLASSES)[0]?.id ?? '');
  let bulkUnitId    = $state('');
  let bulkSectionId = $state('');
  let bulkPoints    = $state(5);
  let bulkTagInput  = $state('');

  let allClasses   = $derived(appState.demoMode ? [...CLASSES, ...DEMO_CLASSES, ...customClasses.classes] : [...CLASSES, ...customClasses.classes]);
  let bulkClass    = $derived(allClasses.find((c) => c.id === bulkClassId));
  let bulkUnits    = $derived(bulkClass?.units ?? []);
  let bulkUnit     = $derived(bulkUnits.find((u) => u.id === bulkUnitId));
  let bulkSections = $derived(bulkUnit?.sections ?? []);

  // ── New-class / unit / section inline forms ───────────────────────────────
  let addingClass    = $state(false);
  let newClassName   = $state('');
  let addingUnit     = $state(false);
  let newUnitName    = $state('');
  let addingSection  = $state(false);
  let newSectionName = $state('');

  let isCustomClass = $derived(customClasses.classes.some((c) => c.id === bulkClassId));

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
        l = l.replace(/^\s*\\begin\s*\{(?:choices|parts|solution)\}\s*$/i, '');
        l = l.replace(/^\s*\\end\s*\{(?:choices|parts|solution)\}\s*$/i, '');
        l = l.replace(/^\s*%.*$/, '');
        return l;
      })
      .join('\n');
  }

  function extractEnv(text: string, envName: string): { before: string; inner: string; after: string } | null {
    const beginRe = new RegExp(String.raw`\\begin\s*\{${envName}\}`, 'i');
    const endRe = new RegExp(String.raw`\\end\s*\{${envName}\}`, 'i');
    const begin = beginRe.exec(text);
    if (!begin) return null;
    const end = endRe.exec(text.slice(begin.index + begin[0].length));
    if (!end) return null;
    const before = text.slice(0, begin.index);
    const inner = text.slice(begin.index + begin[0].length, begin.index + begin[0].length + end.index);
    const after = text.slice(begin.index + begin[0].length + end.index + end[0].length);
    return { before, inner, after };
  }

  function parseParts(body: string): string {
    const env = extractEnv(body, 'parts');
    if (!env) return body;

    const chunks = env.inner
      .split(/\\part\b/)
      .map((s) => s.trim())
      .filter(Boolean);

    const labels = 'abcdefghijklmnopqrstuvwxyz';
    const parts = chunks.map((chunk, idx) => `*(${labels[idx] ?? String(idx + 1)})* ${chunk}`);
    return [env.before.trim(), parts.join('\n#linebreak()\n'), env.after.trim()].filter(Boolean).join('\n\n');
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

      const unitMatch = /^unit\s+(\d+)\s*:\s*(.+)$/i.exec(m[1]);
      if (unitMatch) {
        unitId = unitMatch[1];
        unitName = unitMatch[2].trim();
        continue;
      }

      const sectionMatch = /^section\s+(\d+(?:\.\d+)*)\s*:\s*(.+)$/i.exec(m[1]);
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
      const imageRefs = fmt === 'latex' ? extractImageNames(raw) : scanImageRefs(raw);
      const extracted = fmt === 'latex'
        ? extractCommentMetadata(raw)
        : { tags: '', unitId: '', unitName: '', sectionId: '', sectionName: '' };

      const { body: rawBody, solution: rawSolution } = parseSolution(raw);
      const bodyWithParts = fmt === 'latex' ? parseParts(rawBody) : rawBody;
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

      const draftAnswer   = solLetter || answer;  // prefer explicit letter, fallback to inline answer
      const draftSolution = solText ? await convert(solText) : '';

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
      };
    }));
  }

  // ── Draft persistence ─────────────────────────────────────────────────────

  function saveDraft(qs: DraftQuestion[]) {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(qs));
  }

  function restoreDraft() {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      questions  = JSON.parse(raw);
      selected   = new Set();
      focusedIdx = 0;
      stage      = 3;
      hasDraft   = false;
      initPreviews();
    } catch {
      sessionStorage.removeItem(DRAFT_KEY);
      hasDraft = false;
    }
  }

  function discardDraft() {
    sessionStorage.removeItem(DRAFT_KEY);
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
    questions  = await buildDraftQuestions(parsedPreview, detectedFormat);
    selected   = new Set(questions.map((_, i) => i));
    focusedIdx = 0;
    hasDraft   = false;
    sessionStorage.removeItem(DRAFT_KEY);

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

  function doImport(force = false) {
    const errorCount = qPreviews.filter((p) => p?.error).length;
    if (!force && errorCount > 0) {
      importWarning = `${errorCount} question${errorCount !== 1 ? 's have' : ' has'} a compile error. Import anyway?`;
      return;
    }
    importWarning = '';
    const valid = questions
      .filter((q) => q.body.trim())
      .map((q) => ({
        ...q,
        classId:   q.classId   || bulkClassId,
        unitId:    q.unitId    || bulkUnitId,
        sectionId: q.sectionId || bulkSectionId,
      }));
    onimport(valid);
    sessionStorage.removeItem(DRAFT_KEY);
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
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { rawText = (ev.target?.result as string) ?? ''; };
    reader.readAsText(file);
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

  // ── Per-question preview ──────────────────────────────────────────────────

  interface QPreview { svg: string | null; error: string; compiling: boolean; }

  let qPreviews  = $state<QPreview[]>([]);
  let qTimers: Array<ReturnType<typeof setTimeout> | undefined> = [];
  let qVisible   = $state<boolean[]>([]);
  let qDirty     = $state<boolean[]>([]);
  let previewTheme = $state<'light' | 'dark'>('dark');

  function questionContent(i: number): string {
    const q    = questions[i];
    const body = q?.choices && Object.keys(q.choices).length >= 2
      ? formatBody(q.body, q.choices)
      : (q?.body ?? '');
    const parts = [body];
    if (q?.answer)   parts.push(`*Answer:* ${q.answer}`);
    if (q?.solution?.trim()) parts.push(`*Explanation:* ${q.solution.trim()}`);
    return parts.join('\n\n');
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

  // Counts for the Images section header.
  let missingImages = $derived(
    referencedImages.filter((n) => !imageStore.names.includes(n)),
  );

  // When a new image lands in storage, recompile questions that reference it.
  $effect(() => {
    const nameSet = new Set(imageStore.names);
    untrack(() => {
      for (let i = 0; i < questions.length; i++) {
        const refs = questions[i]?.images;
        if (refs?.some((n) => nameSet.has(n))) scheduleRecompile(i);
      }
    });
  });

  async function saveFile(file: File): Promise<{ matched: string | null }> {
    const { stem, ext } = splitFilename(file.name);
    if (!ext || !isSupportedExt(ext)) return { matched: null };
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Match to a referenced basename (case-insensitive) if one exists;
    // otherwise store under the file's own stem so later references work too.
    const refMatch = referencedImages.find((n) => n.toLowerCase() === stem.toLowerCase());
    const key = refMatch ?? stem;
    await imageStore.put(key, bytes, ext);
    return { matched: refMatch ?? null };
  }

  async function onUploadImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    let matched = 0;
    let saved   = 0;
    let skipped = 0;
    for (const file of Array.from(files)) {
      const { matched: m } = await saveFile(file);
      if (m !== null) { matched++; saved++; }
      else {
        const { ext } = splitFilename(file.name);
        if (ext && isSupportedExt(ext)) saved++;
        else skipped++;
      }
    }
    const parts: string[] = [];
    if (matched)             parts.push(`${matched} matched`);
    if (saved && !matched)   parts.push(`${saved} saved`);
    if (saved > matched)     parts.push(`${saved - matched} unmatched`);
    if (skipped)             parts.push(`${skipped} skipped (unsupported)`);
    imageMessage = parts.join(' · ') || 'No files processed';
    if (imageUploadInput) imageUploadInput.value = '';
  }

  async function removeImage(name: string) {
    if (!confirm(`Remove image "${name}" from browser storage?`)) return;
    await imageStore.remove(name);
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
        <span class="step-badge">Step 1 of {totalSteps}</span>
        <h2>Bulk Import</h2>
      </div>
      <button class="ghost" onclick={onclose} title="Close">✕</button>
    </header>

    <div class="stage1-body">

      {#if hasDraft}
        <div class="draft-banner">
          <span>You have an unsaved import draft.</span>
          <button class="ghost small" onclick={restoreDraft}>Restore</button>
          <button class="ghost small" onclick={discardDraft}>Discard</button>
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
          placeholder="Paste questions here, or drag and drop a .tex / .txt / .typ file…"
          bind:value={rawText}
          spellcheck="false"
        ></textarea>
        {#if isDragOver}
          <div class="drag-message">Drop file to load</div>
        {/if}
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
    </div>

    <footer>
      <button onclick={onclose}>Cancel</button>
      <button
        class="primary"
        disabled={parsedPreview.length === 0}
        onclick={continueFromPaste}
      >Continue →</button>
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
          >
            📂 Choose files…
          </button>
          <p class="drop-zone-hint">
            Supported: .png, .jpg, .jpeg, .svg, .webp, .gif, .pdf — match by filename.
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
            {@const stored = imageStore.names.includes(name)}
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
      <button onclick={goBack}>← Back</button>
      <span class="spacer"></span>
      {#if missingImages.length > 0}
        <span class="skip-hint">
          {missingImages.length} still missing — previews will show Typst errors for those.
        </span>
      {/if}
      <button class="primary" onclick={continueFromImages}>
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
                {@const stored = imageStore.names.includes(name)}
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
            >
              📂 Upload images…
            </button>
            {#if imageMessage}
              <p class="image-message">{imageMessage}</p>
            {/if}
            <p class="image-hint">
              Files are matched to LaTeX <code>\includegraphics</code> names by filename.
            </p>
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
              <button class="primary small" onclick={confirmNewClass} disabled={!newClassName.trim()}>Add</button>
              <button class="ghost small" onclick={() => { addingClass = false; }}>✕</button>
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
              <button class="primary small" onclick={confirmNewUnit} disabled={!newUnitName.trim()}>Add</button>
              <button class="ghost small" onclick={() => { addingUnit = false; }}>✕</button>
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
              <button class="primary small" onclick={confirmNewSection} disabled={!newSectionName.trim()}>Add</button>
              <button class="ghost small" onclick={() => { addingSection = false; }}>✕</button>
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
        >
          Apply to {selectedCount || 'selected'}
        </button>

        <div class="select-links">
          <button class="link" onclick={selectAll}>Select all</button>
          <span>·</span>
          <button class="link" onclick={deselectAll}>None</button>
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
              <textarea
                class="q-body"
                bind:value={q.body}
                use:autoresize
                oninput={() => scheduleRecompile(i)}
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
                  {@const missing = q.images.filter((n) => !imageStore.names.includes(n))}
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
      <button onclick={goBack}>← Back</button>
      <button
        class="danger-ghost"
        disabled={selectedCount === 0}
        onclick={removeSelected}
      >
        Remove {selectedCount > 0 ? `(${selectedCount})` : 'selected'}
      </button>
      <span class="spacer"></span>
      {#if importWarning}
        <span class="import-warning">
          ⚠ {importWarning}
          <button class="link" onclick={() => doImport(true)}>Yes, import</button>
          <button class="link" onclick={() => importWarning = ''}>Cancel</button>
        </span>
      {:else}
        <button
          class="primary"
          disabled={validCount === 0}
          onclick={() => doImport()}
        >
          Import {validCount} question{validCount !== 1 ? 's' : ''} →
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
</style>
