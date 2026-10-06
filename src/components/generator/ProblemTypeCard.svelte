<script lang="ts">
  // The settings card for one problem type, modelled on Kuta's topic dialog: how
  // many questions, a level preset, the question type, fine-tuning options, and
  // live samples (with answers) that follow every change.
  import GeneratedProblemCard from './GeneratedProblemCard.svelte';
  import { generateProblem, resolveOptions, toQuestion } from '../../lib/generator/registry';
  import { randomSeed } from '../../lib/generator/rng';
  import { MAX_PER_SECTION, newSeeds } from '../../lib/generator/worksheet';
  import type { SectionDraft } from '../../lib/generator/worksheet';
  import type { Difficulty, Generator, GenOptions, OptionSpec, ProblemFormat } from '../../lib/generator/types';

  let { generator, initial, editing = false, saveLabel = '', note = '', error = '', theme, dark, onsave, onclose }: {
    generator: Generator;
    initial: SectionDraft;
    /** Editing an existing worksheet section rather than adding a new one. */
    editing?: boolean;
    /** The save button's text when editing (default "Save"). */
    saveLabel?: string;
    /** Shown above the settings, e.g. what the questions will replace. */
    note?: string;
    error?: string;
    theme: string;
    dark: boolean;
    /** `keepOpen` is Add & Continue: add this section and leave the card open for another. */
    onsave: (draft: SectionDraft, keepOpen: boolean) => void;
    onclose: () => void;
  } = $props();

  const MAX = 30;
  const PRESETS: Array<[Difficulty, string]> = [[1, 'Easy'], [2, 'Medium'], [3, 'Hard']];

  // The card starts from `initial` and then keeps its own state; it is created afresh each time it opens.
  // The questions themselves: the preview shows exactly what OK or Add adds.
  // svelte-ignore state_referenced_locally
  let seeds = $state<number[]>(initial.seeds.length ? [...initial.seeds] : newSeeds(4));
  // svelte-ignore state_referenced_locally
  let count = $state(initial.seeds.length || 4);
  // svelte-ignore state_referenced_locally
  let difficulty = $state<Difficulty>(initial.difficulty);
  // svelte-ignore state_referenced_locally
  let format = $state<ProblemFormat>(generator.mcq === false ? 'written' : initial.format);
  // svelte-ignore state_referenced_locally
  let options = $state<GenOptions>({ ...initial.options });
  let added = $state(0);
  /** The count box grows or shrinks the preview, keeping the questions already there. */
  function setCount(value: number) {
    const n = Math.max(1, Math.min(MAX_PER_SECTION, Math.floor(Number(value) || 1)));
    count = n;
    seeds = n > seeds.length ? [...seeds, ...newSeeds(n - seeds.length)] : seeds.slice(0, n);
  }
  const refreshAll = () => { seeds = newSeeds(seeds.length); };
  const refreshOne = (i: number) => { seeds = seeds.map((s, j) => (j === i ? randomSeed() : s)); };
  const removeOne = (i: number) => { if (seeds.length > 1) { seeds = seeds.filter((_, j) => j !== i); count = seeds.length; } };

  /** What each control shows: the teacher's choice, or the level's value. */
  let effective = $derived(resolveOptions(generator, options, difficulty));
  const setOption = (spec: OptionSpec, value: string) => { options = { ...options, [spec.id]: value }; };
  const toggleMany = (spec: OptionSpec, value: string, on: boolean) => {
    const current = new Set(effective[spec.id].split(',').filter(Boolean));
    if (on) current.add(value); else current.delete(value);
    // Keep at least one choice, like a radio group.
    if (current.size) setOption(spec, spec.choices.map((c) => c.value).filter((v) => current.has(v)).join(','));
  };
  /** A preset sets the level and returns every option to that level's values. */
  function preset(level: Difficulty) {
    difficulty = level;
    options = {};
  }

  let samples = $derived.by(() => seeds.map((seed) => {
    const item = { generatorId: generator.id, difficulty, seed, options };
    try {
      return { question: toQuestion(item, format), answer: format === 'mcq' && generator.mcq !== false ? '' : generateProblem(item).answer, error: '' };
    } catch (e) {
      return { question: null, answer: '', error: (e as Error).message };
    }
  }));

  const draft = (): SectionDraft => ({ seeds: [...seeds], difficulty, format, options: { ...options } });
  function save(keepOpen: boolean) {
    onsave(draft(), keepOpen);
    // Add & Continue: a fresh set with the same settings, ready to adjust and add.
    if (keepOpen) { added += seeds.length; seeds = newSeeds(seeds.length); }
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); onclose(); }
  }
  const sliderIndex = (spec: OptionSpec) => Math.max(0, spec.choices.findIndex((c) => c.value === effective[spec.id]));
</script>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="sheet" role="presentation" onclick={onclose}>
  <div class="type-card" role="dialog" aria-modal="true" aria-label={generator.title} tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <header>
      <h3>{generator.title}</h3>
      <span class="tags">{#each generator.outcomes ?? [generator.outcomeId] as o}<span class="tag">{o}</span>{/each}</span>
      <button class="ghost close" onclick={onclose} title="Close" aria-label="Close">✕</button>
    </header>

    {#if note}<p class="note">{note}</p>{/if}
    {#if error}<p class="note error" role="alert">{error}</p>{/if}
    <div class="body">
      <div class="settings">
        <div class="top">
          <label class="count">Number of questions
            <input type="number" min="1" max={MAX} value={count} onchange={(e) => setCount(Number(e.currentTarget.value))} />
          </label>
          <div class="buttons">
            <button class="primary" onclick={() => save(false)} title="Add the questions shown in the preview">{editing ? saveLabel || 'Save' : `Add ${seeds.length}`}</button>
            {#if !editing}<button onclick={() => save(true)} title="Add the previewed questions and keep this card open for another set">Add & Continue</button>{/if}
            <button class="ghost" onclick={onclose}>Cancel</button>
          </div>
        </div>
        {#if added}<p class="added" role="status">Added {added} question{added === 1 ? '' : 's'}. Change the settings to add another set, or choose OK.</p>{/if}

        <fieldset>
          <legend>Preset choices</legend>
          <div class="presets">
            {#each PRESETS as [level, name]}
              <button class:active={difficulty === level} aria-pressed={difficulty === level} onclick={() => preset(level)} title={generator.levels[level]}>{name}</button>
            {/each}
          </div>
          <p class="help">{generator.levels[difficulty]}</p>
        </fieldset>

        <fieldset>
          <legend>Question type</legend>
          <div class="radios">
            <label><input type="radio" name="format" value="written" bind:group={format} /> Free response</label>
            <label class:disabled={generator.mcq === false}><input type="radio" name="format" value="mcq" bind:group={format} disabled={generator.mcq === false} /> Multiple choice</label>
          </div>
          {#if generator.mcq === false}<p class="help">This type has no sensible wrong answers, so it stays free response.</p>{/if}
        </fieldset>

        {#if generator.options?.length}
          <fieldset>
            <legend>Options</legend>
            {#each generator.options as spec (spec.id)}
              {@const enabled = !spec.enabledWhen || effective[spec.enabledWhen.id] === spec.enabledWhen.value}
              <div class="option" class:inactive={!enabled}>
                {#if spec.slider}
                  <label class="slider">{spec.label}: <strong>{spec.choices[sliderIndex(spec)].label}</strong>
                    <input type="range" disabled={!enabled} min="0" max={spec.choices.length - 1} step="1" value={sliderIndex(spec)}
                      oninput={(e) => setOption(spec, spec.choices[Number(e.currentTarget.value)].value)} />
                  </label>
                {:else if spec.kind === 'toggle'}
                  <label class="check"><input type="checkbox" disabled={!enabled} checked={effective[spec.id] === 'yes'} onchange={(e) => setOption(spec, e.currentTarget.checked ? 'yes' : 'no')} /> {spec.label}</label>
                {:else}
                  <div class="group" role={spec.kind === 'one' ? 'radiogroup' : 'group'} aria-label={spec.label}>
                    <span class="group-label">{spec.label}</span>
                    {#each spec.choices as choice (choice.value)}
                      {#if spec.kind === 'one'}
                        <label><input type="radio" disabled={!enabled} name="{generator.id}-{spec.id}" checked={effective[spec.id] === choice.value} onchange={() => setOption(spec, choice.value)} /> {choice.label}</label>
                      {:else}
                        <label><input type="checkbox" disabled={!enabled} checked={effective[spec.id].split(',').includes(choice.value)} onchange={(e) => toggleMany(spec, choice.value, e.currentTarget.checked)} /> {choice.label}</label>
                      {/if}
                    {/each}
                  </div>
                {/if}
                {#if spec.help}<p class="help">{spec.help}</p>{/if}
              </div>
            {/each}
          </fieldset>
        {:else}
          <p class="help">This problem type has no extra options yet: the preset sets everything.</p>
        {/if}
      </div>

      <section class="samples" aria-label="Preview">
        <div class="samples-head">
          <span>Preview: {seeds.length} question{seeds.length === 1 ? '' : 's'} {editing ? 'in this section' : 'to add'}</span>
          <button onclick={refreshAll} title="New random questions with the same settings">↻ Refresh all</button>
        </div>
        {#each samples as sample, i (`${seeds[i]}:${i}`)}
          {#if sample.question}
            <div class="sample" data-seed={seeds[i]}>
              <GeneratedProblemCard question={sample.question} label={`${i + 1}.`} answer={sample.answer} compact showAnswer={false} {theme} {dark}
                onregenerate={() => refreshOne(i)} onremove={seeds.length > 1 ? () => removeOne(i) : undefined} />
            </div>
          {:else}
            <p class="error" role="alert">{sample.error}</p>
          {/if}
        {/each}
      </section>
    </div>
  </div>
</div>

<style>
  .sheet { position: fixed; inset: 0; background: rgba(0, 0, 0, .35); display: flex; align-items: center; justify-content: center; z-index: 50; }
  .type-card { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 32px rgba(0, 0, 0, .25);
    width: min(calc(100% - 2rem), 1000px); height: min(calc(100% - 2rem), 720px); display: flex; flex-direction: column; }
  header { display: flex; align-items: center; gap: .6rem; padding: .7rem 1rem; border-bottom: 1px solid var(--border); }
  header h3 { font-size: 14px; font-weight: 600; margin: 0; }
  .tags { display: flex; gap: .25rem; flex: 1; }
  .tag { font-size: 10px; font-family: ui-monospace, monospace; padding: 0 4px; border-radius: 3px; background: var(--bg-2); color: var(--text-2); }
  .close { margin-left: auto; }
  .body { display: grid; grid-template-columns: minmax(300px, 400px) minmax(0, 1fr); gap: 1rem; padding: 1rem; min-height: 0; flex: 1; }
  .settings { overflow: auto; display: flex; flex-direction: column; gap: .7rem; padding-right: .25rem; }
  .top { display: flex; align-items: end; gap: .6rem; flex-wrap: wrap; }
  .count { display: grid; gap: .2rem; font-size: 12px; color: var(--text-2); }
  .count input { width: 5rem; }
  .buttons { display: flex; gap: .4rem; flex-wrap: wrap; }
  .added { font-size: 12px; color: var(--text-2); margin: 0; }
  fieldset { border: 1px solid var(--border); border-radius: 8px; padding: .5rem .7rem .6rem; margin: 0; }
  legend { font-size: 12px; color: var(--text-2); padding: 0 .3rem; }
  .presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: .4rem; }
  .presets button.active { background: var(--primary); color: #fff; border-color: var(--primary); }
  .radios { display: flex; gap: 1.2rem; font-size: 13px; }
  .radios label, .group label, .check { display: inline-flex; align-items: center; gap: .35rem; font-size: 13px; }
  .radios input, .group input, .check input { width: auto; }
  .disabled { opacity: .5; }
  .option.inactive { opacity: .55; }
  .option + .option { margin-top: .55rem; }
  .group { display: flex; flex-direction: column; gap: .2rem; }
  .group-label { font-size: 12px; color: var(--text-2); }
  .slider { display: grid; gap: .2rem; font-size: 13px; }
  .slider input { width: 100%; }
  .help { margin: .3rem 0 0; font-size: 11px; color: var(--text-2); }
  .samples { border: 1px solid var(--border); border-radius: 8px; overflow: auto; padding: .4rem .8rem; min-width: 0; }
  .samples-head { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-2); position: sticky; top: -.4rem; background: var(--bg); padding: .3rem 0; z-index: 1; }
  .error { color: var(--danger); font-size: 12px; }
  @media (max-width: 760px) {
    .type-card { height: calc(100% - 1rem); width: calc(100% - 1rem); }
    .body { grid-template-columns: 1fr; overflow: auto; }
    .settings, .samples { overflow: visible; }
  }
  .note { margin: 0; padding: .45rem 1rem; font-size: 12px; color: var(--text-2); border-bottom: 1px solid var(--border); }
  .note.error { color: var(--danger); white-space: pre-wrap; }
</style>
