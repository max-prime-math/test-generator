<script lang="ts">
  import { untrack } from 'svelte';
  import { gradebook } from '../../lib/gradebook.svelte';
  import { calculateStudentGrade } from '../../lib/gradebook-calculations';
  import { GRADEBOOK_CATEGORIES, normalizeDroppedScorePolicy, describeDroppedScorePolicy, type DroppedScorePolicy } from '../../lib/gradebook-policies';
  import { studentKnownBy } from '../../lib/gradebook-model';
  let { sectionId }: { sectionId: string } = $props();
  const section = $derived(gradebook.sections.find(item => item.id === sectionId));
  const draftKey = untrack(() => `tg-gradebook-drop-policy-draft-v1:${sectionId}`);
  const initial = untrack(() => normalizeDroppedScorePolicy(section?.droppedScorePolicy));
  function readDraft(): { baseline?: DroppedScorePolicy; values?: Record<string, string> } {
    try { return JSON.parse(localStorage.getItem(draftKey) ?? '{}') ?? {}; } catch { return {}; }
  }
  const recovered = readDraft();
  const valuesFor = (policy: DroppedScorePolicy) => Object.fromEntries(GRADEBOOK_CATEGORIES.map(category => [category, String(policy[category] ?? 0)]));
  let baseline = $state(normalizeDroppedScorePolicy(recovered.baseline ?? initial));
  let values = $state<Record<string, string>>(Object.fromEntries(GRADEBOOK_CATEGORIES.map(category => [category, typeof recovered.values?.[category] === 'string' ? recovered.values[category] : String(initial[category] ?? 0)])));
  let error = $state('');
  let recoveryError = $state('');
  let status = $state(recovered.values ? 'Recovered a drop-policy draft from this browser.' : '');
  const invalid = $derived(GRADEBOOK_CATEGORIES.some(category => !/^\d+$/.test(values[category]) || !Number.isSafeInteger(Number(values[category]))));
  const draft = $derived(normalizeDroppedScorePolicy(Object.fromEntries(GRADEBOOK_CATEGORIES.map(category => [category, Number(values[category])]))));
  const dirty = $derived(invalid || JSON.stringify(draft) !== JSON.stringify(baseline));
  const stale = $derived(JSON.stringify(normalizeDroppedScorePolicy(section?.droppedScorePolicy)) !== JSON.stringify(baseline));
  $effect(() => {
    const latest = section;
    untrack(() => { if (latest && !dirty) { baseline = normalizeDroppedScorePolicy(latest.droppedScorePolicy); values = valuesFor(baseline); } });
  });
  $effect(() => {
    const saved = dirty ? JSON.stringify({ baseline, values }) : '';
    untrack(() => {
      try { if (saved) localStorage.setItem(draftKey, saved); else localStorage.removeItem(draftKey); recoveryError = ''; }
      catch { recoveryError = 'This policy draft could not be kept in browser storage. Keep this page open and retry saving.'; }
    });
  });
  const preview = $derived.by(() => {
    if (!section || invalid) return [];
    const assessments = gradebook.assessments.filter(item => item.sectionId === sectionId);
    const scores = new Map(gradebook.scores.filter(item => item.sectionId === sectionId).map(score => [`${score.studentId}:${score.assessmentId}`, score]));
    const enrolled = new Set(gradebook.enrollments.filter(item => item.sectionId === sectionId).map(item => item.studentId));
    return gradebook.students.filter(student => enrolled.has(student.id)).map(student => {
      const scoreFor = (id: string) => scores.get(`${student.id}:${id}`);
      const current = calculateStudentGrade(section, assessments, scoreFor);
      const proposed = calculateStudentGrade({ ...section, droppedScorePolicy: draft }, assessments, scoreFor);
      return { id: student.id, name: `${studentKnownBy(student)} ${student.lastName}`, before: current.finalPercent, after: proposed.finalPercent,
        dropped: assessments.filter(item => proposed.droppedAssessmentIds.has(item.id)).map(item => item.savedTestName),
        changed: current.finalPercent !== proposed.finalPercent || [...current.droppedAssessmentIds].sort().join() !== [...proposed.droppedAssessmentIds].sort().join() };
    });
  });
  const affected = $derived(preview.filter(item => item.changed));
  let previewStudentId = $state('');
  const selectedPreview = $derived(preview.find(item => item.id === previewStudentId) ?? affected[0] ?? preview[0]);
  const percent = (value: number | null) => value === null ? '—' : `${Number(value.toFixed(1))}%`;
  function reload() { baseline = normalizeDroppedScorePolicy(section?.droppedScorePolicy); values = valuesFor(baseline); error = ''; status = 'Current saved policy loaded.'; }
  function save() {
    if (invalid) return;
    try {
      gradebook.setDroppedScorePolicy(sectionId, draft, baseline);
      baseline = normalizeDroppedScorePolicy(draft); values = valuesFor(baseline); error = ''; status = 'Drop policy saved to Gradebook in this browser.';
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  }
  function restore() {
    try { gradebook.restoreDroppedScorePolicy(sectionId, baseline); reload(); status = 'Previous drop policy restored. You can switch back again.'; }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  }
</script>

<section class="drop-policy" aria-label="Dropped score policy">
  <h3 tabindex="-1">Drop lowest scores</h3>
  <p>{describeDroppedScorePolicy(section?.droppedScorePolicy)}</p>
  <p>For each student, drop up to this many lowest <strong>percentages</strong> in each category. Always keep at least one counted score. Recorded marks stay editable.</p>
  <form onsubmit={event => { event.preventDefault(); save(); }}>
    <div class="drop-counts">
      {#each GRADEBOOK_CATEGORIES as category}
        <label><span>{category[0].toUpperCase() + category.slice(1)}</span><input type="number" min="0" step="1" aria-label={`Drop lowest ${category} scores`} value={values[category]} oninput={event => { values[category] = event.currentTarget.value; error = status = ''; }} /></label>
      {/each}
    </div>
    <p>Only scores that otherwise count are eligible. Missing is eligible when it counts as zero; Ungraded, Excused, Absent, and Incomplete stay excluded. Ties use assessment date, then creation order and ID.</p>
    {#if invalid}<p class="error" role="alert">Use a whole number of zero or more for each category.</p>{/if}
    {#if stale && dirty}<p class="error" role="alert">The saved policy changed elsewhere. Your draft is kept. Reloading the current policy will replace this draft.</p>{/if}
    {#if dirty && !invalid}
      <div class="policy-preview" aria-label="Drop policy preview">
        <strong>Unsaved preview</strong><p>{affected.length} of {preview.length} students have changed grades or dropped-score selections. Includes inactive students.</p>
        {#if selectedPreview}
          <label>Preview student<select aria-label="Preview drop policy student" value={selectedPreview.id} onchange={event => previewStudentId = event.currentTarget.value}>{#each preview as item}<option value={item.id}>{item.name}</option>{/each}</select></label>
          <p>{selectedPreview.name}: <strong>{percent(selectedPreview.before)} → {percent(selectedPreview.after)}</strong></p>
          <p>Would drop: {selectedPreview.dropped.join(', ') || 'No eligible scores'}</p>
        {/if}
        <p>The preview changes no recorded scores or saved grades.</p>
      </div>
    {/if}
    <div class="actions"><button class="primary small" type="submit" disabled={!dirty || invalid || stale}>Save drop policy</button><button class="ghost small" type="button" disabled={!dirty && !stale} onclick={reload}>{stale ? 'Discard draft and reload' : 'Cancel policy changes'}</button>
      <button class="ghost small" type="button" onclick={() => { values = valuesFor({}); error = status = ''; }} disabled={!Object.keys(draft).length}>Turn off all drops</button>
      {#if section?.previousDroppedScorePolicy !== undefined}<button class="ghost small" type="button" disabled={dirty || stale} onclick={restore}>Restore previous policy</button>{/if}
    </div>
  </form>
  {#if dirty}<p role="status">Unsaved policy draft · kept only in this browser.</p>{/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if recoveryError}<p class="error" role="alert">{recoveryError}</p>{/if}
</section>

<style>
  .drop-policy { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border); }
  h3 { font-size: 13px; margin: 0 0 8px; scroll-margin-top: 52px; } p { font-size: 11px; color: var(--text-2); line-height: 1.55; margin: 8px 0; overflow-wrap: anywhere; }
  .drop-counts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  label { display: grid; gap: 4px; font-size: 12px; min-width: 0; } input, select { width: 100%; min-width: 0; box-sizing: border-box; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; } button { font-size: 11px; }
  .policy-preview { border: 1px solid var(--border); background: var(--bg-2); border-radius: 6px; padding: 10px; margin: 10px 0; font-size: 12px; }
  .error { color: var(--danger); }
</style>
