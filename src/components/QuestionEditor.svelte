<script lang="ts">
  import { onMount } from 'svelte';
  import type { Question } from '../lib/types';
  import { newInEditor, openInEditor } from '../lib/editor/editor-state.svelte';
  let { question, initialClassId, initialUnitId, initialSectionId, onclose }: {
    question?: Question; initialClassId?: string; initialUnitId?: string; initialSectionId?: string; onclose: () => void;
  } = $props();
  // Compatibility entry point: all authoring now lives in the Editor workspace.
  onMount(() => {
    if (question) openInEditor(question);
    else newInEditor({ classId: initialClassId ?? '', unitId: initialUnitId ?? '', sectionId: initialSectionId ?? '' });
    onclose();
  });
</script>
