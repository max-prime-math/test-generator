import { validate, type Graph } from './vendor/model.ts';
import { drawGraph, type DrawingContext } from './vendor/preview.ts';

const escapeXml = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const n = (value: number) => {
  if (!Number.isFinite(value)) throw new Error('Cannot export non-finite graph coordinates.');
  return Number(value.toFixed(5)).toString();
};

/** A deliberately small vector target for Math Graph's existing drawing routine. */
class SvgDrawing implements DrawingContext {
  fillStyle: string | CanvasGradient | CanvasPattern = 'black';
  strokeStyle: string | CanvasGradient | CanvasPattern = 'black';
  lineWidth = 1;
  lineCap: CanvasLineCap = 'butt';
  font = '12px serif';
  textAlign: CanvasTextAlign = 'left';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  private dash: number[] = [];
  private transform = '';
  private clipping = '';
  private path = '';
  private stack: Array<ReturnType<SvgDrawing['state']>> = [];
  private defs: string[] = [];
  private elements: string[] = [];
  private state() {
    return { fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, lineCap: this.lineCap,
      font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline, dash: [...this.dash], transform: this.transform, clipping: this.clipping };
  }
  save() { this.stack.push(this.state()); }
  restore() { const state = this.stack.pop(); if (state) Object.assign(this, state); }
  setLineDash(dash: number[]) { this.dash = [...dash]; }
  translate(x: number, y: number) { this.transform += ` translate(${n(x)} ${n(y)})`; }
  rotate(angle: number) { this.transform += ` rotate(${n(angle * 180 / Math.PI)})`; }
  beginPath() { this.path = ''; }
  moveTo(x: number, y: number) { this.path += `M${n(x)} ${n(y)}`; }
  lineTo(x: number, y: number) { this.path += `L${n(x)} ${n(y)}`; }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) { this.path += `Q${n(cx)} ${n(cy)} ${n(x)} ${n(y)}`; }
  closePath() { this.path += 'Z'; }
  rect(x: number, y: number, width: number, height: number) {
    this.moveTo(x, y); this.lineTo(x + width, y); this.lineTo(x + width, y + height); this.lineTo(x, y + height); this.closePath();
  }
  arc(x: number, y: number, r: number, start: number, end: number) {
    if (start !== 0 || Math.abs(end - 2 * Math.PI) > 1e-8) throw new Error('Unsupported partial marker arc.');
    this.path += `M${n(x + r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0Z`;
  }
  private attrs() { return `${this.transform ? ` transform="${escapeXml(this.transform)}"` : ''}${this.clipping ? ` clip-path="url(#${this.clipping})"` : ''}`; }
  clip() {
    const id = `clip-${this.defs.length}`;
    this.defs.push(`<clipPath id="${id}"><path d="${this.path}"/></clipPath>`); this.clipping = id;
  }
  fill() { this.elements.push(`<path d="${this.path}" fill="${escapeXml(this.fillStyle)}"${this.attrs()}/>`); }
  stroke() {
    this.elements.push(`<path d="${this.path}" fill="none" stroke="${escapeXml(this.strokeStyle)}" stroke-width="${n(this.lineWidth)}" stroke-linecap="${this.lineCap}" stroke-linejoin="round"${this.dash.length ? ` stroke-dasharray="${this.dash.map(n).join(' ')}"` : ''}${this.attrs()}/>`);
  }
  fillRect(x: number, y: number, width: number, height: number) {
    this.elements.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" fill="${escapeXml(this.fillStyle)}"${this.attrs()}/>`);
  }
  strokeRect(x: number, y: number, width: number, height: number) { this.beginPath(); this.rect(x, y, width, height); this.stroke(); }
  fillText(text: string, x: number, y: number) {
    const size = Number(this.font.match(/([\d.]+)px/)?.[1] ?? 12);
    // Use explicit baseline offsets; Typst's SVG renderer does not support every
    // browser dominant-baseline value. Labels follow the upstream browser typography.
    const baseline = this.textBaseline === 'top' ? size * .8 : this.textBaseline === 'middle' ? size * .3 : this.textBaseline === 'bottom' ? -size * .2 : 0;
    const anchor = this.textAlign === 'center' ? 'middle' : this.textAlign === 'right' || this.textAlign === 'end' ? 'end' : 'start';
    this.elements.push(`<text x="${n(x)}" y="${n(y + baseline)}" font-family="New Computer Modern, serif" font-size="${n(size)}"${this.font.includes('italic') ? ' font-style="italic"' : ''} text-anchor="${anchor}" fill="${escapeXml(this.fillStyle)}"${this.attrs()}>${escapeXml(text)}</text>`);
  }
  svg(graph: Graph, width: number, height: number) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width / 32)}cm" height="${n(height / 32)}cm" viewBox="0 0 ${n(width)} ${n(height)}"><metadata id="math-graph-model">${escapeXml(JSON.stringify(graph))}</metadata><defs>${this.defs.join('')}</defs>${this.elements.join('')}</svg>`;
  }
}

export function graphSvg(value: unknown): string {
  const graph = validate(value);
  const width = graph.settings.width * 32 + 100;
  const height = graph.settings.height * 32 + 90;
  const target = new SvgDrawing();
  drawGraph(target, graph, { width, height });
  return target.svg(graph, width, height);
}
export function graphFromSvg(svg: string): Graph | null {
  if (svg.length > 10_000_000) throw new Error('This SVG is too large to reopen as a graph.');
  const match = svg.match(/<metadata\s+id="math-graph-model"\s*>([\s\S]*?)<\/metadata>/);
  if (!match) return null;
  const json = match[1].replace(/&(amp|lt|gt|quot|apos);/g, (_match, name: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name]!);
  return validate(JSON.parse(json));
}
