export interface PreparedDocument {
  source: string;
  images: { path: string; bytes: Uint8Array }[];
}

export interface CompilerRequest {
  id: number;
  kind: 'initialize' | 'pdf' | 'svg' | 'query';
  document?: PreparedDocument;
  /** For a query: the selector whose elements' `value` fields are returned. */
  selector?: string;
}

export interface CompilerResponse {
  id: number;
  svg?: string;
  bytes?: Uint8Array;
  values?: unknown[];
  error?: string;
}
