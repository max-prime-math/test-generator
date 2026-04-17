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
  body: string;        // Typst markup — use $...$ for inline math, $ ... $ for display
  solution?: string;   // Optional solution in Typst markup
  points: number;
  tags: string[];
  // Curriculum placement (all optional for uncategorised questions)
  classId?: string;    // references Class.id
  unitId?: string;     // references Unit.id
  sectionId?: string;  // references Section.id
  createdAt: number;
}

/** A question being staged for bulk import (before it becomes a full Question). */
export interface DraftQuestion {
  body:      string;
  solution:  string;  // optional — empty string means no solution
  points:    number;
  tagInput:  string;  // comma-separated tags (converted on import)
  classId:   string;
  unitId:    string;
  sectionId: string;
}

export interface TestConfig {
  title: string;
  subtitle: string;
  date: string;
  instructions: string;
  selectedIds: string[];  // Ordered list of question IDs to include
  showPoints: boolean;
  pointsBold: boolean;    // Render point values in bold instead of plain
  answerSpace: number;    // Default blank space in cm below each question
  answerSpaceOverrides: Record<string, number>; // Per-question overrides keyed by question ID
  fontSize: number;       // Body font size in pt (e.g. 10, 11, 12)
  paper: string;          // Typst paper name: 'us-letter' | 'a4'
  marginIn: number;       // Page margin in inches (applied to all sides)
  customPreamble?: string; // If set, used verbatim instead of auto-generated preamble
}

export function defaultTestConfig(): TestConfig {
  return {
    title: '',
    subtitle: '',
    date: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    instructions: 'Show all work for full credit.',
    selectedIds: [],
    showPoints: true,
    pointsBold: false,
    answerSpace: 4,
    answerSpaceOverrides: {},
    fontSize: 11,
    paper: 'us-letter',
    marginIn: 1,
  };
}
