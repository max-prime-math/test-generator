export interface WorkspaceProgress {
  phase: string;
  detail: string;
  completed: number;
  total: number | null;
  unit: string;
}

export type FileReadProgress = (completed: number, total: number, path: string) => void;

/** Let the browser paint a progress update before another CPU-heavy batch. */
export async function yieldWorkspaceProgress(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}
