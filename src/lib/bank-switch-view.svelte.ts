import { bankWorkspaces, type BankWorkspace } from './bank-workspaces.svelte';

/** Reactive mirror of the bank registry and switch progress for components. */
class BankSwitchView {
  banks = $state<BankWorkspace[]>(bankWorkspaces.banks);
  activeBankId = $state(bankWorkspaces.activeBankId);
  switching = $state(bankWorkspaces.switching);
  phase = $state<string | null>(bankWorkspaces.switchPhase);
  error = $state<string | null>(bankWorkspaces.switchError);
  constructor() {
    bankWorkspaces.subscribe(() => {
      this.banks = bankWorkspaces.banks;
      this.activeBankId = bankWorkspaces.activeBankId;
      this.switching = bankWorkspaces.switching;
      this.phase = bankWorkspaces.switchPhase;
      this.error = bankWorkspaces.switchError;
    });
  }
  get activeBank(): BankWorkspace | undefined { return this.banks.find(bank => bank.id === this.activeBankId); }
}

export const bankView = new BankSwitchView();
