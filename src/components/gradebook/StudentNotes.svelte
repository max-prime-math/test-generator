<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { gradebook } from '../../lib/gradebook.svelte';
  import type { GradebookStudentNote } from '../../lib/types';
  let { sectionId, studentId, sectionName }: { sectionId: string; studentId: string; sectionName: string } = $props();
  const draftKey = untrack(() => `tg-gradebook-note-draft-v1:${sectionId}:${studentId}`);
  function readDraft(): { text?: string; includeInReports?: boolean; id?: string; expectedUpdatedAt?: number } {
    try { return JSON.parse(localStorage.getItem(draftKey) ?? '{}') ?? {}; } catch { return {}; }
  }
  const draft = readDraft();
  let text = $state(typeof draft.text === 'string' ? draft.text : '');
  let includeInReports = $state(draft.includeInReports === true);
  let editingId = $state(typeof draft.id === 'string' ? draft.id : '');
  let expectedUpdatedAt = $state<number | undefined>(draft.expectedUpdatedAt);
  let error = $state('');
  let recoveryError = $state('');
  let status = $state(draft.text ? 'Recovered a note draft from this browser.' : '');
  let textarea: HTMLTextAreaElement;
  const notes = $derived(gradebook.studentNotes.filter(note => note.sectionId === sectionId && note.studentId === studentId).sort((a, b) => b.createdAt - a.createdAt));
  $effect(() => {
    const json = text ? JSON.stringify({ text, includeInReports, id: editingId, expectedUpdatedAt }) : '';
    untrack(() => {
      try { if (json) localStorage.setItem(draftKey, json); else localStorage.removeItem(draftKey); recoveryError = ''; }
      catch { recoveryError = 'The note draft could not be kept in this browser. Keep this page open and save the note to retry.'; }
    });
  });
  function edit(note: GradebookStudentNote) {
    editingId = note.id; expectedUpdatedAt = note.updatedAt; text = note.text; includeInReports = note.includeInReports;
    error = status = ''; textarea?.focus();
  }
  function save(asNew = false) {
    try {
      gradebook.saveStudentNote({ sectionId, studentId, text, includeInReports, id: !asNew && editingId ? editingId : undefined, expectedUpdatedAt });
      text = ''; includeInReports = false; editingId = ''; expectedUpdatedAt = undefined;
      error = ''; status = 'Note saved to Gradebook in this browser.';
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  }
  function action(work: () => void, message: string) {
    const trigger = document.activeElement;
    try {
      work(); status = message; error = '';
      void tick().then(() => { if (trigger && !trigger.isConnected) textarea?.focus(); });
    } catch (cause) { error = String(cause); }
  }
</script>

<section class="student-notes" aria-label="Student notes">
  <div class="heading"><h2>Student notes</h2><span>{sectionName}</span></div>
  <p class="hint">Teacher-only unless marked <strong>For reports</strong>. Saved notes stay with this student's record in this section.</p>
  <form onsubmit={event => { event.preventDefault(); save(); }}>
    <label for={`note-${studentId}`}>{editingId ? 'Edit note' : 'New note'}</label>
    <textarea id={`note-${studentId}`} aria-label="Student note" bind:this={textarea} bind:value={text} rows="4" placeholder="Observations, next steps, or a conversation to follow up…" oninput={() => status = ''}></textarea>
    <label class="check"><input type="checkbox" bind:checked={includeInReports} /> For reports — include this note when printing student reports</label>
    <div class="actions"><button type="submit" class="primary" disabled={!text.trim()}>{editingId ? 'Save note changes' : 'Save note'}</button>
      {#if editingId}<button type="button" onclick={() => save(true)} disabled={!text.trim()}>Save as new note</button><button type="button" onclick={() => { editingId = ''; text = ''; includeInReports = false; expectedUpdatedAt = undefined; error = ''; }}>Cancel edit</button>{/if}
    </div>
    {#if text}<p class="hint">Unsaved note draft · kept only in this browser until you save.</p>{/if}
  </form>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if recoveryError}<p class="error" role="alert">{recoveryError}</p>{/if}
  {#if status}<p class="hint" role="status">{status}</p>{/if}
  <div class="notes-list">
    {#each notes.filter(note => !note.trashedAt) as note (note.id)}
      <article class="note" data-note-id={note.id}>
        <header><time datetime={new Date(note.createdAt).toISOString()}>{new Date(note.createdAt).toLocaleString()}</time><strong>{note.includeInReports ? 'For reports' : 'Teacher-only'}</strong></header>
        <p class="note-text">{note.text}</p>
        <div class="actions"><button type="button" disabled={!!text} onclick={() => edit(note)}>Edit note</button>
          {#if note.previous}<button type="button" onclick={() => action(() => gradebook.undoNoteEdit(note.id), 'Previous note version restored. You can switch versions again.')}>Undo last edit</button>{/if}
          <button type="button" onclick={() => action(() => gradebook.setNoteTrashed(note.id, true), 'Note moved to Trash. Restore it below at any time.')}>Move note to Trash</button>
        </div>
      </article>
    {:else}<p class="hint">No saved notes in this section.</p>{/each}
  </div>
  {#if notes.some(note => note.trashedAt)}<details><summary>Notes in Trash ({notes.filter(note => note.trashedAt).length})</summary>
    {#each notes.filter(note => note.trashedAt) as note (note.id)}<article class="note"><p class="note-text">{note.text}</p><button type="button" onclick={() => action(() => gradebook.setNoteTrashed(note.id, false), 'Note restored.')}>Restore note</button></article>{/each}
  </details>{/if}
</section>

<style>
  .student-notes { border: 1px solid var(--border); border-radius: 10px; padding: 1rem; background: var(--bg-2); min-width: 0; }
  .heading, header, .actions { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem; }
  .heading { justify-content: space-between; } h2 { font-size: 15px; margin: 0; }
  .heading span, .hint, header { font-size: 12px; color: var(--text-2); line-height: 1.5; }
  form { display: grid; gap: .5rem; margin: .75rem 0; } form > label { font-size: 12px; }
  textarea { width: 100%; resize: vertical; min-height: 90px; line-height: 1.5; font-family: inherit; }
  .check { display: flex; gap: .5rem; align-items: start; } input[type=checkbox] { width: auto; }
  .note { padding: .75rem; border: 1px solid var(--border); border-radius: 6px; margin-top: .6rem; }
  header { justify-content: space-between; } header strong { font-weight: 500; }
  .note-text { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; margin: .6rem 0; }
  button { font-size: 12px; } summary { cursor: pointer; font-size: 12px; margin-top: .75rem; }
  .error { color: var(--danger); font-size: 12px; }
</style>
