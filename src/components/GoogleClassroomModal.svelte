<script lang="ts">
  import { onMount } from 'svelte';
  import {
    googleClassroom,
    type ClassroomCourse,
    type ClassroomCourseWork,
    type ClassroomGradePushResult,
  } from '../lib/google-classroom.svelte';
  import { gradebook } from '../lib/gradebook.svelte';

  interface Props {
    assessmentId?: string;
    onclose: () => void;
  }

  const { assessmentId = '', onclose }: Props = $props();

  const envClientId = import.meta.env.VITE_GOOGLE_CLASSROOM_CLIENT_ID?.trim()
    || import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()
    || '';

  let clientId = $state(envClientId || googleClassroom.clientId);
  let selectedAssessmentId = $state('');
  let selectedCourseId = $state('');
  let selectedCourseWorkId = $state('');
  let dueDate = $state(defaultDueDate());
  let courses = $state<ClassroomCourse[]>([]);
  let courseWork = $state<ClassroomCourseWork[]>([]);
  let loading = $state(false);
  let action = $state<'courses' | 'work' | 'connect' | 'create' | 'link' | 'grades' | null>(null);
  let message = $state<string | null>(null);
  let error = $state<string | null>(null);
  let pushResult = $state<ClassroomGradePushResult | null>(null);

  let assessments = $derived(gradebook.assessments);
  let selectedAssessment = $derived(assessments.find((item) => item.id === selectedAssessmentId) ?? assessments[0] ?? null);
  let selectedSection = $derived(selectedAssessment ? gradebook.sections.find((section) => section.id === selectedAssessment.sectionId) ?? null : null);
  let sectionStudents = $derived(selectedAssessment ? gradebook.studentsForSection(selectedAssessment.sectionId, { includeInactive: true }) : []);
  let assessmentScores = $derived(selectedAssessment ? gradebook.scores.filter((score) => score.assessmentId === selectedAssessment.id) : []);
  let selectedCourse = $derived(courses.find((course) => course.id === selectedCourseId) ?? null);
  let selectedCourseWork = $derived(courseWork.find((work) => work.id === selectedCourseWorkId) ?? null);
  let classroomLinks = $derived(googleClassroom.links);
  let existingLink = $derived.by(() => {
    if (!selectedAssessment) return null;
    classroomLinks;
    return (
      googleClassroom.findLink('assessment', selectedAssessment.id)
      ?? googleClassroom.findLink('saved-test', selectedAssessment.savedTestId)
    );
  });
  let canPushGrades = $derived(Boolean(selectedAssessment && (existingLink || selectedCourseWork)));
  let unmatchedLocalStudents = $derived(sectionStudents.filter((student) => student.active && !student.email).length);

  onMount(() => {
    selectedAssessmentId = assessmentId || assessments[0]?.id || '';
    if (googleClassroom.authenticated) void loadCourses(false);
  });

  $effect(() => {
    if (selectedAssessment && dueDate === '') dueDate = formatDateInput(selectedAssessment.administeredAt);
  });

  async function connect() {
    await run('connect', async () => {
      await googleClassroom.connect({ clientId: clientId.trim() });
      message = 'Connected to Google Classroom.';
      await loadCourses(false);
    });
  }

  async function loadCourses(showMessage = true) {
    await run('courses', async () => {
      courses = await googleClassroom.listCourses();
      const preferredCourseId = existingLink?.courseId ?? selectedCourseId;
      selectedCourseId = courses.find((course) => course.id === preferredCourseId)?.id ?? courses[0]?.id ?? '';
      if (selectedCourseId) await loadCourseWork(false);
      if (showMessage) message = `Loaded ${courses.length} Classroom course${courses.length === 1 ? '' : 's'}.`;
    });
  }

  async function loadCourseWork(showMessage = true) {
    if (!selectedCourseId) return;
    await run('work', async () => {
      courseWork = await googleClassroom.listCourseWork(selectedCourseId);
      const preferredWorkId = existingLink?.courseId === selectedCourseId ? existingLink.courseWorkId : selectedCourseWorkId;
      selectedCourseWorkId = courseWork.find((work) => work.id === preferredWorkId)?.id ?? courseWork[0]?.id ?? '';
      if (showMessage) message = `Loaded ${courseWork.length} assignment${courseWork.length === 1 ? '' : 's'}.`;
    });
  }

  async function createAssignment() {
    if (!selectedAssessment || !selectedCourse) return;
    await run('create', async () => {
      const work = await googleClassroom.createCourseWork({
        course: selectedCourse,
        assessment: selectedAssessment,
        dueDate,
      });
      await loadCourseWork(false);
      selectedCourseWorkId = work.id;
      message = `Created and linked "${work.title}" in ${selectedCourse.name}.`;
    });
  }

  async function linkSelectedAssignment() {
    if (!selectedAssessment || !selectedCourse || !selectedCourseWork) return;
    await run('link', async () => {
      googleClassroom.linkCourseWork('assessment', selectedAssessment.id, selectedCourse, selectedCourseWork);
      googleClassroom.linkCourseWork('saved-test', selectedAssessment.savedTestId, selectedCourse, selectedCourseWork);
      message = `Linked "${selectedCourseWork.title}" to ${selectedAssessment.savedTestName}.`;
    });
  }

  async function pushGrades() {
    if (!selectedAssessment) return;
    const target = existingLink ?? (
      selectedCourse && selectedCourseWork
        ? googleClassroom.linkCourseWork('assessment', selectedAssessment.id, selectedCourse, selectedCourseWork)
        : null
    );
    if (!target) return;

    await run('grades', async () => {
      pushResult = await googleClassroom.pushGrades({
        assessment: selectedAssessment,
        students: sectionStudents,
        scores: assessmentScores,
        courseId: target.courseId,
        courseWorkId: target.courseWorkId,
      });
      message = `Updated ${pushResult.updated} Classroom grade${pushResult.updated === 1 ? '' : 's'}.`;
    });
  }

  async function run(nextAction: NonNullable<typeof action>, callback: () => Promise<void>) {
    try {
      action = nextAction;
      loading = true;
      error = null;
      message = null;
      if (nextAction !== 'grades') pushResult = null;
      await callback();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      action = null;
      loading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !loading) onclose();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget && !loading) onclose();
  }

  function formatDateInput(value: number): string {
    return new Date(value).toISOString().slice(0, 10);
  }

  function defaultDueDate(): string {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.toISOString().slice(0, 10);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  onclick={handleOverlayClick}
  onkeydown={handleKeydown}
>
  <section class="modal" role="document" tabindex="-1">
    <header>
      <div>
        <h2>Google Classroom</h2>
        <p>Publish a Classroom assignment and pass back TestGen grades without uploading the paper by default.</p>
      </div>
      <button class="ghost icon-btn" onclick={onclose} disabled={loading} title="Close">x</button>
    </header>

    <div class="body">
      <section class="panel">
        <div class="panel-heading">
          <div>
            <h3>Connection</h3>
            <p>Uses your Google OAuth web client. The teacher signs in and grants Classroom access.</p>
          </div>
          <span class:connected={googleClassroom.authenticated}>{googleClassroom.authenticated ? 'Connected' : 'Not connected'}</span>
        </div>

        {#if !envClientId}
          <label class="field" for="classroom-client-id">
            <span>OAuth client ID</span>
            <input
              id="classroom-client-id"
              bind:value={clientId}
              placeholder="1234567890-abc123def456.apps.googleusercontent.com"
              autocomplete="off"
              disabled={loading}
            />
          </label>
        {:else}
          <p class="note">App-level Google OAuth configuration was detected.</p>
        {/if}

        <div class="button-row">
          <button class="primary" onclick={connect} disabled={loading || !clientId.trim()}>
            {action === 'connect' ? 'Connecting...' : googleClassroom.authenticated ? 'Reconnect' : 'Connect'}
          </button>
          {#if googleClassroom.authenticated}
            <button class="ghost" onclick={() => void loadCourses()} disabled={loading}>
              {action === 'courses' ? 'Refreshing...' : 'Refresh Courses'}
            </button>
          {/if}
        </div>
      </section>

      <section class="panel">
        <div class="panel-heading">
          <div>
            <h3>TestGen Assessment</h3>
            <p>Grades are pushed from a Gradebook assessment snapshot.</p>
          </div>
        </div>

        <label class="field" for="classroom-assessment">
          <span>Assessment</span>
          <select id="classroom-assessment" bind:value={selectedAssessmentId} disabled={loading || assessments.length === 0}>
            {#if assessments.length === 0}
              <option value="">No Gradebook assessments</option>
            {:else}
              {#each assessments as assessment (assessment.id)}
                <option value={assessment.id}>{assessment.savedTestName}</option>
              {/each}
            {/if}
          </select>
        </label>

        {#if selectedAssessment}
          <div class="assessment-summary">
            <span>{selectedSection?.name ?? 'Gradebook section'}</span>
            <strong>{selectedAssessment.totalPoints} pts</strong>
            <span>{sectionStudents.filter((student) => student.active).length} active students</span>
            <span>{assessmentScores.filter((score) => score.state === 'normal' && score.points !== null).length} entered scores</span>
          </div>
          {#if existingLink}
            <div class="linked-card">
              <div>
                <strong>Linked Classroom assignment</strong>
                <span>{existingLink.courseName} / {existingLink.courseWorkTitle}</span>
              </div>
              {#if existingLink.alternateLink}
                <a href={existingLink.alternateLink} target="_blank" rel="noopener">Open</a>
              {/if}
            </div>
          {/if}
        {/if}
      </section>

      <section class="panel">
        <div class="panel-heading">
          <div>
            <h3>Classroom Assignment</h3>
            <p>Create a new assignment, or link an existing TestGen-created assignment.</p>
          </div>
        </div>

        <div class="two-col">
          <label class="field" for="classroom-course">
            <span>Course</span>
            <select
              id="classroom-course"
              bind:value={selectedCourseId}
              disabled={loading || !googleClassroom.authenticated || courses.length === 0}
              onchange={() => void loadCourseWork(false)}
            >
              {#if courses.length === 0}
                <option value="">No courses loaded</option>
              {:else}
                {#each courses as course (course.id)}
                  <option value={course.id}>{course.name}{course.section ? ` - ${course.section}` : ''}</option>
                {/each}
              {/if}
            </select>
          </label>

          <label class="field" for="classroom-due-date">
            <span>Due date</span>
            <input id="classroom-due-date" type="date" bind:value={dueDate} disabled={loading || !selectedAssessment} />
          </label>
        </div>

        <div class="button-row">
          <button class="primary" onclick={createAssignment} disabled={loading || !selectedAssessment || !selectedCourse}>
            {action === 'create' ? 'Creating...' : 'Create New Assignment'}
          </button>
        </div>

        <label class="field" for="classroom-coursework">
          <span>Existing assignment</span>
          <select
            id="classroom-coursework"
            bind:value={selectedCourseWorkId}
            disabled={loading || !selectedCourse || courseWork.length === 0}
          >
            {#if courseWork.length === 0}
              <option value="">No assignments loaded</option>
            {:else}
              {#each courseWork as work (work.id)}
                <option value={work.id}>{work.title}{work.associatedWithDeveloper === false ? ' (not TestGen-created)' : ''}</option>
              {/each}
            {/if}
          </select>
        </label>

        {#if selectedCourseWork?.associatedWithDeveloper === false}
          <p class="warning">
            Google usually blocks grade updates for assignments created by another OAuth project. Link is allowed, but grade push may fail.
          </p>
        {/if}

        <div class="button-row">
          <button class="ghost" onclick={() => void loadCourseWork()} disabled={loading || !selectedCourse}>
            {action === 'work' ? 'Loading...' : 'Refresh Assignments'}
          </button>
          <button onclick={linkSelectedAssignment} disabled={loading || !selectedAssessment || !selectedCourse || !selectedCourseWork}>
            {action === 'link' ? 'Linking...' : 'Link Selected'}
          </button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-heading">
          <div>
            <h3>Grade Passback</h3>
            <p>Matches students by email, then writes draft and assigned grades to Classroom.</p>
          </div>
        </div>

        {#if unmatchedLocalStudents > 0}
          <p class="warning">{unmatchedLocalStudents} active local student{unmatchedLocalStudents === 1 ? '' : 's'} need an email before Classroom matching.</p>
        {/if}

        <div class="button-row">
          <button class="primary" onclick={pushGrades} disabled={loading || !canPushGrades || !selectedAssessment}>
            {action === 'grades' ? 'Pushing...' : 'Push Grades'}
          </button>
        </div>

        {#if pushResult}
          <div class="result-card">
            <strong>{pushResult.updated} updated · {pushResult.skipped} skipped · {pushResult.failed} failed</strong>
            {#if pushResult.details.length > 0}
              <details>
                <summary>Details</summary>
                {#each pushResult.details.slice(0, 20) as detail}
                  <small>{detail}</small>
                {/each}
              </details>
            {/if}
          </div>
        {/if}
      </section>

      {#if message}
        <p class="success">{message}</p>
      {/if}
      {#if error}
        <p class="error">{error}</p>
      {/if}
    </div>
  </section>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.48);
  }

  .modal {
    display: flex;
    flex-direction: column;
    width: min(940px, 100%);
    max-height: min(820px, calc(100vh - 40px));
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--text);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
  }

  header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--border);
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: 20px;
  }

  h3 {
    font-size: 15px;
  }

  header p,
  .panel-heading p,
  .note,
  .assessment-summary span,
  .linked-card span,
  .result-card small {
    color: var(--text-2);
    font-size: 12px;
  }

  .body {
    display: grid;
    gap: 12px;
    overflow: auto;
    padding: 14px;
  }

  .panel {
    display: grid;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
  }

  .panel-heading,
  .linked-card {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  .panel-heading > div,
  .linked-card > div {
    min-width: 0;
  }

  .panel-heading span {
    flex: 0 0 auto;
    color: var(--text-2);
    font-size: 12px;
    font-weight: 700;
  }

  .panel-heading span.connected {
    color: #16a34a;
  }

  .field {
    display: grid;
    gap: 5px;
    margin: 0;
  }

  .field span {
    color: var(--text-2);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  input,
  select {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .two-col {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 180px;
    gap: 10px;
  }

  .button-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .button-row button {
    min-height: 36px;
  }

  .icon-btn {
    width: 32px;
    height: 32px;
    padding: 0;
  }

  .assessment-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .assessment-summary > * {
    min-width: 0;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
  }

  .linked-card,
  .result-card {
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-2);
  }

  .result-card {
    display: grid;
    gap: 8px;
  }

  .result-card small {
    display: block;
    margin-top: 4px;
  }

  .success,
  .error,
  .warning {
    padding: 10px;
    border-radius: 8px;
    font-size: 13px;
  }

  .success {
    border: 1px solid color-mix(in srgb, #16a34a 45%, var(--border));
    background: color-mix(in srgb, #16a34a 12%, var(--bg));
    color: #15803d;
  }

  .error {
    border: 1px solid color-mix(in srgb, var(--danger) 45%, var(--border));
    background: color-mix(in srgb, var(--danger) 12%, var(--bg));
    color: var(--danger);
  }

  .warning {
    border: 1px solid color-mix(in srgb, var(--warning, #f59e0b) 45%, var(--border));
    background: color-mix(in srgb, var(--warning, #f59e0b) 12%, var(--bg));
    color: var(--text);
  }

  @media (max-width: 760px) {
    .overlay {
      align-items: stretch;
      padding: 0;
    }

    .modal {
      width: 100%;
      max-height: none;
      min-height: 100%;
      border: 0;
      border-radius: 0;
    }

    header {
      padding: calc(14px + env(safe-area-inset-top)) 14px 12px;
    }

    .body {
      padding: 10px 10px calc(16px + env(safe-area-inset-bottom));
    }

    .two-col,
    .assessment-summary {
      grid-template-columns: 1fr;
    }

    .button-row {
      display: grid;
      grid-template-columns: 1fr;
    }

    button,
    input,
    select {
      min-height: 44px;
      font-size: 16px;
    }
  }
</style>
