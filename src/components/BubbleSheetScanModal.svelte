<script lang="ts">
  import {
    analyzeBubbleSheetImage,
    bubbleWarningLabel,
    planBubbleSheetScoreUpdates,
    scoreBubbleSheetChoice,
    type BubbleSheetDetectedAnswer,
    type BubbleSheetScanResult,
    type BubbleSheetWarningCode,
  } from '../lib/bubble-sheet';
  import { gradebook } from '../lib/gradebook.svelte';
  import type { BubbleChoice, GradebookAssessment, GradebookStudent } from '../lib/types';

  interface Props {
    assessment: GradebookAssessment;
    students: GradebookStudent[];
    onclose: () => void;
  }

  type ReviewScan = BubbleSheetScanResult & {
    confirmed: boolean;
    applyMessage?: string;
  };

  let { assessment, students, onclose }: Props = $props();

  const metadata = $derived(assessment.bubbleSheet);
  let fileInputEl: HTMLInputElement | undefined = $state();
  let scans = $state<ReviewScan[]>([]);
  let processing = $state(false);
  let processingMessage = $state('');
  let applySummary = $state('');

  function openFilePicker() {
    fileInputEl?.click();
  }

  async function handleFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!metadata || files.length === 0) return;

    processing = true;
    applySummary = '';
    const next: ReviewScan[] = [];
    for (const file of files) {
      processingMessage = `Processing ${file.name}`;
      try {
        const result = await analyzeBubbleSheetImage(file, metadata, students);
        next.push({
          ...result,
          confirmed: result.matchMethod === 'student-id' || result.matchMethod === 'name-bubbles',
        });
      } catch (error) {
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          fileName: file.name,
          studentName: null,
          studentFirstName: null,
          studentLastName: null,
          studentIdCode: null,
          matchedStudentId: null,
          matchMethod: 'none',
          confidence: 0,
          warnings: ['registration'],
          answers: [],
          confirmed: false,
          applyMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
    scans = [...scans, ...next];
    processing = false;
    processingMessage = '';
    input.value = '';
  }

  function setScanStudent(scanId: string, studentId: string) {
    scans = scans.map((scan) => scan.id === scanId
      ? {
          ...scan,
          matchedStudentId: studentId || null,
          matchMethod: studentId ? 'manual' : 'none',
          confirmed: Boolean(studentId),
          applyMessage: undefined,
        }
      : scan);
  }

  function confirmScanStudent(scanId: string) {
    scans = scans.map((scan) => scan.id === scanId
      ? { ...scan, confirmed: Boolean(scan.matchedStudentId), applyMessage: undefined }
      : scan);
  }

  function setAnswer(scanId: string, questionId: string, rawChoice: string) {
    if (!metadata) return;
    const question = metadata.questions.find((item) => item.questionId === questionId);
    if (!question) return;
    const selectedChoice = rawChoice ? rawChoice as BubbleChoice : null;
    scans = scans.map((scan) => {
      if (scan.id !== scanId) return scan;
      return {
        ...scan,
        answers: scan.answers.map((answer) => answer.questionId === questionId
          ? reviewedAnswer(answer, question, selectedChoice)
          : answer),
        applyMessage: undefined,
      };
    });
  }

  function reviewedAnswer(
    answer: BubbleSheetDetectedAnswer,
    question: NonNullable<typeof metadata>['questions'][number],
    selectedChoice: BubbleChoice | null,
  ): BubbleSheetDetectedAnswer {
    const score = scoreBubbleSheetChoice(question, selectedChoice);
    return {
      ...answer,
      selectedChoice,
      status: selectedChoice ? 'valid' : 'blank',
      score,
      warnings: selectedChoice ? [] : ['blank'],
      confidence: 1,
    };
  }

  function removeScan(scanId: string) {
    scans = scans.filter((scan) => scan.id !== scanId);
  }

  function planForScan(scan: ReviewScan) {
    if (!metadata || !scan.matchedStudentId) return { updates: [], skipped: [] };
    const existing = gradebook.scoreFor(assessment.id, scan.matchedStudentId)?.questionScores ?? [];
    return planBubbleSheetScoreUpdates(metadata, scan.answers, existing);
  }

  function canApplyScan(scan: ReviewScan): boolean {
    if (!metadata || !scan.matchedStudentId || !scan.confirmed) return false;
    return planForScan(scan).updates.length > 0;
  }

  function applyReviewedScores() {
    if (!metadata) return;
    let applied = 0;
    let skipped = 0;
    scans = scans.map((scan) => {
      if (!canApplyScan(scan) || !scan.matchedStudentId) {
        return {
          ...scan,
          applyMessage: scan.matchedStudentId
            ? 'Not applied. Resolve warnings or confirm the student first.'
            : 'Not applied. Choose a student first.',
        };
      }
      const plan = planForScan(scan);
      for (const update of plan.updates) {
        gradebook.updateQuestionScore({
          sectionId: assessment.sectionId,
          assessmentId: assessment.id,
          studentId: scan.matchedStudentId,
          questionId: update.questionId,
          points: update.points,
        });
      }
      applied += plan.updates.length;
      skipped += plan.skipped.length;
      return {
        ...scan,
        applyMessage: `Applied ${plan.updates.length}; skipped ${plan.skipped.length}.`,
      };
    });
    applySummary = `Applied ${applied} MCQ scores. ${skipped} existing or unresolved scores were skipped.`;
  }

  function studentName(studentId: string | null): string {
    if (!studentId) return 'Unmatched';
    return students.find((student) => student.id === studentId)?.displayName ?? 'Unknown student';
  }

  function warningText(warnings: BubbleSheetWarningCode[]): string {
    return [...new Set(warnings)].map(bubbleWarningLabel).join(', ');
  }
</script>

<div class="modal-backdrop" role="presentation">
  <div class="bubble-modal" role="dialog" aria-modal="true" aria-label="Upload bubble sheets" tabindex="-1">
    <header class="modal-header">
      <div>
        <h2>Upload Bubble Sheets</h2>
        <span>{assessment.savedTestName}</span>
      </div>
      <button class="ghost small" type="button" onclick={onclose}>Close</button>
    </header>

    {#if !metadata}
      <div class="empty-state">This assessment does not have bubble-sheet metadata.</div>
    {:else}
      <div class="modal-toolbar">
        <div>
          <strong>Bubble sheet</strong>
          <small>
            {metadata.questions.length} MCQ questions · name bubbles{metadata.includeStudentId ? ` · ${metadata.studentCodes?.length ?? 0} student ID codes` : ''}
          </small>
        </div>
        <div class="toolbar-actions">
          <button class="primary" type="button" onclick={openFilePicker} disabled={processing}>Upload PNG/JPEG</button>
          <button class="ghost" type="button" onclick={applyReviewedScores} disabled={processing || scans.length === 0}>Apply Reviewed Scores</button>
        </div>
        <input
          bind:this={fileInputEl}
          class="hidden-file"
          type="file"
          accept=".png,.jpg,.jpeg,image/png,image/jpeg"
          multiple
          onchange={handleFiles}
        />
      </div>

      {#if processing}
        <div class="processing-row">
          <div class="spinner"></div>
          <span>{processingMessage || 'Processing scans'}</span>
        </div>
      {/if}

      {#if applySummary}
        <div class="apply-summary">{applySummary}</div>
      {/if}

      {#if scans.length === 0 && !processing}
        <div class="empty-state">Upload one or more scanned PNG/JPEG bubble sheets to review detected marks locally.</div>
      {:else}
        <div class="scan-list">
          {#each scans as scan (scan.id)}
            {@const plan = planForScan(scan)}
            <article class="scan-card">
              <div class="scan-header">
                <div>
                  <h3>{scan.fileName}</h3>
                  <span>{studentName(scan.matchedStudentId)} · confidence {Math.round(scan.confidence * 100)}%</span>
                </div>
                <button class="ghost tiny danger-text" type="button" onclick={() => removeScan(scan.id)}>Remove</button>
              </div>

              <div class="scan-meta">
                <label>
                  <span>Student</span>
                  <select value={scan.matchedStudentId ?? ''} onchange={(e) => setScanStudent(scan.id, e.currentTarget.value)}>
                    <option value="">Choose student</option>
                    {#each students as student (student.id)}
                      <option value={student.id}>{student.displayName}{student.sisId ? ` (${student.sisId})` : ''}</option>
                    {/each}
                  </select>
                </label>
                <div class="meta-pill">First: {scan.studentFirstName || '-'}</div>
                <div class="meta-pill">Last: {scan.studentLastName || '-'}</div>
                {#if metadata.includeStudentId || scan.studentIdCode}
                  <div class="meta-pill">Student ID: {scan.studentIdCode || '-'}</div>
                {/if}
                {#if scan.matchMethod === 'filename-fuzzy' && !scan.confirmed}
                  <button class="ghost small" type="button" onclick={() => confirmScanStudent(scan.id)}>Confirm Filename Match</button>
                {/if}
              </div>

              {#if scan.warnings.length > 0}
                <div class="warning-row">{warningText(scan.warnings)}</div>
              {/if}

              <div class="answer-table-wrap">
                <table class="answer-table">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Detected</th>
                      <th>Score</th>
                      <th>Warnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each scan.answers as answer (answer.questionId)}
                      {@const question = metadata.questions.find((item) => item.questionId === answer.questionId)}
                      {#if question}
                        <tr>
                          <td>Q{answer.label}</td>
                          <td>
                            <select
                              value={answer.selectedChoice ?? ''}
                              aria-label="Detected choice for question {answer.label}"
                              onchange={(e) => setAnswer(scan.id, answer.questionId, e.currentTarget.value)}
                            >
                              <option value="">Blank</option>
                              {#each question.choices as choice}
                                <option value={choice}>{choice}</option>
                              {/each}
                            </select>
                          </td>
                          <td>{answer.score === null ? '-' : `${answer.score}/${question.points}`}</td>
                          <td>{answer.warnings.length ? warningText(answer.warnings) : '-'}</td>
                        </tr>
                      {/if}
                    {/each}
                  </tbody>
                </table>
              </div>

              <div class="plan-row">
                <span>{plan.updates.length} ready</span>
                <span>{plan.skipped.length} skipped</span>
                {#if scan.applyMessage}<strong>{scan.applyMessage}</strong>{/if}
              </div>
            </article>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: rgba(0, 0, 0, 0.42);
  }

  .bubble-modal {
    width: min(1080px, 96vw);
    max-height: min(880px, 92vh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
  }

  .modal-header,
  .modal-toolbar,
  .scan-header,
  .scan-meta,
  .plan-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .modal-header {
    justify-content: space-between;
    padding: 1rem 1.1rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-2);
  }

  .modal-header h2,
  .scan-header h3 {
    margin: 0;
  }

  .modal-header span,
  .modal-toolbar small,
  .scan-header span {
    display: block;
    margin-top: 0.15rem;
    color: var(--text-2);
    font-size: 0.85rem;
  }

  .modal-toolbar {
    justify-content: space-between;
    padding: 0.9rem 1.1rem;
    border-bottom: 1px solid var(--border);
  }

  .toolbar-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .hidden-file {
    display: none;
  }

  .processing-row,
  .apply-summary,
  .empty-state {
    margin: 1rem;
    padding: 0.85rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
    color: var(--text-2);
  }

  .processing-row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .scan-list {
    overflow: auto;
    padding: 1rem;
  }

  .scan-card {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-2);
    padding: 0.85rem;
    margin-bottom: 0.85rem;
  }

  .scan-header {
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 0.75rem;
  }

  .scan-meta {
    flex-wrap: wrap;
    margin-bottom: 0.7rem;
  }

  .scan-meta label {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .scan-meta label span {
    color: var(--text-2);
    font-size: 0.82rem;
  }

  .scan-meta select,
  .answer-table select {
    background: var(--bg-input);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.35rem 0.45rem;
  }

  .meta-pill,
  .warning-row {
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.28rem 0.55rem;
    font-size: 0.82rem;
    color: var(--text-2);
    background: var(--bg);
  }

  .warning-row {
    display: inline-block;
    border-color: color-mix(in srgb, var(--danger, #dc2626) 45%, var(--border));
    color: var(--danger, #dc2626);
    border-radius: 6px;
    margin-bottom: 0.75rem;
  }

  .answer-table-wrap {
    max-height: 310px;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
  }

  .answer-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .answer-table th,
  .answer-table td {
    padding: 0.45rem 0.55rem;
    border-bottom: 1px solid var(--border);
    text-align: left;
  }

  .answer-table th {
    position: sticky;
    top: 0;
    background: var(--bg-2);
    z-index: 1;
  }

  .plan-row {
    justify-content: flex-end;
    margin-top: 0.65rem;
    color: var(--text-2);
    font-size: 0.86rem;
  }

  .plan-row strong {
    color: var(--text);
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
