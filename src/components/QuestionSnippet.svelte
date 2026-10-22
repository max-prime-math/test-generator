<script lang="ts">
  import { untrack } from 'svelte';
  import { questionSnippet } from '../lib/question-snippet';
  import { requestSnippetMath } from '../lib/snippet-math';

  let { body }: { body: string } = $props();
  const parts = $derived(questionSnippet(body));
  let visible = $state(false);
  let rendered = $state<Record<string, string>>({});

  function observe(node: HTMLElement) {
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
    }, { rootMargin: '80px 0px' });
    observer.observe(node);
    return { destroy() { observer.disconnect(); } };
  }

  $effect(() => {
    if (!visible) return;
    const expressions = [...new Set(parts.filter(part => part.kind === 'math').map(part => part.value))];
    rendered = untrack(() => Object.fromEntries(expressions.filter(expression => expression in rendered).map(expression => [expression, rendered[expression]])));
    const cancel = expressions.map(expression => requestSnippetMath(expression, svg => {
      rendered = { ...untrack(() => rendered), [expression]: svg };
    }));
    return () => cancel.forEach(stop => stop());
  });
</script>

<p class="snippet" use:observe>
  {#each parts as part}
    {#if part.kind === 'math'}<span class="math" class:rendered={!!rendered[part.value]} role="math" aria-label={part.value}><span aria-hidden="true">{#if rendered[part.value]}{@html rendered[part.value]}{:else}{part.value}{/if}</span></span>{:else}{part.value}{/if}
  {/each}
</p>

<style>
  .snippet {
    margin: 0;
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 15px;
    font-weight: 400;
    line-height: 1.65;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
  }
  .math { font-style: italic; }
  .math.rendered { display: inline-block; max-width: 100%; vertical-align: middle; line-height: 0; }
  .math :global(svg) { display: inline-block; max-width: 100%; height: auto; pointer-events: none; }
</style>
