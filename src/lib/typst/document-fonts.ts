export type DocumentFontGroup = 'Mathematical' | 'Paper serif' | 'Classroom';

export interface DocumentFontOption {
  id: string;
  label: string;
  group: DocumentFontGroup;
  textFamily: string;
  mathFamily: string;
}

export const DEFAULT_DOCUMENT_FONT = 'new-computer-modern';

/** Bundled choices that render identically in preview and exported PDFs. */
export const DOCUMENT_FONTS: readonly DocumentFontOption[] = [
  { id: DEFAULT_DOCUMENT_FONT, label: 'New Computer Modern', group: 'Mathematical', textFamily: 'New Computer Modern', mathFamily: 'New Computer Modern Math' },
  { id: 'libertinus-serif', label: 'Libertinus', group: 'Mathematical', textFamily: 'Libertinus Serif', mathFamily: 'Libertinus Math' },
  { id: 'stix-two-text', label: 'STIX Two', group: 'Mathematical', textFamily: 'STIX Two Text', mathFamily: 'STIX Two Math' },
  { id: 'source-serif-4', label: 'Source Serif 4', group: 'Paper serif', textFamily: 'Source Serif 4', mathFamily: 'New Computer Modern Math' },
  { id: 'eb-garamond', label: 'EB Garamond', group: 'Paper serif', textFamily: 'EB Garamond', mathFamily: 'New Computer Modern Math' },
  { id: 'crimson-pro', label: 'Crimson Pro', group: 'Paper serif', textFamily: 'Crimson Pro', mathFamily: 'New Computer Modern Math' },
  { id: 'lora', label: 'Lora', group: 'Paper serif', textFamily: 'Lora', mathFamily: 'New Computer Modern Math' },
  { id: 'merriweather', label: 'Merriweather', group: 'Paper serif', textFamily: 'Merriweather', mathFamily: 'New Computer Modern Math' },
  { id: 'noto-serif', label: 'Noto Serif', group: 'Paper serif', textFamily: 'Noto Serif', mathFamily: 'New Computer Modern Math' },
  { id: 'roboto-slab', label: 'Roboto Slab', group: 'Paper serif', textFamily: 'Roboto Slab', mathFamily: 'New Computer Modern Math' },
  { id: 'atkinson-hyperlegible-next', label: 'Atkinson Hyperlegible — accessible', group: 'Classroom', textFamily: 'Atkinson Hyperlegible Next', mathFamily: 'New Computer Modern Math' },
  { id: 'patrick-hand', label: 'Patrick Hand — handwritten', group: 'Classroom', textFamily: 'Patrick Hand', mathFamily: 'New Computer Modern Math' },
];

const byId = new Map(DOCUMENT_FONTS.map(option => [option.id, option]));

export function documentFont(id: string | undefined): DocumentFontOption {
  return byId.get(id ?? DEFAULT_DOCUMENT_FONT) ?? byId.get(DEFAULT_DOCUMENT_FONT)!;
}

export function documentFontRules(id: string | undefined, size: number): string {
  const option = documentFont(id);
  return `#set text(font: "${option.textFamily}", size: ${size}pt)\n#show math.equation: set text(font: "${option.mathFamily}")`;
}
