import type { DisplayModeQuestion } from './display-mode.svelte.ts';
import { autoImports } from './typst/auto-imports.ts';
import { formatBody, formatParts } from './question-format.ts';

export function displayQuestionContent(question: DisplayModeQuestion, narrative = '', showAnswer = false): string {
  const resolvedNarrative = narrative.trim();
  const structured = question.parts ? formatParts(question.parts, !resolvedNarrative) : question.body;
  const body = question.choices && Object.keys(question.choices).length >= 2
    ? formatBody(structured, question.choices)
    : structured;
  let content = resolvedNarrative ? `${resolvedNarrative}\n\n${body}` : body;
  const graph = question.graphTypst?.trim();
  if (graph && !(/Recovered graph/i.test(graph) && /Recovered graph/i.test(content))) content += `\n\n${graph}`;
  if (showAnswer) {
    if (question.answer?.trim()) content += `\n\n*Answer:* ${question.answer.trim()}`;
    if (question.solution?.trim()) content += `\n\n*Solution:*\n${question.solution.trim()}`;
  }
  return content;
}

export function hasDisplayAnswer(question: DisplayModeQuestion): boolean {
  return Boolean(question.answer?.trim() || question.solution?.trim());
}

export function displayQuestionSource(
  question: DisplayModeQuestion,
  narrative: string,
  showAnswer: boolean,
  colors: { bgTypst: string; textTypst: string },
  fontSize = 18,
): string {
  const content = displayQuestionContent(question, narrative, showAnswer);
  return `${autoImports(content)}#set page(width: 18cm, height: auto, margin: 1cm, fill: rgb("${colors.bgTypst}"))
#set text(font: "New Computer Modern", size: ${fontSize}pt, fill: rgb("${colors.textTypst}"))
#set par(justify: false)

${content}`;
}
