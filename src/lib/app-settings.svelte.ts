import { defaultTestConfig, type GraphDefaults, type TestConfig } from './types';

const TEST_BUILDER_DEFAULTS_KEY = 'tg-test-builder-defaults-v1';

export interface TestBuilderDefaults {
  instructions: string;
  showPoints: boolean;
  pointsBold: boolean;
  answerSpace: number;
  fontSize: number;
  paper: string;
  marginIn: number;
  showAnswerKey: boolean;
  mcqFirst: boolean;
  mcqFullSolutions: boolean;
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
  mcqFirst: baseline.mcqFirst,
  mcqFullSolutions: baseline.mcqFullSolutions,
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
    mcqFirst: normalized.mcqFirst,
    mcqFullSolutions: normalized.mcqFullSolutions,
    graphDefaults: { ...normalized.graphDefaults },
  };
}

export const appSettings = new AppSettings();
