<script lang="ts">
  import { workspaceCatalog } from '../lib/workspace-catalog.svelte';
  import { CLASSES } from '../lib/curriculum';
  import { mergeWorkspaceClasses } from '../lib/workspace-format';
  let query = $state('');
  let classId = $state('');
  let bankId = $state('');
  const classes = $derived(mergeWorkspaceClasses([...CLASSES, ...workspaceCatalog.classes]));
  const results = $derived(workspaceCatalog.questions.filter(q => (!classId || q.classId === classId)
    && (!bankId || workspaceCatalog.sources[q.id]?.bankId === bankId)
    && (!query.trim() || `${q.body} ${q.narrative ?? ''} ${q.tags.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()))));
  function add(id: string) {
    window.dispatchEvent(new CustomEvent('tg-add-workspace-question', { detail: id }));
    window.location.hash = '/build';
  }
</script>

{#if workspaceCatalog.banks.length}
  <details class="workspace-search">
    <summary>Search all workspace banks ({workspaceCatalog.banks.length})</summary>
    <p>Search across banks by class. Originals stay in their source bank; adding to a test does not move them.</p>
    <div class="filters">
      <input aria-label="Search workspace questions" type="search" placeholder="Search questions across banks…" bind:value={query} />
      <select aria-label="Workspace class filter" bind:value={classId}>
        <option value="">All classes</option>
        {#each classes as cls}<option value={cls.id}>{cls.name}</option>{/each}
      </select>
      <select aria-label="Workspace bank filter" bind:value={bankId}>
        <option value="">All banks</option>
        {#each workspaceCatalog.banks as bank}<option value={bank.id}>{bank.name}</option>{/each}
      </select>
    </div>
    <p>{results.length} matching questions{results.length > 100 ? ' (first 100 shown; narrow your search)' : ''}</p>
    <ul>
      {#each results.slice(0, 100) as question (question.id)}
        <li>
          <div><strong>{workspaceCatalog.sources[question.id]?.bankName}</strong> · {question.points} points
            <p>{question.body.slice(0, 220)}{question.body.length > 220 ? '…' : ''}</p>
          </div>
          <button onclick={() => add(question.id)}>Add to test</button>
        </li>
      {/each}
    </ul>
  </details>
{/if}

<style>
  .workspace-search { padding: .75rem; border: 1px solid var(--border); border-radius: 8px; margin: .5rem; }
  summary { cursor: pointer; font-weight: 600; }
  p { font-size: .85rem; margin: .5rem 0; }
  .filters { display: flex; flex-wrap: wrap; gap: .5rem; }
  input { min-width: 12rem; flex: 1; }
  ul { padding: 0; max-height: 24rem; overflow: auto; }
  li { list-style: none; display: flex; gap: 1rem; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding: .6rem; }
  li div { min-width: 0; overflow-wrap: anywhere; }
  button { flex-shrink: 0; }
</style>
