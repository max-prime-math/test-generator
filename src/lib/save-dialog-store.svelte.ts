import { type Class, type TestType } from './types';

let isOpen = $state(false);
let modalData = $state<{
  config?: { subtitle: string; title: string };
  allClasses?: Class[];
  filterClassId?: string | null;
} | null>(null);
let onSave: ((data: SaveDialogData) => void) | null = null;

export type SaveDialogData = {
  name: string;
  classId: string | null;
  unitId: string | null;
  testType: TestType | null;
};

export const saveDialogStore = {
  get isOpen() { return isOpen; },
  get modalData() { return modalData; },

  open(
    config: { subtitle: string; title: string },
    allClasses: Class[],
    filterClassId: string | null,
    onSaveCallback: (data: SaveDialogData) => void,
  ) {
    modalData = { config, allClasses, filterClassId };
    onSave = onSaveCallback;
    isOpen = true;
  },

  close() {
    isOpen = false;
    modalData = null;
    onSave = null;
  },

  handleSave(data: SaveDialogData) {
    if (onSave) onSave(data);
    this.close();
  },
};
