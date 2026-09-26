export interface PreparedDocument {
  source: string;
  images: { path: string; bytes: Uint8Array }[];
}

export interface CompilerRequest {
  id: number;
  kind: 'initialize' | 'pdf' | 'svg';
  document?: PreparedDocument;
}

export interface CompilerResponse {
  id: number;
  svg?: string;
  bytes?: Uint8Array;
  error?: string;
}
