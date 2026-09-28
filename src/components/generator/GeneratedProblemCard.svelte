<script lang="ts">
  import { compileSvg, cancelPreview, previewConsumer } from '../../lib/typst/compiler';
  import { autoImports } from '../../lib/typst/auto-imports';
  import { formatBody } from '../../lib/question-format';
  import { getThemeColors } from '../../lib/theme-colors';
  import type { GeneratedQuestion } from '../../lib/generator/registry';

  let { question, number, title, level, showAnswer, theme, dark, onregenerate, onremove }: {
    question: GeneratedQuestion;
    number: number;
    title: string;
    level: number;
    showAnswer: boolean;
    theme: string;
    dark: boolean;
    onregenerate: () => void;
    onremove: () => void;
  } = $props();

  const consumer = previewConsumer('generator');
  $effect(() => () => cancelPreview(consumer));
  let svg = $state('');
  let error = $state('');

  let source = $derived.by(() => {
    const colors = getThemeColors(theme, dark);
    let content = question.choices ? formatBody(question.body, question.choices) : question.body;
    if (showAnswer) {
      if (question.answer) content += `\n\n*Correct choice:* ${question.answer}`;
      if (question.solution) content += `\n\n${question.solution}`;
    }
    return `${autoImports(content)}#set page(width: 15cm, height: auto, margin: .5cm, fill: rgb("${colors.bgTypst}"))\n#set text(font: "New Computer Modern", size: 13pt, fill: rgb("${colors.textTypst}"))\n${content}`;
  });

  $effect(() => {
    const src = source;
    let cancelled = false;
    void compileSvg(src, { consumer }).then((result) => {
      if (cancelled || result.cancelled) return;
      error = result.error ?? '';
      if (result.svg) svg = result.svg;
    });
    return () => { cancelled = true; };
  });
</script>

<article class="card">
  <header>
    <span class="number">{number}.</span>
    <span class="meta">{title} · Level {level} · {question.sectionId}</span>
    <button class="icon" onclick={onregenerate} title="New numbers for this problem" aria-label="Regenerate problem {number}">↻</button>
    <button class="icon" onclick={onremove} title="Remove this problem" aria-label="Remove problem {number}">✕</button>
  </header>
  {#if error}<pre role="alert">{error}</pre>{/if}
  {#if svg}<div class="svg">{@html svg}</div>{:else if !error}<p class="loading">Rendering…</p>{/if}
</article>

<style>
  .card { border: 1px solid var(--border); border-radius: 8px; background: var(--bg); padding: .5rem .75rem .75rem; }
  header { display: flex; align-items: center; gap: .5rem; }
  .number { font-weight: 700; }
  .meta { flex: 1; min-width: 0; color: var(--text-2); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .icon { width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; }
  .svg { max-width: 15cm; }
  .svg :global(svg) { display: block; width: 100%; height: auto; }
  .loading { color: var(--text-2); font-size: 12px; margin: .5rem 0 0; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--danger); font-size: 12px; }
</style>
