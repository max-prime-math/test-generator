import { fuzzyScoreMulti } from './fuzzy.ts';
import {
  effectiveAnswer,
  MCQ_CHOICE_LABELS,
  mcqChoiceLabelsForQuestion,
  sortQuestions,
} from './mcq.ts';
import type {
  BubbleChoice,
  BubbleSheetMetadata,
  BubbleSheetQuestionMetadata,
  BubbleSheetStudentCode,
  GradebookQuestionScore,
  GradebookStudent,
  Question,
  TestConfig,
} from './types';

export const DEFAULT_FORM_CODE_LENGTH = 6;
export const DEFAULT_STUDENT_CODE_LENGTH = 6;
export const BUBBLE_RADIUS_IN = 0.055;
export const REGISTRATION_MARKER_SIZE_IN = 0.16;

const BUBBLE_CHOICES = MCQ_CHOICE_LABELS as readonly BubbleChoice[];
const PAPER_SIZES_IN: Record<string, { width: number; height: number }> = {
  'us-letter': { width: 8.5, height: 11 },
  'us-legal': { width: 8.5, height: 14 },
  'us-ledger': { width: 11, height: 17 },
  a3: { width: 11.69, height: 16.54 },
  a4: { width: 8.27, height: 11.69 },
  a5: { width: 5.83, height: 8.27 },
  b4: { width: 9.84, height: 13.9 },
  b5: { width: 6.93, height: 9.84 },
};

export type BubbleSheetWarningCode =
  | 'blank'
  | 'ambiguous'
  | 'multiple-mark'
  | 'low-confidence'
  | 'unmatched-student'
  | 'form-mismatch'
  | 'filename-fuzzy-match'
  | 'registration'
  | 'existing-score'
  | 'unresolved-answer';

export type BubbleSheetMarkStatus = 'valid' | 'blank' | 'ambiguous' | 'multiple-mark';
export type BubbleSheetStudentMatchMethod = 'student-code' | 'filename-fuzzy' | 'manual' | 'none';

export interface BubblePoint {
  x: number;
  y: number;
}

export interface BubbleGridColumn {
  label: string;
  bubbles: BubblePoint[];
}

export interface BubbleSheetQuestionLayout {
  questionId: string;
  label: string;
  labelPosition: BubblePoint;
  bubbles: Array<{ choice: BubbleChoice; center: BubblePoint }>;
}

export interface BubbleSheetLayout {
  page: { width: number; height: number };
  markerSizeIn: number;
  bubbleRadiusIn: number;
  markers: {
    topLeft: BubblePoint;
    topRight: BubblePoint;
    bottomLeft: BubblePoint;
  };
  formCode: BubbleGridColumn[];
  studentCode: BubbleGridColumn[];
  questions: BubbleSheetQuestionLayout[];
}

export interface BubbleSheetMarkDecision {
  selectedIndex: number | null;
  status: BubbleSheetMarkStatus;
  confidence: number;
  scores: number[];
  warnings: BubbleSheetWarningCode[];
}

export interface BubbleSheetDetectedAnswer {
  questionId: string;
  label: string;
  selectedChoice: BubbleChoice | null;
  status: BubbleSheetMarkStatus;
  confidence: number;
  score: number | null;
  fillScores: Partial<Record<BubbleChoice, number>>;
  warnings: BubbleSheetWarningCode[];
}

export interface BubbleSheetScanResult {
  id: string;
  fileName: string;
  formCode: string | null;
  studentCode: string | null;
  matchedStudentId: string | null;
  matchMethod: BubbleSheetStudentMatchMethod;
  confidence: number;
  warnings: BubbleSheetWarningCode[];
  answers: BubbleSheetDetectedAnswer[];
}

export interface BubbleSheetScoreUpdate {
  questionId: string;
  label: string;
  points: number;
  selectedChoice: BubbleChoice | null;
}

export interface BubbleSheetScoreSkip {
  questionId: string;
  label: string;
  reason: BubbleSheetWarningCode;
  message: string;
}

export interface BubbleSheetScorePlan {
  updates: BubbleSheetScoreUpdate[];
  skipped: BubbleSheetScoreSkip[];
}

export function createBubbleSheetMetadata(input: {
  config: TestConfig;
  questions: Question[];
  formId?: string;
  now?: number;
  students?: GradebookStudent[];
}): BubbleSheetMetadata | null {
  const ordered = sortQuestions(input.questions, input.config);
  const questions: BubbleSheetQuestionMetadata[] = [];

  ordered.forEach((question, index) => {
    const answer = effectiveAnswer(question, input.config);
    if (!isBubbleChoice(answer)) return;
    const choices = mcqChoiceLabelsForQuestion(question, input.config)
      .filter((choice): choice is BubbleChoice => isBubbleChoice(choice));
    if (!choices.includes(answer)) return;
    questions.push({
      questionId: question.id,
      label: String(index + 1),
      order: index,
      points: Number.isFinite(question.points) ? question.points : 0,
      isBonus: input.config.bonusQuestionIds?.includes(question.id) ?? false,
      answer,
      choices,
    });
  });

  if (questions.length === 0) return null;

  const signature = bubbleSheetSignature(input.config, questions);
  const formId = input.formId?.trim() || `bubble-${numericCode(signature, 10)}`;
  const metadata: BubbleSheetMetadata = {
    version: 1,
    formId,
    formCode: numericCode(`${formId}:${signature}`, DEFAULT_FORM_CODE_LENGTH),
    formCodeLength: DEFAULT_FORM_CODE_LENGTH,
    studentCodeLength: DEFAULT_STUDENT_CODE_LENGTH,
    title: input.config.title || 'Test',
    subtitle: input.config.subtitle || '',
    paper: input.config.paper || 'us-letter',
    generatedAt: input.now ?? Date.now(),
    choiceLabels: [...BUBBLE_CHOICES],
    questions,
  };

  return input.students ? withBubbleSheetStudentCodes(metadata, input.students) : metadata;
}

export function normalizeBubbleSheetMetadata(value: unknown): BubbleSheetMetadata | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Partial<BubbleSheetMetadata>;
  const questions = Array.isArray(raw.questions)
    ? raw.questions
        .filter((question) =>
          question
          && typeof question === 'object'
          && typeof question.questionId === 'string'
          && isBubbleChoice((question as Partial<BubbleSheetQuestionMetadata>).answer)
        )
        .map((question, index) => {
          const item = question as Partial<BubbleSheetQuestionMetadata>;
          const answer = String(item.answer).toUpperCase() as BubbleChoice;
          const choices = Array.isArray(item.choices)
            ? item.choices.map((choice) => String(choice).toUpperCase()).filter((choice): choice is BubbleChoice => isBubbleChoice(choice))
            : [...BUBBLE_CHOICES];
          return {
            questionId: item.questionId!,
            label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : String(index + 1),
            order: typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : index,
            points: typeof item.points === 'number' && Number.isFinite(item.points) ? item.points : 0,
            isBonus: item.isBonus === true,
            answer,
            choices: choices.length >= 2 ? choices : [...BUBBLE_CHOICES],
          };
        })
    : [];

  if (questions.length === 0) return undefined;

  const formCodeLength = boundedCodeLength(raw.formCodeLength, DEFAULT_FORM_CODE_LENGTH);
  const studentCodeLength = boundedCodeLength(raw.studentCodeLength, DEFAULT_STUDENT_CODE_LENGTH);
  const formId = typeof raw.formId === 'string' && raw.formId.trim() ? raw.formId.trim() : `bubble-${numericCode(JSON.stringify(questions), 10)}`;
  const formCode = normalizeNumericCode(raw.formCode, formCodeLength) || numericCode(formId, formCodeLength);
  const studentCodes = normalizeStudentCodes(raw.studentCodes, studentCodeLength);

  return {
    version: 1,
    formId,
    formCode,
    formCodeLength,
    studentCodeLength,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Test',
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : '',
    paper: typeof raw.paper === 'string' && raw.paper.trim() ? raw.paper.trim() : 'us-letter',
    generatedAt: typeof raw.generatedAt === 'number' && Number.isFinite(raw.generatedAt) ? raw.generatedAt : Date.now(),
    choiceLabels: [...BUBBLE_CHOICES],
    questions,
    studentCodes: studentCodes.length ? studentCodes : undefined,
  };
}

export function withBubbleSheetStudentCodes(metadata: BubbleSheetMetadata, students: GradebookStudent[]): BubbleSheetMetadata {
  return {
    ...metadata,
    studentCodes: buildStudentCodes(students, metadata.studentCodeLength),
  };
}

export function buildStudentCodes(students: GradebookStudent[], length = DEFAULT_STUDENT_CODE_LENGTH): BubbleSheetStudentCode[] {
  const normalizedLength = boundedCodeLength(length, DEFAULT_STUDENT_CODE_LENGTH);
  const sorted = [...students].sort((left, right) => left.id.localeCompare(right.id));
  const sisCandidateCounts = new Map<string, number>();
  for (const student of sorted) {
    const candidate = normalizeNumericCode(student.sisId, normalizedLength);
    if (candidate) sisCandidateCounts.set(candidate, (sisCandidateCounts.get(candidate) ?? 0) + 1);
  }

  const used = new Set<string>();
  return sorted.map((student) => {
    const sisCandidate = normalizeNumericCode(student.sisId, normalizedLength);
    let code = sisCandidate && sisCandidateCounts.get(sisCandidate) === 1 ? sisCandidate : '';
    let attempt = 0;
    while (!code || used.has(code)) {
      code = numericCode(`${student.id}:${student.displayName}:${attempt}`, normalizedLength);
      attempt += 1;
    }
    used.add(code);
    return {
      studentId: student.id,
      code,
      displayName: student.displayName,
      sisId: student.sisId,
    };
  });
}

export function bubbleSheetPageSize(paper: string): { width: number; height: number } {
  return PAPER_SIZES_IN[paper] ?? PAPER_SIZES_IN['us-letter'];
}

export function bubbleSheetLayout(metadata: BubbleSheetMetadata, paper: string): BubbleSheetLayout {
  const page = bubbleSheetPageSize(paper);
  const point = (xIn: number, yIn: number): BubblePoint => ({
    x: xIn / page.width,
    y: yIn / page.height,
  });
  const columnsForCode = (xIn: number, yIn: number, length: number): BubbleGridColumn[] =>
    Array.from({ length }, (_, columnIndex) => ({
      label: String(columnIndex + 1),
      bubbles: Array.from({ length: 10 }, (_, digit) => point(xIn + columnIndex * 0.3, yIn + digit * 0.17)),
    }));

  const questionStartY = 4.12;
  const questionMaxY = page.height - 0.76;
  const questionColumns = [1.16, Math.min(page.width - 3.6, 4.88)].filter((x, index) => index === 0 || x > 3.8);
  const rowsPerColumn = Math.ceil(metadata.questions.length / questionColumns.length);
  const rowStep = rowsPerColumn <= 1
    ? 0.22
    : Math.min(0.22, Math.max(0.15, (questionMaxY - questionStartY) / (rowsPerColumn - 1)));

  const questions = metadata.questions.map((question, index) => {
    const column = Math.floor(index / rowsPerColumn);
    const row = index % rowsPerColumn;
    const xBase = questionColumns[column] ?? questionColumns[0];
    const y = questionStartY + row * rowStep;
    return {
      questionId: question.questionId,
      label: question.label,
      labelPosition: point(xBase - 0.44, y),
      bubbles: question.choices.map((choice, choiceIndex) => ({
        choice,
        center: point(xBase + choiceIndex * 0.34, y),
      })),
    };
  });

  return {
    page,
    markerSizeIn: REGISTRATION_MARKER_SIZE_IN,
    bubbleRadiusIn: BUBBLE_RADIUS_IN,
    markers: {
      topLeft: point(0.36, 0.36),
      topRight: point(page.width - 0.36, 0.36),
      bottomLeft: point(0.36, page.height - 0.36),
    },
    formCode: columnsForCode(1.16, 1.5, metadata.formCodeLength),
    studentCode: columnsForCode(Math.min(page.width - 3.7, 4.86), 1.5, metadata.studentCodeLength),
    questions,
  };
}

export async function analyzeBubbleSheetImage(
  file: File,
  metadata: BubbleSheetMetadata,
  students: GradebookStudent[] = [],
  paper = metadata.paper || 'us-letter',
): Promise<BubbleSheetScanResult> {
  const layout = bubbleSheetLayout(metadata, paper);
  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not read the uploaded image.');
  ctx.drawImage(image as CanvasImageSource, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const transform = locateRegistrationTransform(imageData, layout);

  const formRead = readDigitGrid(imageData, transform, layout, layout.formCode);
  const studentRead = readDigitGrid(imageData, transform, layout, layout.studentCode);
  const warnings: BubbleSheetWarningCode[] = [...transform.warnings];
  if (formRead.code && formRead.code !== metadata.formCode) warnings.push('form-mismatch');

  const answers = layout.questions.map((questionLayout) => {
    const question = metadata.questions.find((item) => item.questionId === questionLayout.questionId)!;
    const decision = chooseMarkedIndex(
      questionLayout.bubbles.map((bubble) => sampleBubble(imageData, transform, layout, bubble.center)),
    );
    const selectedChoice = decision.selectedIndex === null
      ? null
      : questionLayout.bubbles[decision.selectedIndex]?.choice ?? null;
    const fillScores: Partial<Record<BubbleChoice, number>> = {};
    questionLayout.bubbles.forEach((bubble, index) => {
      fillScores[bubble.choice] = decision.scores[index] ?? 0;
    });
    return {
      questionId: question.questionId,
      label: question.label,
      selectedChoice,
      status: decision.status,
      confidence: decision.confidence,
      score: decision.status === 'ambiguous' || decision.status === 'multiple-mark'
        ? null
        : scoreBubbleSheetChoice(question, selectedChoice),
      fillScores,
      warnings: decision.warnings,
    };
  });

  const studentCode = studentRead.code || null;
  let matchedStudentId: string | null = null;
  let matchMethod: BubbleSheetStudentMatchMethod = 'none';
  if (studentCode) {
    matchedStudentId = matchStudentByCode(metadata, students, studentCode);
    if (matchedStudentId) matchMethod = 'student-code';
  }
  if (!matchedStudentId) {
    const fallback = fuzzyMatchStudentFromFileName(file.name, students);
    if (fallback) {
      matchedStudentId = fallback.studentId;
      matchMethod = 'filename-fuzzy';
      warnings.push('filename-fuzzy-match');
    } else {
      warnings.push('unmatched-student');
    }
  }

  const confidenceValues = [
    formRead.confidence,
    studentRead.confidence,
    ...answers.map((answer) => answer.confidence),
  ].filter((value) => Number.isFinite(value));

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    fileName: file.name,
    formCode: formRead.code || null,
    studentCode,
    matchedStudentId,
    matchMethod,
    confidence: confidenceValues.length
      ? Math.min(...confidenceValues)
      : 0,
    warnings: uniqueWarnings(warnings),
    answers,
  };
}

export function scoreBubbleSheetChoice(question: BubbleSheetQuestionMetadata, choice: BubbleChoice | null): number | null {
  if (choice === null) return 0;
  if (!question.choices.includes(choice)) return null;
  return choice === question.answer ? question.points : 0;
}

export function planBubbleSheetScoreUpdates(
  metadata: BubbleSheetMetadata,
  answers: BubbleSheetDetectedAnswer[],
  existingScores: GradebookQuestionScore[] = [],
): BubbleSheetScorePlan {
  const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  const existingByQuestion = new Map(existingScores.map((score) => [score.questionId, score]));
  const updates: BubbleSheetScoreUpdate[] = [];
  const skipped: BubbleSheetScoreSkip[] = [];

  for (const question of metadata.questions) {
    const existing = existingByQuestion.get(question.questionId);
    if (existing && existing.points !== null && existing.points !== undefined) {
      skipped.push({
        questionId: question.questionId,
        label: question.label,
        reason: 'existing-score',
        message: `Q${question.label} already has a score.`,
      });
      continue;
    }

    const answer = answerByQuestion.get(question.questionId);
    if (!answer || answer.score === null) {
      skipped.push({
        questionId: question.questionId,
        label: question.label,
        reason: 'unresolved-answer',
        message: `Q${question.label} needs review before it can be applied.`,
      });
      continue;
    }

    updates.push({
      questionId: question.questionId,
      label: question.label,
      points: answer.score,
      selectedChoice: answer.selectedChoice,
    });
  }

  return { updates, skipped };
}

export function bubbleWarningLabel(warning: BubbleSheetWarningCode): string {
  switch (warning) {
    case 'blank': return 'blank';
    case 'ambiguous': return 'ambiguous';
    case 'multiple-mark': return 'multiple marks';
    case 'low-confidence': return 'low confidence';
    case 'unmatched-student': return 'unmatched student';
    case 'form-mismatch': return 'form mismatch';
    case 'filename-fuzzy-match': return 'filename match needs review';
    case 'registration': return 'registration fallback';
    case 'existing-score': return 'existing score';
    case 'unresolved-answer': return 'needs review';
  }
}

function bubbleSheetSignature(config: TestConfig, questions: BubbleSheetQuestionMetadata[]): string {
  return JSON.stringify({
    title: config.title,
    subtitle: config.subtitle,
    selectedIds: config.selectedIds,
    mcq: questions.map((question) => ({
      id: question.questionId,
      label: question.label,
      answer: question.answer,
      choices: question.choices,
      points: question.points,
      bonus: question.isBonus,
    })),
  });
}

function isBubbleChoice(value: unknown): value is BubbleChoice {
  return typeof value === 'string' && (BUBBLE_CHOICES as readonly string[]).includes(value.toUpperCase());
}

function boundedCodeLength(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 4 && parsed <= 10 ? parsed : fallback;
}

function normalizeNumericCode(value: unknown, length: number): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return digits.length >= length ? digits.slice(-length) : digits.padStart(length, '0');
}

function normalizeStudentCodes(value: unknown, length: number): BubbleSheetStudentCode[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const codes: BubbleSheetStudentCode[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Partial<BubbleSheetStudentCode>;
    if (typeof raw.studentId !== 'string') continue;
    const code = normalizeNumericCode(raw.code, length);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push({
      studentId: raw.studentId,
      code,
      displayName: typeof raw.displayName === 'string' ? raw.displayName : raw.studentId,
      sisId: typeof raw.sisId === 'string' ? raw.sisId : undefined,
    });
  }
  return codes;
}

function numericCode(input: string, length: number): string {
  const modulo = 10 ** length;
  return String(stableHash(input) % modulo).padStart(length, '0');
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function uniqueWarnings(warnings: BubbleSheetWarningCode[]): BubbleSheetWarningCode[] {
  return [...new Set(warnings)];
}

async function loadImage(file: File): Promise<HTMLImageElement | ImageBitmap> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to HTMLImageElement for browser formats createImageBitmap rejects.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface BubbleTransform {
  origin: { x: number; y: number };
  xAxis: { x: number; y: number };
  yAxis: { x: number; y: number };
  warnings: BubbleSheetWarningCode[];
}

function locateRegistrationTransform(imageData: ImageData, layout: BubbleSheetLayout): BubbleTransform {
  const identity: BubbleTransform = {
    origin: { x: 0, y: 0 },
    xAxis: { x: imageData.width, y: 0 },
    yAxis: { x: 0, y: imageData.height },
    warnings: [],
  };

  const topLeft = findMarker(imageData, layout.markers.topLeft);
  const topRight = findMarker(imageData, layout.markers.topRight);
  const bottomLeft = findMarker(imageData, layout.markers.bottomLeft);
  if (!topLeft || !topRight || !bottomLeft) {
    return { ...identity, warnings: ['registration'] };
  }

  const dxNorm = layout.markers.topRight.x - layout.markers.topLeft.x;
  const dyNorm = layout.markers.bottomLeft.y - layout.markers.topLeft.y;
  return {
    origin: {
      x: topLeft.x - ((topRight.x - topLeft.x) / dxNorm) * layout.markers.topLeft.x,
      y: topLeft.y - ((bottomLeft.y - topLeft.y) / dyNorm) * layout.markers.topLeft.y,
    },
    xAxis: {
      x: (topRight.x - topLeft.x) / dxNorm,
      y: (topRight.y - topLeft.y) / dxNorm,
    },
    yAxis: {
      x: (bottomLeft.x - topLeft.x) / dyNorm,
      y: (bottomLeft.y - topLeft.y) / dyNorm,
    },
    warnings: [],
  };
}

function findMarker(imageData: ImageData, expected: BubblePoint): { x: number; y: number } | null {
  const cx = expected.x * imageData.width;
  const cy = expected.y * imageData.height;
  const radius = Math.max(18, Math.min(imageData.width, imageData.height) * 0.04);
  let total = 0;
  let sumX = 0;
  let sumY = 0;
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(imageData.width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(imageData.height - 1, Math.ceil(cy + radius));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const lum = luminanceAt(imageData, x, y);
      if (lum > 70) continue;
      total += 1;
      sumX += x;
      sumY += y;
    }
  }
  if (total < 20) return null;
  return { x: sumX / total, y: sumY / total };
}

function mapPoint(transform: BubbleTransform, point: BubblePoint): { x: number; y: number } {
  return {
    x: transform.origin.x + transform.xAxis.x * point.x + transform.yAxis.x * point.y,
    y: transform.origin.y + transform.xAxis.y * point.x + transform.yAxis.y * point.y,
  };
}

function pxPerIn(transform: BubbleTransform, layout: BubbleSheetLayout): number {
  const xLength = Math.hypot(transform.xAxis.x, transform.xAxis.y) / layout.page.width;
  const yLength = Math.hypot(transform.yAxis.x, transform.yAxis.y) / layout.page.height;
  return (xLength + yLength) / 2;
}

function sampleBubble(imageData: ImageData, transform: BubbleTransform, layout: BubbleSheetLayout, point: BubblePoint): number {
  const center = mapPoint(transform, point);
  const radius = Math.max(3, layout.bubbleRadiusIn * pxPerIn(transform, layout) * 0.62);
  let darkPixels = 0;
  let totalPixels = 0;
  const minX = Math.max(0, Math.floor(center.x - radius));
  const maxX = Math.min(imageData.width - 1, Math.ceil(center.x + radius));
  const minY = Math.max(0, Math.floor(center.y - radius));
  const maxY = Math.min(imageData.height - 1, Math.ceil(center.y + radius));
  const radiusSq = radius * radius;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - center.x;
      const dy = y - center.y;
      if (dx * dx + dy * dy > radiusSq) continue;
      totalPixels += 1;
      if (luminanceAt(imageData, x, y) < 155) darkPixels += 1;
    }
  }
  return totalPixels > 0 ? darkPixels / totalPixels : 0;
}

function luminanceAt(imageData: ImageData, x: number, y: number): number {
  const offset = (y * imageData.width + x) * 4;
  const data = imageData.data;
  return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
}

function chooseMarkedIndex(scores: number[]): BubbleSheetMarkDecision {
  const ranked = scores
    .map((score, index) => ({ score, index }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0]?.score ?? 0;
  const second = ranked[1]?.score ?? 0;
  const marked = ranked.filter((entry) => entry.score >= 0.24);
  const warnings: BubbleSheetWarningCode[] = [];

  if (best < 0.2) {
    return {
      selectedIndex: null,
      status: 'blank',
      confidence: Math.max(0, 1 - best / 0.2),
      scores,
      warnings: ['blank'],
    };
  }

  if (marked.length > 1 && second >= 0.22) {
    return {
      selectedIndex: null,
      status: 'multiple-mark',
      confidence: Math.max(0, Math.min(1, (best - second) / 0.25)),
      scores,
      warnings: ['multiple-mark'],
    };
  }

  if (best - second < 0.08) {
    return {
      selectedIndex: null,
      status: 'ambiguous',
      confidence: Math.max(0, Math.min(1, (best - second) / 0.08)),
      scores,
      warnings: ['ambiguous'],
    };
  }

  if (best < 0.32) warnings.push('low-confidence');
  return {
    selectedIndex: ranked[0].index,
    status: 'valid',
    confidence: Math.max(0, Math.min(1, (best - second) / 0.35)),
    scores,
    warnings,
  };
}

function readDigitGrid(
  imageData: ImageData,
  transform: BubbleTransform,
  layout: BubbleSheetLayout,
  columns: BubbleGridColumn[],
): { code: string; confidence: number; warnings: BubbleSheetWarningCode[] } {
  let code = '';
  const confidences: number[] = [];
  const warnings: BubbleSheetWarningCode[] = [];
  for (const column of columns) {
    const decision = chooseMarkedIndex(column.bubbles.map((bubble) => sampleBubble(imageData, transform, layout, bubble)));
    warnings.push(...decision.warnings);
    confidences.push(decision.confidence);
    code += decision.selectedIndex === null ? '' : String(decision.selectedIndex);
  }
  const allBlank = code.length === 0;
  const partial = code.length > 0 && code.length < columns.length;
  return {
    code: allBlank ? '' : code.padStart(columns.length, '0'),
    confidence: confidences.length ? Math.min(...confidences) : 0,
    warnings: uniqueWarnings(partial ? [...warnings, 'blank'] : warnings),
  };
}

function matchStudentByCode(metadata: BubbleSheetMetadata, students: GradebookStudent[], code: string): string | null {
  const rosterMatch = metadata.studentCodes?.find((entry) => entry.code === code);
  if (rosterMatch) return rosterMatch.studentId;

  const directSisMatch = students.find((student) => normalizeNumericCode(student.sisId, metadata.studentCodeLength) === code);
  return directSisMatch?.id ?? null;
}

function fuzzyMatchStudentFromFileName(fileName: string, students: GradebookStudent[]): { studentId: string; score: number } | null {
  const query = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  if (!query) return null;
  const scored = students
    .map((student) => ({
      studentId: student.id,
      score: fuzzyScoreMulti(query, [
        { text: student.displayName, weight: 2 },
        { text: `${student.lastName} ${student.firstName}`, weight: 1.5 },
        { text: student.sisId ?? '', weight: 1 },
        { text: student.email ?? '', weight: 1 },
      ]),
    }))
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < 8) return null;
  if (second && best.score - second.score < 2) return null;
  return best;
}
