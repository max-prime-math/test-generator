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

export interface TestConfig {
  title: string;
  subtitle: string;
  date: string;
  instructions: string;
  selectedIds: string[];  // Ordered list of question IDs to include
  showPoints: boolean;
  answerSpace: number;    // Blank space in cm below each question
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
    answerSpace: 4,
  };
}
