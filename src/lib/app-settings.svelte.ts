import { defaultTestConfig, type GraphDefaults, type PageNumberPlacement, type TestConfig } from './types';
import type { StudentNameOrder } from './gradebook-model';
import type { GradebookGradingMode } from './types';

const TEST_BUILDER_DEFAULTS_KEY = 'tg-test-builder-defaults-v1';
const GRADEBOOK_EXPERIMENTAL_KEY = 'tg-gradebook-experimental-enabled-v1';
const GRADEBOOK_NAME_ORDER_KEY = 'tg-gradebook-name-order-v1';
const GRADEBOOK_GRADING_MODE_KEY = 'tg-gradebook-grading-mode-v1';
const GENERATOR_EXPERIMENTAL_KEY = 'tg-generator-experimental-enabled-v1';
/** Git, GitHub and remote (including Google Drive) sync are advanced features, off unless enabled here. */
const GIT_FEATURES_KEY = 'tg-git-features-v1';

export interface TestBuilderDefaults {
  instructions: string;
  showPoints: boolean;
  pointsBold: boolean;
  answerSpace: number;
  fontSize: number;
  paper: string;
  marginIn: number;
  showAnswerKey: boolean;
  answerKeyColumns: 1 | 2;
  keepSolutionsTogether: boolean;
  mcqFirst: boolean;
  mcqFullSolutions: boolean;
  flushLeftMath: boolean;
  mcqAnswerBoxes: boolean;
  answerStrip: boolean;
  pageNumbers: PageNumberPlacement;
  graphDefaults: GraphDefaults;
}

const baseline = defaultTestConfig('Test');

export const DEFAULT_TEST_BUILDER_DEFAULTS: TestBuilderDefaults = {
  instructions: baseline.instructions,
  showPoints: baseline.showPoints,
  pointsBold: baseline.pointsBold,
  answerSpace: baseline.answerSpace,
  fontSize: baseline.fontSize,
  paper: baseline.paper,
  marginIn: baseline.marginIn,
  showAnswerKey: baseline.showAnswerKey,
  answerKeyColumns: 1,
  keepSolutionsTogether: false,
  mcqFirst: baseline.mcqFirst,
  mcqFullSolutions: baseline.mcqFullSolutions,
  flushLeftMath: baseline.flushLeftMath ?? true,
  mcqAnswerBoxes: false,
  answerStrip: false,
  pageNumbers: 'none',
  graphDefaults: { ...baseline.graphDefaults },
};

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

function normalizeDefaults(value: Partial<TestBuilderDefaults> | null | undefined): TestBuilderDefaults {
  const graphDefaults = (value?.graphDefaults ?? {}) as Partial<GraphDefaults>;
  return {
    ...DEFAULT_TEST_BUILDER_DEFAULTS,
    ...value,
    paper: value?.paper && KNOWN_PAPER_SIZES.has(value.paper) ? value.paper : DEFAULT_TEST_BUILDER_DEFAULTS.paper,
    fontSize: [10, 11, 12].includes(Number(value?.fontSize)) ? Number(value?.fontSize) : DEFAULT_TEST_BUILDER_DEFAULTS.fontSize,
    answerSpace: clampNumber(value?.answerSpace, 0, 20, DEFAULT_TEST_BUILDER_DEFAULTS.answerSpace),
    flushLeftMath: value?.flushLeftMath !== false,
    mcqAnswerBoxes: value?.mcqAnswerBoxes === true,
    answerStrip: value?.answerStrip === true,
    answerKeyColumns: value?.answerKeyColumns === 2 ? 2 : 1,
    keepSolutionsTogether: value?.keepSolutionsTogether === true,
    pageNumbers: (['none', 'inside', 'centre', 'outside'] as const).find((placement) => placement === value?.pageNumbers) ?? 'none',
    marginIn: clampNumber(value?.marginIn, 0.5, 2, DEFAULT_TEST_BUILDER_DEFAULTS.marginIn),
    graphDefaults: {
      ...DEFAULT_TEST_BUILDER_DEFAULTS.graphDefaults,
      ...graphDefaults,
      axisWeight: clampNumber(graphDefaults.axisWeight, 0.5, 4, DEFAULT_TEST_BUILDER_DEFAULTS.graphDefaults.axisWeight),
      curveWeight: clampNumber(graphDefaults.curveWeight, 0.5, 4, DEFAULT_TEST_BUILDER_DEFAULTS.graphDefaults.curveWeight),
      defaultWidth: clampNumber(graphDefaults.defaultWidth, 2, 15, DEFAULT_TEST_BUILDER_DEFAULTS.graphDefaults.defaultWidth),
      defaultHeight: clampNumber(graphDefaults.defaultHeight, 2, 15, DEFAULT_TEST_BUILDER_DEFAULTS.graphDefaults.defaultHeight),
      xStep: clampNumber(graphDefaults.xStep, 0.1, 100, DEFAULT_TEST_BUILDER_DEFAULTS.graphDefaults.xStep),
      yStep: clampNumber(graphDefaults.yStep, 0.1, 100, DEFAULT_TEST_BUILDER_DEFAULTS.graphDefaults.yStep),
    },
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function loadTestBuilderDefaults(): TestBuilderDefaults {
  try {
    return normalizeDefaults(JSON.parse(localStorage.getItem(TEST_BUILDER_DEFAULTS_KEY) ?? 'null'));
  } catch {
    return normalizeDefaults(null);
  }
}

function saveTestBuilderDefaults(defaults: TestBuilderDefaults): void {
  localStorage.setItem(TEST_BUILDER_DEFAULTS_KEY, JSON.stringify(defaults));
}

class AppSettings {
  testBuilderDefaults = $state<TestBuilderDefaults>(loadTestBuilderDefaults());
  gradebookExperimentalEnabled = $state(loadBoolean(GRADEBOOK_EXPERIMENTAL_KEY, false));
  gradebookNameOrder = $state<StudentNameOrder>(loadNameOrder());
  /** How new Gradebook assessments record scores; each assessment can be switched later. */
  gradebookGradingMode = $state<GradebookGradingMode>(loadGradingMode());
  generatorExperimentalEnabled = $state(loadBoolean(GENERATOR_EXPERIMENTAL_KEY, false));
  gitFeaturesEnabled = $state(loadBoolean(GIT_FEATURES_KEY, false));

  setTestBuilderDefaults(next: TestBuilderDefaults): void {
    this.testBuilderDefaults = normalizeDefaults(next);
    saveTestBuilderDefaults(this.testBuilderDefaults);
  }

  resetTestBuilderDefaults(): void {
    this.setTestBuilderDefaults(DEFAULT_TEST_BUILDER_DEFAULTS);
  }

  createDefaultTestConfig(title: string): TestConfig {
    return applyTestBuilderDefaults(defaultTestConfig(title), this.testBuilderDefaults);
  }

  /** Hides or shows Git features only; saved tokens, remotes and repositories are kept either way. */
  setGitFeaturesEnabled(enabled: boolean): void {
    this.gitFeaturesEnabled = enabled;
    localStorage.setItem(GIT_FEATURES_KEY, String(enabled));
  }

  setGradebookExperimentalEnabled(enabled: boolean): void {
    this.gradebookExperimentalEnabled = enabled;
    localStorage.setItem(GRADEBOOK_EXPERIMENTAL_KEY, String(enabled));
  }

  setGradebookNameOrder(order: StudentNameOrder): void {
    this.gradebookNameOrder = order;
    localStorage.setItem(GRADEBOOK_NAME_ORDER_KEY, order);
  }

  setGradebookGradingMode(mode: GradebookGradingMode): void {
    this.gradebookGradingMode = mode;
    localStorage.setItem(GRADEBOOK_GRADING_MODE_KEY, mode);
  }

  setGeneratorExperimentalEnabled(enabled: boolean): void {
    this.generatorExperimentalEnabled = enabled;
    localStorage.setItem(GENERATOR_EXPERIMENTAL_KEY, String(enabled));
  }
}

export function applyTestBuilderDefaults(config: TestConfig, defaults: TestBuilderDefaults): TestConfig {
  const normalized = normalizeDefaults(defaults);
  return {
    ...config,
    instructions: normalized.instructions,
    showPoints: normalized.showPoints,
    pointsBold: normalized.pointsBold,
    answerSpace: normalized.answerSpace,
    fontSize: normalized.fontSize,
    paper: normalized.paper,
    marginIn: normalized.marginIn,
    showAnswerKey: normalized.showAnswerKey,
    answerKeyColumns: normalized.answerKeyColumns,
    keepSolutionsTogether: normalized.keepSolutionsTogether,
    mcqFirst: normalized.mcqFirst,
    mcqFullSolutions: normalized.mcqFullSolutions,
    flushLeftMath: normalized.flushLeftMath,
    mcqAnswerBoxes: normalized.mcqAnswerBoxes,
    answerStrip: normalized.answerStrip,
    pageNumbers: normalized.pageNumbers,
    graphDefaults: { ...normalized.graphDefaults },
  };
}

export const appSettings = new AppSettings();

function loadBoolean(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

function loadGradingMode(): GradebookGradingMode {
  try {
    return localStorage.getItem(GRADEBOOK_GRADING_MODE_KEY) === 'total' ? 'total' : 'questions';
  } catch {
    return 'questions';
  }
}

function loadNameOrder(): StudentNameOrder {
  try {
    return localStorage.getItem(GRADEBOOK_NAME_ORDER_KEY) === 'last-first' ? 'last-first' : 'first-last';
  } catch {
    return 'first-last';
  }
}
