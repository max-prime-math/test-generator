export interface Section {
  id: string;    // e.g. "1.1"
  name: string;  // e.g. "Defining Limits and Using Limit Notation"
}

export interface Unit {
  id: string;    // e.g. "1"
  name: string;  // e.g. "Limits and Continuity"
  sections: Section[];
}

export interface Class {
  id: string;       // e.g. "ap-calc-bc"
  name: string;     // e.g. "AP Calculus BC"
  units: Unit[];
}

export interface QuestionPart {
  label?: string;
  body: string;
  parts?: QuestionParts;
}

export interface QuestionParts {
  stem: string;
  items: QuestionPart[];
}

export type AlgorithmScopeKind = 'question' | 'narrative' | 'matching-group';
export type AlgorithmDefinitionKind = 'variable' | 'constant' | 'condition' | 'user-function' | 'unknown';
export type GraphFamily = 'cartesian' | 'polar' | 'number-line' | 'unknown';
export type GraphObjectKind = 'function' | 'relation' | 'point' | 'text' | 'unknown';
export type DiagnosticLevel = 'info' | 'warning' | 'error';

export interface QuestionDecodeDiagnostic {
  level: DiagnosticLevel;
  code: string;
  message: string;
}

export interface AlgorithmDefinition {
  id: string;
  name: string;
  kind: AlgorithmDefinitionKind;
  rawExpression?: string;
  sampleValue?: string;
  dependencies: string[];
  source: string;
}

export interface AlgorithmModel {
  scope: {
    kind: AlgorithmScopeKind;
  };
  definitions: AlgorithmDefinition[];
  source: string;
}

export interface AlgorithmEvaluationEntry {
  name: string;
  status: 'resolved' | 'unresolved';
  value?: string;
}

export interface AlgorithmEvaluation {
  entries: AlgorithmEvaluationEntry[];
  diagnostics: QuestionDecodeDiagnostic[];
}

export interface GraphPoint {
  x: number;
  y: number;
}

export interface GraphObject {
  id: string;
  kind: GraphObjectKind;
  expression?: string;
  typstMath?: string;
  latexMath?: string;
  variables?: string[];
  samplePoints?: GraphPoint[];
}

export interface GraphModel {
  family: GraphFamily;
  objects: GraphObject[];
  variables?: Record<string, string>;
  rawExpressions: string[];
  source: string;
}

export interface Question {
  id: string;
  narrative?: string;
  body: string;        // Typst markup — stem only for MCQs (choices stored separately)
  parts?: QuestionParts;
  algorithmModel?: AlgorithmModel;
  algorithmEvaluation?: AlgorithmEvaluation;
  graphModel?: GraphModel;
  graphTypst?: string;
  decodeDiagnostics?: QuestionDecodeDiagnostic[];
  questionType?: string;
  answer?: string;     // Correct MCQ letter (A–E); separate from written solution
  solution?: string;   // Written explanation (any length); for MCQs this is the explanation, not the letter
  choices?: Record<string, string>; // MCQ choices: { A: '...', B: '...', ... }
  points: number;
  tags: string[];
  images?: string[];   // Basenames of images referenced by the body (see image-store)
  // Curriculum placement (all optional for uncategorised questions)
  classId?: string;    // references Class.id
  unitId?: string;     // references Unit.id
  sectionId?: string;  // references Section.id
  createdAt: number;
  updatedAt?: number;  // Last modification time (unix ms); undefined before first edit
  renderError?: string; // Non-null = last render attempt failed; value is the typst error message
  checked?: boolean;   // True = validation check has been run; undefined/false = not checked
}

/** A question being staged for bulk import (before it becomes a full Question). */
export interface DraftQuestion {
  narrative?: string;
  body:      string;
  parts?:    QuestionParts;
  algorithmModel?: AlgorithmModel;
  algorithmEvaluation?: AlgorithmEvaluation;
  graphModel?: GraphModel;
  graphTypst?: string;
  decodeDiagnostics?: QuestionDecodeDiagnostic[];
  questionType?: string;
  answer:    string;  // MCQ correct letter (A–E); empty string means none
  solution:  string;  // Written explanation; empty string means none
  choices?:  Record<string, string>; // MCQ choices extracted during ingest
  points:    number;
  tagInput:  string;  // comma-separated tags (converted on import)
  classId:   string;
  unitId:    string;
  sectionId: string;
  unitName?: string;   // Optional detected unit name from comment metadata
  sectionName?: string; // Optional detected section name from comment metadata
  images?:   string[]; // Image basenames referenced by the question
  rawLatex?: string;   // Original pre-conversion chunk; only present during import
  rawFormat?: 'latex' | 'typst'; // Format used when rawLatex was captured
}

export interface ChoiceOverride {
  choices:  Record<string, string>;
  solution: string;
}

export interface AfterQuestionLayout {
  vfill?: boolean;
  pagebreak?: boolean;
}

export interface GraphDefaults {
  showGrid: boolean;
  gridColor: string;
  axisWeight: number;
  curveWeight: number;
  asymptoteColor: string;
  defaultWidth: number;
  defaultHeight: number;
  xStep: number;
  yStep: number;
}

export interface TestConfig {
  title: string;        // Class name, e.g. "Grade 10 Advanced Math"
  subtitle: string;     // Test identifier, e.g. "Test 2"
  showDate: boolean;
  date: string;
  instructions: string;
  selectedIds: string[];  // Ordered list of selected question IDs and layout item tokens
  showPoints: boolean;
  pointsBold: boolean;    // Render point values in bold instead of plain
  answerSpace: number;    // Default blank space in cm below each question
  answerSpaceOverrides: Record<string, number>; // Per-question overrides keyed by question ID
  choiceOverrides: Record<string, ChoiceOverride>; // Shuffled choice order per question ID
  pageBreakAfter: Record<string, AfterQuestionLayout>; // Per-question layout controls emitted after the question body
  fontSize: number;       // Body font size in pt (e.g. 10, 11, 12)
  paper: string;          // Typst paper name, e.g. 'us-letter', 'us-legal', 'a4'
  marginIn: number;       // Page margin in inches (applied to all sides)
  showAnswerKey: boolean;
  mcqFirst: boolean;           // Sort MCQs before FRQs in the generated PDF
  mcqFullSolutions: boolean;   // Also include MCQs in the verbose solutions section
  graphDefaults: GraphDefaults;
  customPreamble?: string; // If set, used verbatim instead of auto-generated preamble
}

export function defaultTestConfig(title = '', options: { paper?: string } = {}): TestConfig {
  return {
    title,
    subtitle: '',
    showDate: false,
    date: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    instructions: 'Answer each question to the best of your ability.  You may not use a calculator.',
    selectedIds: [],
    showPoints: true,
    pointsBold: false,
    answerSpace: 4,
    answerSpaceOverrides: {},
    choiceOverrides: {},
    pageBreakAfter: {},
    fontSize: 11,
    paper: options.paper ?? 'us-letter',
    marginIn: 0.5,
    showAnswerKey: false,
    mcqFirst: true,
    mcqFullSolutions: false,
    graphDefaults: {
      showGrid: false,
      gridColor: 'silver',
      axisWeight: 1,
      curveWeight: 1,
      asymptoteColor: 'red',
      defaultWidth: 8,
      defaultHeight: 5,
      xStep: 1,
      yStep: 1,
    },
  };
}

export type TestType = 'quiz' | 'test' | 'exam' | 'assignment' | 'other';

export interface SavedTest {
  id: string;
  name: string;
  classId: string | null;
  unitId: string | null;
  testType: TestType | null;
  config: TestConfig;
  createdAt: number;
  updatedAt: number;
}
