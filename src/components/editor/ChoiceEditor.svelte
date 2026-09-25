<script lang="ts">
  import PictureStrip from '../media/PictureStrip.svelte';
  import { rearrangeChoices } from '../../lib/editor/editor-model';
  let { choices = $bindable({}), answer = $bindable(''), context = 'choice' }: { choices?: Record<string, string>; answer?: string; context?: string } = $props();
  function reorder(order: string[]) { ({ choices, answer } = rearrangeChoices(choices, answer, order)); }
  function move(index: number, delta: number) {
    const keys = Object.keys(choices);
    [keys[index], keys[index + delta]] = [keys[index + delta], keys[index]];
    reorder(keys);
  }
  function add() { choices = { ...choices, [String.fromCharCode(65 + Object.keys(choices).length)]: '' }; }
</script>
<fieldset>
  <legend>Choices · select the correct choice</legend>
  {#each Object.entries(choices) as [letter], index}
    <div class="choice" class:correct={answer === letter}>
      <label class="correct-control"><input type="radio" name="editor-correct-choice" checked={answer === letter} onchange={() => answer = letter} aria-label="Mark {letter} correct" />{letter}</label>
      <textarea rows="2" bind:value={choices[letter]} aria-label="Choice {letter}" placeholder="Choice {letter} · Typst markup"></textarea>
      <div class="tools">
        <button onclick={() => move(index, -1)} disabled={index === 0} aria-label="Move {letter} up">↑</button>
        <button onclick={() => move(index, 1)} disabled={index === Object.keys(choices).length - 1} aria-label="Move {letter} down">↓</button>
        <button onclick={() => reorder(Object.keys(choices).filter(k => k !== letter))} aria-label="Remove choice {letter}">×</button>
      </div>
    </div>
    <PictureStrip bind:value={choices[letter]} context={`${context}:${letter}`} />
  {/each}
  <button onclick={add} disabled={Object.keys(choices).length >= 5}>+ Add choice</button>
  <small>{answer ? `Correct choice: ${answer}` : 'No correct choice selected'} · Up to five choices (A–E)</small>
</fieldset>
<style>
  fieldset { border: 1px solid var(--border); border-radius: 8px; padding: .75rem; min-width: 0; display: grid; gap: .6rem; }
  legend, small { font-size: 12px; color: var(--text-2); }
  .choice { display: flex; gap: .5rem; align-items: center; padding: .35rem; border-radius: 6px; }
  .correct { background: color-mix(in srgb, var(--accent) 12%, transparent); outline: 1px solid var(--accent); }
  .correct-control { display: flex; align-items: center; gap: .25rem; font-weight: 600; }
  input[type=radio] { width: auto; flex: 0 0 auto; }
  textarea { flex: 1; min-width: 0; }
  .tools { display: grid; grid-template-columns: repeat(3, 1fr); }
  .tools button { padding: .3rem; }
</style>
