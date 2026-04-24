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

export interface Question {
  id: string;
  body: string;        // Typst markup — stem only for MCQs (choices stored separately)
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
}

/** A question being staged for bulk import (before it becomes a full Question). */
export interface DraftQuestion {
  body:      string;
  answer:    string;  // MCQ correct letter (A–E); empty string means none
  solution:  string;  // Written explanation; empty string means none
  choices?:  Record<string, string>; // MCQ choices extracted during ingest
  points:    number;
  tagInput:  string;  // comma-separated tags (converted on import)
  classId:   string;
  unitId:    string;
  sectionId: string;
  images?:   string[]; // Image basenames referenced by \includegraphics
}

export interface ChoiceOverride {
  choices:  Record<string, string>;
  solution: string;
}

export interface TestConfig {
  title: string;        // Class name, e.g. "Grade 10 Advanced Math"
  subtitle: string;     // Test identifier, e.g. "Test 2"
  showDate: boolean;
  date: string;
  instructions: string;
  selectedIds: string[];  // Ordered list of question IDs to include
  showPoints: boolean;
  pointsBold: boolean;    // Render point values in bold instead of plain
  answerSpace: number;    // Default blank space in cm below each question
  answerSpaceOverrides: Record<string, number>; // Per-question overrides keyed by question ID
  choiceOverrides: Record<string, ChoiceOverride>; // Shuffled choice order per question ID
  fontSize: number;       // Body font size in pt (e.g. 10, 11, 12)
  paper: string;          // Typst paper name: 'us-letter' | 'a4'
  marginIn: number;       // Page margin in inches (applied to all sides)
  showAnswerKey: boolean;
  mcqFirst: boolean;           // Sort MCQs before FRQs in the generated PDF
  mcqFullSolutions: boolean;   // Also include MCQs in the verbose solutions section
  customPreamble?: string; // If set, used verbatim instead of auto-generated preamble
}

export function defaultTestConfig(): TestConfig {
  return {
    title: 'Grade 10 Advanced Math',
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
    fontSize: 11,
    paper: 'us-letter',
    marginIn: 0.5,
    showAnswerKey: false,
    mcqFirst: true,
    mcqFullSolutions: false,
  };
}
