<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { portal } from '../../lib/portal';
  import { buildGradebookReports, gradebookReportComments, gradebookReportCommentsText, gradebookReportsHtml, reportNumber } from '../../lib/gradebook-reports';
  import { printHtml } from '../../lib/print-html';
  import type { Class, GradebookData } from '../../lib/types';
  let { data, sectionId, studentIds, assessmentIds, curriculum = [], scope, singleStudent = false, onclose }: {
    data: GradebookData; sectionId: string; studentIds: string[]; assessmentIds?: string[]; curriculum?: Class[]; scope: string; singleStudent?: boolean; onclose: () => void;
  } = $props();
  let dialog: HTMLDialogElement;
  let kind = $state<'progress' | 'missing' | 'outcomes'>('progress');
  let strengthThreshold = $state(70);
  let includeIncomplete = $state(false);
  let includeUngraded = $state(false);
  let includeNotes = $state(true);
  let includeInactive = $state(false);
  let previewIndex = $state(0);
  let printing = $state(false);
  let error = $state('');
  let copyStatus = $state('');
  let copiedCell = $state('');
  let copiedTableSnapshot = $state('');
  const generatedAt = Date.now();
  const reports = $derived(buildGradebookReports(data, { sectionId, studentIds, assessmentIds, kind, includeIncomplete, includeUngraded, includeNotes,
    includeInactive: singleStudent || includeInactive, generatedAt, curriculum, strengthThreshold }));
  const comments = $derived(gradebookReportComments(reports));
  const commentsText = $derived(gradebookReportCommentsText(comments));
  const preview = $derived(reports[Math.min(previewIndex, Math.max(0, reports.length - 1))]);
  const html = $derived(preview ? gradebookReportsHtml([preview]) : '');
  $effect(() => {
    if (copiedTableSnapshot && copiedTableSnapshot !== commentsText) {
      copiedCell = '';
      copiedTableSnapshot = '';
      copyStatus = '';
    }
  });
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
    const filename = kind === 'missing' ? 'missing-work' : kind === 'outcomes' ? 'curricular-outcomes' : 'student-progress';
    const link = document.createElement('a'); link.href = url; link.download = `${filename}-${new Date(generatedAt).toISOString().slice(0, 10)}.html`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function writeClipboard(value: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const fallback = document.createElement('textarea');
      fallback.value = value;
      fallback.setAttribute('readonly', '');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.append(fallback);
      fallback.select();
      const copied = document.execCommand('copy');
      fallback.remove();
      if (!copied) return false;
    }
    return true;
  }
  async function copyCell(value: string, cell: string, label: string) {
    if (!value) return;
    if (!await writeClipboard(value)) { copiedCell = ''; copyStatus = 'Could not copy automatically. Allow clipboard access in your browser, then try again.'; return; }
    copiedCell = cell;
    copiedTableSnapshot = commentsText;
    copyStatus = `Copied ${label}.`;
  }
  async function copyComments() {
    if (!commentsText) return;
    if (!await writeClipboard(commentsText)) { copiedCell = ''; copyStatus = 'Could not copy the table automatically. Allow clipboard access in your browser, then try again.'; return; }
    copiedCell = '';
    copiedTableSnapshot = commentsText;
    copyStatus = `Copied ${comments.length} student row${comments.length === 1 ? '' : 's'} with column headings.`;
  }
</script>

<dialog bind:this={dialog} use:portal aria-label="Gradebook reports" aria-modal="true" oncancel={event => { event.preventDefault(); onclose(); }}>
  <header><div><h2>Student reports</h2><p>{scope}</p></div><button type="button" onclick={onclose} aria-label="Close reports">Close</button></header>
  <div class="report-controls">
    <label>Report type<select aria-label="Report type" bind:value={kind} onchange={() => previewIndex = 0}><option value="progress">Progress report</option><option value="outcomes">Curricular outcomes</option><option value="missing">Missing-work report</option></select></label>
    {#if kind === 'outcomes'}<label>Strength starts at<div class="threshold"><input type="number" min="0" max="100" step="1" aria-label="Strength threshold percentage" bind:value={strengthThreshold} /><span>%</span></div></label>{/if}
    {#if kind === 'missing'}<label class="check"><input type="checkbox" bind:checked={includeIncomplete} /> Include Incomplete</label><label class="check"><input type="checkbox" bind:checked={includeUngraded} /> Include Ungraded</label>{/if}
    <label class="check"><input type="checkbox" bind:checked={includeNotes} /> Include notes marked For reports</label>
    {#if !singleStudent}<label class="check"><input type="checkbox" bind:checked={includeInactive} /> Include inactive students</label>{/if}
  </div>
  <p class="scope" role="status">{reports.length} report{reports.length === 1 ? '' : 's'} from {studentIds.length} selected student{studentIds.length === 1 ? '' : 's'}.{kind === 'missing' ? ' Students with no matching work are omitted. Ungraded work is not treated as Missing.' : kind === 'outcomes' ? ' Outcome evidence uses entered per-question marks from the selected assessments.' : ''} Each student's report starts on a new page.</p>
  {#if kind === 'outcomes'}
    <section class="comment-export" aria-label="Copyable student comments">
      <header><div><h3>Report card table</h3><p>Click any cell to copy only that value. Each comment is one student's complete curricular report.</p></div><button type="button" onclick={copyComments} disabled={!comments.length}>Copy whole table</button></header>
      {#if comments.length}
        <div class="comment-table-wrap">
          <table class="comment-table" aria-label="Student report card comments">
            <thead><tr><th scope="col">Student</th><th scope="col">Comment</th><th scope="col">Final grade</th></tr></thead>
            <tbody>{#each comments as comment}
              {@const grade = comment.finalPercent === null ? '—' : `${reportNumber(comment.finalPercent)}%`}
              <tr>
                <td><button type="button" class:copied={copiedCell === `${comment.studentId}:name`} onclick={() => copyCell(comment.studentName, `${comment.studentId}:name`, `${comment.studentName}'s name`)} aria-label={`Copy ${comment.studentName}'s name`}>{comment.studentName}</button></td>
                <td>{#if comment.text}<button type="button" class:copied={copiedCell === `${comment.studentId}:comment`} onclick={() => copyCell(comment.text, `${comment.studentId}:comment`, `${comment.studentName}'s comment`)} aria-label={`Copy ${comment.studentName}'s comment`}>{comment.text}</button>{:else}<span class="empty-cell">No outcome evidence</span>{/if}</td>
                <td><button type="button" class:copied={copiedCell === `${comment.studentId}:grade`} onclick={() => copyCell(grade, `${comment.studentId}:grade`, `${comment.studentName}'s final grade`)} aria-label={`Copy ${comment.studentName}'s final grade`}>{grade}</button></td>
              </tr>
            {/each}</tbody>
          </table>
        </div>
      {:else}<p class="no-comments">Comments appear when students have outcome evidence.</p>{/if}
      <p class="copy-note" aria-live="polite">{copyStatus || 'Curriculum nicknames provide the readable wording; tailored next steps are used when available. Edit them in Bank → Curriculum.'}</p>
    </section>
  {/if}
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
  .threshold { display: flex; align-items: center; gap: .3rem; } .threshold input { width: 5.5rem; }
  .scope { padding: 0 1rem; } .report-preview { display: block; width: calc(100% - 2rem); height: min(57dvh, 650px); min-height: 280px; margin: .5rem 1rem; background: white; border: 1px solid var(--border); border-radius: 4px; }
  .comment-export { margin: .65rem 1rem; padding: .7rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-2); display: grid; gap: .5rem; }
  .comment-export header { padding: 0; border: 0; align-items: start; }
  .comment-export h3 { margin: 0; font-size: 14px; }
  .comment-export header p, .copy-note { margin: .15rem 0 0; color: var(--text-2); font-size: 11px; line-height: 1.4; }
  .comment-table-wrap { max-height: 16rem; overflow: auto; border: 1px solid var(--border); background: var(--bg); }
  .comment-table { width: 100%; min-width: 620px; border-collapse: collapse; font-size: 12px; }
  .comment-table th { position: sticky; top: 0; z-index: 1; padding: .45rem .55rem; text-align: left; background: var(--bg-2); border-bottom: 1px solid var(--border); }
  .comment-table th:last-child { white-space: nowrap; }
  .comment-table td { padding: 0; vertical-align: top; border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); }
  .comment-table td:last-child { border-right: 0; }
  .comment-table tbody tr:last-child td { border-bottom: 0; }
  .comment-table td button { width: 100%; height: 100%; min-height: 2.5rem; padding: .5rem .55rem; border: 0; border-radius: 0; background: transparent; color: var(--text); text-align: left; font: inherit; line-height: 1.4; cursor: copy; }
  .comment-table td:last-child button { white-space: nowrap; }
  .comment-table td button:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .comment-table td button:focus-visible { position: relative; z-index: 2; outline: 2px solid var(--accent); outline-offset: -2px; }
  .comment-table td button.copied { background: color-mix(in srgb, var(--accent) 16%, transparent); box-shadow: inset 3px 0 var(--accent); }
  .empty-cell { display: block; padding: .5rem .55rem; color: var(--text-2); font-style: italic; }
  .no-comments { margin: .5rem; color: var(--text-2); font-size: 12px; }
  footer { border-top: 1px solid var(--border); position: sticky; bottom: 0; background: var(--bg); } footer p { flex: 1; min-width: 180px; }
  .empty { padding: 2rem; text-align: center; color: var(--text-2); } .error { color: var(--danger); padding: 0 1rem; font-size: 12px; }
  @media(max-width: 600px) { dialog { width: calc(100vw - 1rem); } .preview-controls { display: block; } .report-preview { min-height: 220px; } }
</style>
