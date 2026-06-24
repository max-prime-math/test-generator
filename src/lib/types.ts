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
export type AlgorithmSequenceEntryKind =
  | 'variable-name'
  | 'rule'
  | 'sample-value'
  | 'condition'
  | 'support-token'
  | 'control'
  | 'unknown';
export type GraphFamily = 'cartesian' | 'polar' | 'number-line' | 'unknown';
export type GraphObjectKind =
  | 'function'
  | 'relation'
  | 'point'
  | 'ray'
  | 'segment'
  | 'picture'
  | 'shape'
  | 'text'
  | 'unknown';
export type GraphRelation = '=' | '<' | '<=' | '>' | '>=' | 'unknown';
export type GraphPointStyle = 'none' | 'solid' | 'hollow' | 'open-bracket' | 'closed-bracket' | 'unknown';
export type GraphLabelStyle = 'none' | 'coordinates' | 'custom' | 'unknown';
export type GraphRayDirection = 'left' | 'right' | 'unknown';
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

export interface AlgorithmSequenceEntry {
  id: string;
  order: number;
  text: string;
  kind: AlgorithmSequenceEntryKind;
  ownerKind: AlgorithmScopeKind;
  definitionName?: string;
  source: string;
}

export interface AlgorithmModel {
  scope: {
    kind: AlgorithmScopeKind;
  };
  definitions: AlgorithmDefinition[];
  sequence: AlgorithmSequenceEntry[];
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

export interface GraphPointObject {
  x: string;
  y: string;
  style?: GraphPointStyle;
  labelStyle?: GraphLabelStyle;
  label?: string;
  labelPosition?: string;
}

export interface GraphRayObject {
  endpoint: string;
  direction: GraphRayDirection;
  endpointStyle?: GraphPointStyle;
  labelStyle?: GraphLabelStyle;
  label?: string;
  labelPosition?: string;
}

export interface GraphObject {
  id: string;
  kind: GraphObjectKind;
  expression?: string;
  typstMath?: string;
  latexMath?: string;
  relation?: GraphRelation;
  domain?: {
    min?: string;
    max?: string;
  };
  displayCondition?: string;
  variables?: string[];
  color?: string;
  linePattern?: string;
  shading?: string;
  point?: GraphPointObject;
  ray?: GraphRayObject;
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
  narrativeId?: string; // references Narrative.id; narrative remains a fallback snapshot
  body: string;        // Typst markup — stem only for MCQs (choices stored separately)
  parts?: QuestionParts;
  algorithmModel?: AlgorithmModel;
  algorithmEvaluation?: AlgorithmEvaluation;
  algorithmSeed?: number;
  algorithmVariant?: number;
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
  narrativeId?: string;
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
  className?: string; // Optional detected class name from package/comment metadata
  unitId:    string;
  sectionId: string;
  unitName?: string;   // Optional detected unit name from comment metadata
  sectionName?: string; // Optional detected section name from comment metadata
  images?:   string[]; // Image basenames referenced by the question
  rawLatex?: string;   // Original pre-conversion chunk; only present during import
  rawFormat?: 'latex' | 'typst'; // Format used when rawLatex was captured
}

export interface Narrative {
  id: string;
  title: string;
  body: string;
  tags: string[];
  classId?: string;
  unitId?: string;
  sectionId?: string;
  createdAt: number;
  updatedAt?: number;
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
  bonusQuestionIds: string[]; // Question IDs that should be labeled and graded as bonus questions
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
    bonusQuestionIds: [],
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

export type TestType = 'quiz' | 'test' | 'exam' | 'assignment' | 'formative' | 'other';

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

export interface GradebookSection {
  id: string;
  name: string;
  linkedClassId: string | null;
  termLabel: string | null;
  categoryWeights: Partial<Record<TestType, number>>;
  archivedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface GradebookStudent {
  id: string;
  sisId?: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GradebookEnrollment {
  id: string;
  sectionId: string;
  studentId: string;
  active: boolean;
  startedAt: number;
  endedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface GradebookAssessmentQuestionSnapshot {
  questionId: string;
  label: string;
  order: number;
  points: number;
  isBonus: boolean;
  classId?: string;
  unitId?: string;
  sectionId?: string;
  bodyPreview?: string;
}

export interface GradebookAssessment {
  id: string;
  sectionId: string;
  savedTestId: string;
  savedTestName: string;
  title: string;
  subtitle: string;
  testType: TestType | null;
  selectedQuestionIds: string[];
  questionSnapshots: GradebookAssessmentQuestionSnapshot[];
  totalPoints: number;
  bonusPoints: number;
  administeredAt: number;
  categoryId?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type GradebookScoreState = 'normal' | 'missing' | 'excused' | 'absent' | 'incomplete';

export interface GradebookQuestionScore {
  questionId: string;
  points: number | null;
}

export interface GradebookScore {
  id: string;
  sectionId: string;
  assessmentId: string;
  studentId: string;
  state: GradebookScoreState;
  points: number | null;
  questionScores?: GradebookQuestionScore[];
  comment?: string;
  gradedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface GradebookSettings {
  defaultScoreState: GradebookScoreState;
}

export interface GradebookData {
  version: 1;
  sections: GradebookSection[];
  students: GradebookStudent[];
  enrollments: GradebookEnrollment[];
  assessments: GradebookAssessment[];
  scores: GradebookScore[];
  settings: GradebookSettings;
}
