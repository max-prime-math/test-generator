<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { portal } from '../../lib/portal';
  import { buildGradebookReports, gradebookReportsHtml } from '../../lib/gradebook-reports';
  import { printHtml } from '../../lib/print-html';
  import type { GradebookData } from '../../lib/types';
  let { data, sectionId, studentIds, assessmentIds, scope, singleStudent = false, onclose }: {
    data: GradebookData; sectionId: string; studentIds: string[]; assessmentIds?: string[]; scope: string; singleStudent?: boolean; onclose: () => void;
  } = $props();
  let dialog: HTMLDialogElement;
  let kind = $state<'progress' | 'missing'>('progress');
  let includeIncomplete = $state(false);
  let includeUngraded = $state(false);
  let includeNotes = $state(true);
  let includeInactive = $state(false);
  let previewIndex = $state(0);
  let printing = $state(false);
  let error = $state('');
  const generatedAt = Date.now();
  const reports = $derived(buildGradebookReports(data, { sectionId, studentIds, assessmentIds, kind, includeIncomplete, includeUngraded, includeNotes,
    includeInactive: singleStudent || includeInactive, generatedAt }));
  const preview = $derived(reports[Math.min(previewIndex, Math.max(0, reports.length - 1))]);
  const html = $derived(preview ? gradebookReportsHtml([preview]) : '');
  onMount(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { void tick().then(() => { if (opener?.isConnected) opener.focus(); }); };
  });
  async function print() {
    printing = true; error = '';
    try { await printHtml(gradebookReportsHtml(reports)); } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { printing = false; }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([gradebookReportsHtml(reports)], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${kind === 'missing' ? 'missing-work' : 'student-progress'}-${new Date(generatedAt).toISOString().slice(0, 10)}.html`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<dialog bind:this={dialog} use:portal aria-label="Gradebook reports" aria-modal="true" oncancel={event => { event.preventDefault(); onclose(); }}>
  <header><div><h2>Student reports</h2><p>{scope}</p></div><button type="button" onclick={onclose} aria-label="Close reports">Close</button></header>
  <div class="report-controls">
    <label>Report type<select aria-label="Report type" bind:value={kind} onchange={() => previewIndex = 0}><option value="progress">Progress report</option><option value="missing">Missing-work report</option></select></label>
    {#if kind === 'missing'}<label class="check"><input type="checkbox" bind:checked={includeIncomplete} /> Include Incomplete</label><label class="check"><input type="checkbox" bind:checked={includeUngraded} /> Include Ungraded</label>{/if}
    <label class="check"><input type="checkbox" bind:checked={includeNotes} /> Include notes marked For reports</label>
    {#if !singleStudent}<label class="check"><input type="checkbox" bind:checked={includeInactive} /> Include inactive students</label>{/if}
  </div>
  <p class="scope" role="status">{reports.length} report{reports.length === 1 ? '' : 's'} from {studentIds.length} selected student{studentIds.length === 1 ? '' : 's'}.{kind === 'missing' ? ' Students with no matching work are omitted. Ungraded work is not treated as Missing.' : ''} Each student's report starts on a new page.</p>
  {#if reports.length}
    <div class="preview-controls"><label>Preview student<select aria-label="Preview report student" value={preview?.studentId} onchange={event => previewIndex = reports.findIndex(report => report.studentId === event.currentTarget.value)}>{#each reports as report}<option value={report.studentId}>{report.studentName}</option>{/each}</select></label><span>Course grade always uses all assessments in this section.</span></div>
    <iframe class="report-preview" title={`Report preview for ${preview.studentName}`} srcdoc={html} sandbox=""></iframe>
  {:else}<div class="empty">No reports match these options. Change the report type or include additional score states.</div>{/if}
  {#if error}<p role="alert" class="error">{error}</p>{/if}
  <footer><p>Print opens your browser's print dialog, where you can choose Save as PDF.</p><button type="button" disabled={!reports.length} onclick={download}>Download HTML</button><button type="button" class="primary" disabled={!reports.length || printing} onclick={print}>{printing ? 'Opening print…' : `Print ${reports.length === 1 ? 'report' : `${reports.length} reports`}`}</button></footer>
</dialog>

<style>
  dialog { width: min(1040px, calc(100vw - 2rem)); max-width: calc(100vw - 1rem); max-height: calc(100dvh - 2rem); margin: auto; padding: 0; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); color: var(--text); overflow-y: auto; }
  dialog::backdrop { background: #0009; } header, footer { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; padding: 1rem; }
  header { justify-content: space-between; border-bottom: 1px solid var(--border); } h2 { margin: 0; font-size: 18px; }
  header p, footer p, .scope, .preview-controls span { font-size: 12px; color: var(--text-2); margin: .3rem 0 0; line-height: 1.5; }
  .report-controls, .preview-controls { padding: .75rem 1rem; display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; }
  label { display: grid; gap: .3rem; font-size: 12px; } .check { display: flex; align-items: center; gap: .4rem; } input[type=checkbox] { width: auto; }
  .scope { padding: 0 1rem; } .report-preview { display: block; width: calc(100% - 2rem); height: min(57dvh, 650px); min-height: 280px; margin: .5rem 1rem; background: white; border: 1px solid var(--border); border-radius: 4px; }
  footer { border-top: 1px solid var(--border); position: sticky; bottom: 0; background: var(--bg); } footer p { flex: 1; min-width: 180px; }
  .empty { padding: 2rem; text-align: center; color: var(--text-2); } .error { color: var(--danger); padding: 0 1rem; font-size: 12px; }
  @media(max-width: 600px) { dialog { width: calc(100vw - 1rem); } .preview-controls { display: block; } .report-preview { min-height: 220px; } }
</style>
