import type { QuestionParts } from './types';
import type { PreviewImage } from './typst/image-shadow';

export interface DisplayModeQuestion {
  id: string;
  body: string;
  parts?: QuestionParts;
  narrative?: string;
  choices?: Record<string, string>;
  answer?: string;
  solution?: string;
  graphTypst?: string;
}

export interface DisplayModeRequest {
  title?: string;
  questions: readonly DisplayModeQuestion[];
  initialId: string;
  narrativeFor?: (question: DisplayModeQuestion) => string | undefined;
  imagesFor?: (question: DisplayModeQuestion) => readonly PreviewImage[] | Promise<readonly PreviewImage[]>;
}

class DisplayModeState {
  request = $state.raw<DisplayModeRequest | null>(null);
  popup = $state.raw<Window | null>(null);
  revision = $state(0);

  open(request: DisplayModeRequest): void {
    if (!request.questions.length) return;
    const popup = window.open('', 'testgen-question-display', 'popup=yes,width=1100,height=800,resizable=yes,scrollbars=yes');
    if (!popup) {
      window.alert('The display window was blocked. Allow pop-ups for Test Generator, then try again.');
      return;
    }
    try {
      popup.document.title = request.title ?? 'Question display';
      popup.document.body.innerHTML = '<p style="font:16px system-ui;padding:2rem">Opening question…</p>';
    } catch {
      window.alert('The display window could not be opened. Close it and try again.');
      return;
    }
    this.popup = popup;
    this.request = request;
    this.revision += 1;
    popup.focus();
  }
}

export const displayMode = new DisplayModeState();
