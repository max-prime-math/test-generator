<script lang="ts">
  import { bank } from '../../lib/bank.svelte';
  import { editor } from '../../lib/editor/editor-state.svelte';
  import type { Question } from '../../lib/types';
  import type { EditorDraft } from '../../lib/editor/editor-model';
  import CurriculumPicker from './CurriculumPicker.svelte';
  import { cachedText, questionSearchText } from '../../lib/search-index';
  let { onquestion, ondraft, selected = $bindable([]) }: { onquestion: (q: Question) => void; ondraft: (d: EditorDraft) => void; selected?: string[] } = $props();
  let search = $state('');
  let classId = $state('');
  let unitId = $state('');
  let sectionId = $state('');
  let limit = $state(80);
  let draftLimit = $state(80);
  let query = $derived(search.trim().toLowerCase());
  let questions = $derived(bank.questions.filter(q => (!classId || q.classId === classId) && (!unitId || q.unitId === unitId) && (!sectionId || q.sectionId === sectionId) && (!query || questionSearchText(q).nav.includes(query))));
  let drafts = $derived(editor.session.drafts.filter(d => !query || cachedText(d, 'nav', [d.fields.body, d.fields.tagInput], () => `${d.fields.body} ${d.fields.tagInput}`.toLowerCase()).includes(query)));
  function toggle(id: string) { selected = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]; }
</script>
<div class="navigator">
  <input type="search" aria-label="Search questions and drafts" bind:value={search} oninput={() => { limit = 80; draftLimit = 80; }} placeholder="Search questions, tags, ID…" />
  <details><summary>Browse curriculum</summary><CurriculumPicker bind:classId bind:unitId bind:sectionId /></details>
  <div class="section-heading"><h3>Drafts <span>{editor.loading ? 'loading…' : editor.session.drafts.length}</span></h3><button onclick={() => selected = drafts.map(d => d.id)}>Select all</button></div>
  {#each drafts.slice(0, draftLimit) as draft (draft.id)}
    <div class="draft-row" class:active={editor.current?.id === draft.id}>
      <input type="checkbox" aria-label="Select draft {draft.fields.body.slice(0, 35) || 'Untitled'}" checked={selected.includes(draft.id)} onchange={() => toggle(draft.id)} />
      <button class="item" onclick={() => ondraft(draft)}><span>{draft.fields.body.slice(0, 95) || 'Untitled question'}</span><small>{draft.sourceId ? 'Editing bank question' : 'New question'} · {draft.fields.sectionId || draft.fields.unitId || 'Unplaced'}</small></button>
    </div>
  {/each}
  {#if drafts.length > draftLimit}<button onclick={() => draftLimit += 80}>Show more drafts ({drafts.length - draftLimit} more)</button>{/if}
  {#if editor.loading}<p role="status">Loading drafts…</p>{:else if !drafts.length}<p>No drafts. Create a question or open one below.</p>{/if}
  <h3>Bank <span>{questions.length}</span></h3>
  {#each questions.slice(0, limit) as q (q.id)}
    <button class="item bank-item" class:active={editor.current?.sourceId === q.id} onclick={() => onquestion(q)}><span>{q.body.slice(0, 100)}</span><small>{q.sectionId || q.unitId || 'Uncategorized'} · {q.points} pts {q.choices ? '· MCQ' : ''}</small></button>
  {/each}
  {#if questions.length > limit}<button onclick={() => limit += 80}>Show more</button>{/if}
</div>
<style>
  .navigator { padding: 1rem; display: flex; flex-direction: column; gap: .6rem; }
  input[type=search] { width: 100%; }
  details, p, small { color: var(--text-2); font-size: 12px; }
  h3 { font-size: 13px; margin: .6rem 0; } h3 span { color: var(--text-2); font-weight: 400; }
  .section-heading { display: flex; align-items: center; justify-content: space-between; }
  .section-heading button { font-size: 11px; padding: .25rem; }
  .draft-row { display: flex; align-items: center; border-radius: 6px; }
  .draft-row > input { width: auto; flex: 0 0 auto; margin: 0 .3rem; }
  .item { display: grid; gap: .4rem; text-align: left; width: 100%; min-width: 0; padding: .6rem; background: transparent; font-size: 12px; font-weight: 400; }
  .item span { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
  .active { background: color-mix(in srgb, var(--accent) 12%, var(--bg)); box-shadow: inset 2px 0 var(--accent); }
  .bank-item { border-bottom: 1px solid var(--border); border-radius: 0; }
</style>
