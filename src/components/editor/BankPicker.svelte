<script lang="ts">
  import { bankView } from '../../lib/bank-switch-view.svelte';
  import { workspaceCatalog } from '../../lib/workspace-catalog.svelte';
  let { value, onchange, label = 'Bank', disabled = false }: {
    value: string; onchange: (bankId: string) => void; label?: string; disabled?: boolean;
  } = $props();
  let banks = $derived(bankView.banks.filter(bank => bank.id === bankView.activeBankId || bank.id === value || !workspaceCatalog.hiddenBankIds.has(bank.id)));
</script>
<label>Bank<select aria-label={label} {value} disabled={disabled || bankView.switching} onchange={e => onchange(e.currentTarget.value)}>
  {#each banks as bank (bank.id)}<option value={bank.id}>{bank.name}</option>{/each}
</select></label>
<style>
  label { display: grid; gap: .25rem; font-size: 12px; color: var(--text-2); }
  select { width: 100%; min-width: 0; }
</style>
