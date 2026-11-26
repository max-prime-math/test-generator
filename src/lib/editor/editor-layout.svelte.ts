const KEY = 'tg-editor-layout-v1';
export const editorTextSizes = [12, 14, 16, 18, 20, 24] as const;
type Pane = 'questions' | 'preview';

interface EditorLayout {
  fontSize: number;
  questions?: number;
  preview?: number;
}

function loadLayout(): EditorLayout {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const width = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
    return {
      fontSize: editorTextSizes.find(size => size === saved.fontSize) ?? 14,
      questions: width(saved.questions),
      preview: width(saved.preview),
    };
  } catch { return { fontSize: 14 }; }
}

export const editorLayout = $state(loadLayout());

function persistLayout() {
  try { localStorage.setItem(KEY, JSON.stringify(editorLayout)); } catch { /* Usable until reload. */ }
}

export function setEditorTextSize(size: number) {
  editorLayout.fontSize = size;
  persistLayout();
}

export function setEditorPaneWidth(pane: Pane, width: number | undefined) {
  editorLayout[pane] = width;
  persistLayout();
}
