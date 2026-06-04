<script lang="ts">
  import { onMount } from 'svelte';
  import { appState } from '../lib/app-state.svelte';
  import { DEMO_CLASSES } from '../lib/curriculum';
  import { bank } from '../lib/bank.svelte';

  interface Props {
    onclose: () => void;
  }
  let { onclose }: Props = $props();

  const DONE_KEY = 'tg-tutorial-done-v1';
  let demoEnabledThisSession = $state(false);

  interface TutStep {
    id: string;
    title: string;
    body: string;
    placement: 'top' | 'bottom' | 'left' | 'right';
    pad?: number;
    setup?: () => Promise<void>;
  }

  const STEPS: TutStep[] = [
    {
      id: 'tut-nav',
      title: 'Welcome to Test Generator',
      body: 'Sample AP Calculus BC questions have been loaded. Use these tabs to switch between your Question Bank and the Test Builder.',
      placement: 'bottom',
      pad: 6,
    },
    {
      id: 'tut-bank-sidebar',
      title: 'Curriculum Sidebar',
      body: 'Browse questions by class, unit, and section. Drag the divider edge to resize or click it to collapse.',
      placement: 'right',
      pad: 0,
    },
    {
      id: 'tut-toolbar',
      title: 'Question Bank Toolbar',
      body: 'Search questions, bulk-import from LaTeX, export a JSON backup, or add a question manually.',
      placement: 'bottom',
      pad: 0,
    },
    {
      id: 'tut-type-tabs',
      title: 'Filter by Type',
      body: 'Narrow the list to multiple-choice (MCQ), free-response (FRQ), or graph questions.',
      placement: 'bottom',
      pad: 0,
    },
    {
      id: 'tut-preview-pane',
      title: 'Question Preview',
      body: 'Click on any question to see a live preview on the right. This is where you can check the parabola graph and verify how questions render before adding them to a test.',
      placement: 'left',
      pad: 0,
      setup: async () => {
        // Click the first question to show the preview pane
        await delay(100);
        const firstCard = document.querySelector('.card') as HTMLElement;
        if (firstCard) firstCard.click();
        await delay(600);
      },
    },
    {
      id: 'tut-tab-build',
      title: 'Test Builder',
      body: 'Switch here to assemble questions into a test, configure layout, preview the PDF live, and export. The preview pane from the question bank will close since you\'ll be in a different view.',
      placement: 'bottom',
      pad: 6,
    },
    {
      id: 'tut-test-toolbar',
      title: 'Test Toolbar',
      body: 'Name and save your test here. The center pane shows a live PDF preview that recompiles as you work.',
      placement: 'bottom',
      pad: 0,
      setup: async () => {
        document.getElementById('tut-tab-build')?.click();
        await delay(400);
      },
    },
    {
      id: 'tut-test-picker',
      title: 'Question Picker',
      body: 'Browse your question bank and check questions to add them to the test. Drag to reorder. Hover a question for a quick preview.',
      placement: 'left',
      pad: 0,
    },
    {
      id: 'tut-theme-btn',
      title: 'Themes',
      body: 'Switch between built-in themes — Light, Dark, Catppuccin, Gruvbox, Nord, and more.',
      placement: 'bottom',
      pad: 10,
    },
    {
      id: 'tut-help-btn',
      title: "You're all set!",
      body: 'Click here anytime to open the full docs or restart this tutorial.',
      placement: 'bottom',
      pad: 10,
    },
  ];

  let step = $state(0);
  let spotX = $state(0);
  let spotY = $state(0);
  let spotW = $state(200);
  let spotH = $state(40);
  let tipVisible = $state(false);
  let busy = $state(false);
  let spotEl = $state<HTMLDivElement | null>(null);

  const DEFAULT_PAD = 8;
  const TOOLTIP_W = 284;
  const GAP = 14;

  function measure(idx: number) {
    const s = STEPS[idx];
    const el = document.getElementById(s.id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = s.pad ?? DEFAULT_PAD;
    spotX = r.left - p;
    spotY = r.top - p;
    spotW = r.width + p * 2;
    spotH = r.height + p * 2;
  }

  onMount(async () => {
    // Enable demo mode and mark that user should see the prompt at the end
    demoEnabledThisSession = true;
    if (!appState.demoMode) appState.setDemoMode(true);

    // Ensure we start on the Bank tab regardless of where the user was
    const bankBtn = document.getElementById('tut-tab-bank');
    if (bankBtn) {
      bankBtn.click();
      await delay(350); // wait for the tab slide animation
    }
    measure(0);
    await delay(60);
    tipVisible = true;
  });

  async function goNext() {
    if (busy) return;
    if (step >= STEPS.length - 1) { finish(); return; }
    busy = true;
    tipVisible = false;
    await delay(150);
    const nextStep = STEPS[step + 1];
    if (nextStep.setup) await nextStep.setup();
    measure(step + 1);
    step += 1;
    await delay(380);
    tipVisible = true;
    busy = false;
  }

  async function skip() {
    if (busy) return;
    busy = true;
    tipVisible = false;
    await delay(110);

    const helpEl = document.getElementById('tut-help-btn');
    if (helpEl && spotEl) {
      const hr = helpEl.getBoundingClientRect();
      const cx = spotX + spotW / 2;
      const cy = spotY + spotH / 2;
      const dx = hr.left + hr.width / 2 - cx;
      const dy = hr.top + hr.height / 2 - cy;

      // Arc midpoint: offset perpendicular to the direct path to make the
      // trajectory curve visibly rather than fly in a straight line.
      const arcX = dx * 0.5 + dy * 0.18;
      const arcY = dy * 0.5 - dx * 0.18 - 20;

      await spotEl.animate(
        [
          // Pulse outward to grab attention
          { transform: 'translate(0,0) scale(1)',    opacity: 1,   borderRadius: '8px',  offset: 0,    easing: 'ease-out' },
          { transform: 'translate(0,0) scale(1.12)', opacity: 1,   borderRadius: '8px',  offset: 0.10, easing: 'ease-in' },
          // Compress (slingshot windup)
          { transform: 'translate(0,0) scale(0.82)', opacity: 1,   borderRadius: '10px', offset: 0.22, easing: 'cubic-bezier(0.4,0,0.2,1)' },
          // Arc midpoint — visibly curving toward the ? button
          { transform: `translate(${arcX}px,${arcY}px) scale(0.38)`, opacity: 0.75, borderRadius: '50%', offset: 0.58 },
          // Arrive at ? button
          { transform: `translate(${dx}px,${dy}px) scale(0.05)`, opacity: 0, borderRadius: '50%', offset: 1 },
        ],
        { duration: 680, easing: 'linear', fill: 'forwards' },
      ).finished;

      // Ring-pulse on the ? button so it's clear where the spotlight landed
      helpEl.animate(
        [
          { boxShadow: '0 0 0 0px rgba(37,99,235,0.75)', offset: 0 },
          { boxShadow: '0 0 0 10px rgba(37,99,235,0)',   offset: 1 },
        ],
        { duration: 550, easing: 'ease-out' },
      );
    }

    // Skip defaults to removing the demo questions
    removeDemo();
  }

  let showDemoPrompt = $state(false);

  function finish() {
    if (demoEnabledThisSession) {
      tipVisible = false;
      showDemoPrompt = true;
    } else {
      localStorage.setItem(DONE_KEY, '1');
      onclose();
    }
  }

  function keepDemo() {
    localStorage.setItem(DONE_KEY, '1');
    onclose();
  }

  function removeDemo() {
    const demoIds = new Set(DEMO_CLASSES.map(c => c.id));
    bank.questions = bank.questions.filter(q => !demoIds.has(q.classId ?? ''));
    appState.setDemoMode(false);
    localStorage.setItem(DONE_KEY, '1');
    onclose();
  }

  function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  function tipLeft(): number {
    const s = STEPS[step];
    if (s.placement === 'right') return spotX + spotW + GAP;
    if (s.placement === 'left') return spotX - TOOLTIP_W - GAP;
    const ideal = spotX + spotW / 2 - TOOLTIP_W / 2;
    return Math.max(12, Math.min(window.innerWidth - TOOLTIP_W - 12, ideal));
  }

  function tipTop(): number {
    const s = STEPS[step];
    if (s.placement === 'bottom') return spotY + spotH + GAP;
    if (s.placement === 'top') return Math.max(12, spotY - 160 - GAP);
    return Math.max(12, spotY + spotH / 2 - 72);
  }
</script>

{#if showDemoPrompt}
  <!-- Demo prompt: shown after Done on last step if demo was enabled -->
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="overlay dark"></div>
  <div class="demo-prompt">
    <h3>Keep the sample questions?</h3>
    <p>AP Calculus BC sample questions were loaded to demo the test builder. Would you like to keep them in your question bank?</p>
    <div class="demo-actions">
      <button class="demo-remove" onclick={removeDemo}>Remove them</button>
      <button class="demo-keep" onclick={keepDemo}>Keep sample questions</button>
    </div>
  </div>
{:else}
<!-- Dark backdrop — clicking anywhere advances -->
<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div class="overlay" onclick={goNext}></div>

<!-- Spotlight — transitions between targets -->
<div
  bind:this={spotEl}
  class="spotlight"
  style="left:{spotX}px; top:{spotY}px; width:{spotW}px; height:{spotH}px"
></div>

<!-- Tooltip card -->
<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div
  class="tip"
  class:visible={tipVisible}
  style="left:{tipLeft()}px; top:{tipTop()}px; width:{TOOLTIP_W}px"
  onclick={(e) => e.stopPropagation()}
  onkeydown={(e) => e.stopPropagation()}
>
  <h3>{STEPS[step].title}</h3>
  <p>{STEPS[step].body}</p>

  <div class="row">
    <button class="skip-btn" onclick={skip}>Skip</button>

    <div class="dots">
      {#each STEPS as _, i}
        <span class="dot" class:on={i === step}></span>
      {/each}
    </div>

    <button class="next-btn" onclick={goNext}>
      {step === STEPS.length - 1 ? 'Done' : 'Next →'}
    </button>
  </div>
</div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 9985;
    cursor: pointer;
  }
  .overlay.dark {
    background: rgba(0, 0, 0, 0.62);
    cursor: default;
  }

  .demo-prompt {
    position: fixed;
    z-index: 9990;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 380px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.35);
    padding: 1.75rem 1.75rem 1.5rem;
  }

  .demo-prompt h3 {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
    margin: 0 0 0.6rem;
  }

  .demo-prompt p {
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-2);
    margin: 0 0 1.25rem;
  }

  .demo-actions {
    display: flex;
    gap: 0.6rem;
    justify-content: flex-end;
  }

  .demo-remove {
    font-size: 13px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.42rem 0.9rem;
    cursor: pointer;
    color: var(--text-2);
    transition: border-color 0.12s, color 0.12s;
  }
  .demo-remove:hover { border-color: var(--danger); color: var(--danger); }

  .demo-keep {
    font-size: 13px;
    font-weight: 600;
    background: var(--primary);
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.42rem 0.9rem;
    cursor: pointer;
    transition: opacity 0.14s;
  }
  .demo-keep:hover { opacity: 0.88; }

  .spotlight {
    position: fixed;
    border-radius: 8px;
    box-shadow: 0 0 0 150vmax rgba(0, 0, 0, 0.62);
    pointer-events: none;
    z-index: 9986;
    transition:
      left 0.36s cubic-bezier(0.4, 0, 0.2, 1),
      top 0.36s cubic-bezier(0.4, 0, 0.2, 1),
      width 0.36s cubic-bezier(0.4, 0, 0.2, 1),
      height 0.36s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .tip {
    position: fixed;
    z-index: 9990;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.28);
    padding: 1.1rem 1.25rem 0.95rem;
    opacity: 0;
    transform: translateY(7px) scale(0.97);
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
    pointer-events: none;
  }

  .tip.visible {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: all;
  }

  .tip h3 {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    margin: 0 0 0.35rem;
  }

  .tip p {
    font-size: 13px;
    line-height: 1.55;
    color: var(--text-2);
    margin: 0 0 0.9rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .skip-btn {
    font-size: 12px;
    color: var(--text-2);
    background: none;
    border: none;
    padding: 0;
    opacity: 0.65;
    flex-shrink: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .skip-btn:hover { opacity: 1; color: var(--text); }

  .dots {
    display: flex;
    gap: 5px;
    flex: 1;
    justify-content: center;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--bg-3);
    transition: background 0.22s, transform 0.22s;
    flex-shrink: 0;
  }

  .dot.on {
    background: var(--primary);
    transform: scale(1.3);
  }

  .next-btn {
    font-size: 13px;
    font-weight: 600;
    background: var(--primary);
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.38rem 0.9rem;
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity 0.14s;
  }
  .next-btn:hover { opacity: 0.88; }
</style>
