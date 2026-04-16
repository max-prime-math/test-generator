export interface Question {
  id: string;
  body: string;       // Typst markup — use $...$ for inline math, $ ... $ for display
  solution?: string;  // Optional solution in Typst markup
  points: number;
  tags: string[];
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
