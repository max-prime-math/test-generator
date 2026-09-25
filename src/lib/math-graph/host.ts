import './vendor/editor.css';
import './host.css';
import { initialGraph, validate, type Graph } from './vendor/model.ts';
import { createDocument, readDocument } from './vendor/document.ts';

type DraftState = { draft?: Graph; rawFields?: Record<string, string>; expanded?: string[]; version?: number };
type BridgeMessage = { type: string; graph?: unknown; id?: number };
const send = (type: string, extra: object = {}) => parent.postMessage({ channel: 'testgen-math-graph', type, ...extra }, location.origin);
let graph = initialGraph();
let version = 0;
let state: DraftState | null = null;
let initialized = false;
const history: Graph[] = [];
const future: Graph[] = [];
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function documentMessage(ack?: number, resetDraft = false) {
  queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'document', graph: copy(graph), version, modified: false, ack, resetDraft } })));
}
function status(message: string) { const el = document.getElementById('status'); if (el) { el.textContent = message; el.classList.add('error'); } }
function download() {
  const url = URL.createObjectURL(new Blob([createDocument(graph)], { type: 'text/plain' }));
  const link = document.createElement('a'); link.href = url; link.download = 'graph.tkz'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function undo(redo = false) {
  const from = redo ? future : history;
  const to = redo ? history : future;
  const next = from.pop(); if (!next) return;
  to.push(copy(graph)); graph = next; version++; documentMessage(undefined, true);
}
window.addEventListener('message', async event => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.channel !== 'testgen-math-graph') return;
  if (event.data.type !== 'open' || initialized) return;
  try {
    graph = validate(event.data.graph ?? initialGraph());
    state = event.data.draft ? { ...event.data.draft, version: 0 } : null;
    for (const [key, value] of Object.entries(event.data.theme ?? {})) {
      if (key.startsWith('--vscode-') && typeof value === 'string') document.documentElement.style.setProperty(key, value);
    }
    const api = {
      getState: () => state,
      setState(next: DraftState | null) {
        state = next;
        send('draft', { state: { ...next, draft: next?.draft ?? graph, version: 0 } });
      },
      postMessage(message: BridgeMessage) {
        try {
          if (message.type === 'ready' || message.type === 'reload') documentMessage(undefined, message.type === 'reload');
          else if (message.type === 'edit') {
            const next = validate(message.graph);
            if (JSON.stringify(next) !== JSON.stringify(graph)) {
              history.push(copy(graph)); if (history.length > 100) history.shift(); future.length = 0;
              graph = copy(next); version++;
            }
            documentMessage(message.id);
          } else if (message.type === 'save') send('use', { graph: validate(graph) });
          else if (message.type === 'source') download();
        } catch (error) {
          window.dispatchEvent(new MessageEvent('message', { data: { type: 'error', ack: message.id, message: String(error) } }));
        }
      },
    };
    Object.assign(window, { acquireVsCodeApi: () => api });
    initialized = true;
    await import('./vendor/webview.ts');
    const header = document.querySelector('header')!;
    for (const [title, action] of [['Undo', () => undo()], ['Redo', () => undo(true)]] as const) {
      const button = document.createElement('button'); button.textContent = title; button.onclick = action; header.insertBefore(button, document.getElementById('source'));
    }
    const upload = document.createElement('input'); upload.type = 'file'; upload.accept = '.tkz,.tikz'; upload.hidden = true;
    upload.onchange = async () => {
      try {
        const file = upload.files?.[0]; if (!file) return;
        const decoded = readDocument(await file.text());
        if (decoded.modified) throw new Error('This file has manual TikZ edits. Reconcile them in Math Graph before importing.');
        history.push(copy(graph)); future.length = 0; graph = decoded.graph; version++; documentMessage(undefined, true);
      } catch (error) { status(String(error)); } finally { upload.value = ''; }
    };
    const open = document.createElement('button'); open.textContent = 'Open .tkz'; open.onclick = () => upload.click();
    header.insertBefore(open, document.getElementById('source')); header.append(upload);
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); send('close'); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); document.getElementById('save')?.click(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !(event.target instanceof HTMLInputElement)) { event.preventDefault(); undo(event.shiftKey); }
    });
  } catch (error) { send('error', { message: String(error) }); }
});
send('ready');
