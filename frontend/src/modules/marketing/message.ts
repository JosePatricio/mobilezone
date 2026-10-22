import type { Channel, OrderClient } from './types';

/**
 * Message of the CRM: the rich text of the editor is kept as lines of runs (text + marks), so the
 * preview is rendered without injecting HTML and each channel gets its own format:
 * WhatsApp keeps bold / italic / strikethrough (*, _, ~); SMS is plain text. No channel has text sizes,
 * so the size is only seen in the preview.
 */
export type TextSize = 'small' | 'normal' | 'large';

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  size?: TextSize;
}

export type Line = Run[];

/** Parameters of the text, replaced with the data of each client. */
export const VARIABLES = [
  { token: '@NOMBRE', label: 'Nombre', hint: 'Nombre del cliente' },
  { token: '@TELEFONO', label: 'Teléfono', hint: 'Marca del teléfono de su orden' },
] as const;

export interface MessageVariable {
  token: string;
  label: string;
  hint: string;
}

/** "¿Incluir ruleta?": the single-use link of the wheel, different for each client. */
export const ROULETTE_VARIABLE: MessageVariable = {
  token: '@RULETA',
  label: 'Ruleta',
  hint: 'Enlace de la ruleta, único por cliente',
};

/**
 * Placeholder of the template that takes @RULETA: the variables of the text are the placeholders in order
 * (@NOMBRE {{1}}, @TELEFONO {{2}}, …). Null when the text has no @RULETA.
 */
export function roulettePlaceholder(lines: Line[]): number | null {
  const text = lines.map((line) => line.map((run) => run.text).join('')).join(' ');
  const tokens = (text.match(/@(NOMBRE|TELEFONO|RULETA)\b/gi) ?? []).map((t) => t.toUpperCase());
  const index = tokens.indexOf(ROULETTE_VARIABLE.token);
  return index >= 0 ? index : null;
}

export interface MessageVariables {
  nombre: string;
  telefono: string;
}

export function clientVariables(client: OrderClient): MessageVariables {
  return { nombre: client.nombre, telefono: client.marca };
}

export function applyVariables(text: string, vars: MessageVariables): string {
  return text.replace(/@NOMBRE/gi, () => vars.nombre).replace(/@TELEFONO/gi, () => vars.telefono);
}

type Marks = Omit<Run, 'text'>;

const BLOCKS = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE']);
const NEWLINE = '\n';

function fontSize(value: string): TextSize | undefined {
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  if (/^[1-7]$/.test(v)) return Number(v) <= 2 ? 'small' : Number(v) >= 4 ? 'large' : 'normal';
  if (v.includes('small')) return 'small';
  if (v.includes('large')) return 'large';
  const n = parseFloat(v);
  if (Number.isNaN(n)) return 'normal';
  const px = v.endsWith('em') ? n * 16 : n; // em / rem
  return px < 14 ? 'small' : px > 18 ? 'large' : 'normal';
}

function marksOf(el: HTMLElement, inherited: Marks): Marks {
  const marks = { ...inherited };
  const tag = el.tagName;
  if (tag === 'B' || tag === 'STRONG') marks.bold = true;
  if (tag === 'I' || tag === 'EM') marks.italic = true;
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') marks.strike = true;
  const size = el.getAttribute('size');
  if (tag === 'FONT' && size) marks.size = fontSize(size);
  const style = el.style;
  const weight = style.fontWeight;
  if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) marks.bold = true;
  else if (weight === 'normal' || Number(weight) > 0) marks.bold = false;
  if (style.fontStyle === 'italic') marks.italic = true;
  if (style.textDecoration.includes('line-through')) marks.strike = true;
  if (style.fontSize) marks.size = fontSize(style.fontSize);
  return marks;
}

/**
 * Reads the content of the editor (contentEditable). Lines follow the browser markup:
 * `<div>` / `<p>` blocks and `<br>`; the `<br>` that only keeps a block open is not a line.
 */
export function parseEditor(root: Node): Line[] {
  const out: Run[] = [];
  const endsWithNewline = () => out.length === 0 || out[out.length - 1].text === NEWLINE;

  const walk = (node: Node, marks: Marks) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/ /g, ' ').replace(/[\r\n]+/g, ' ');
      if (text) out.push({ text, ...marks });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === 'BR') {
      if (el.nextSibling) out.push({ text: NEWLINE }); // a trailing <br> only keeps its block open
      return;
    }
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
    const childMarks = marksOf(el, marks);
    const block = BLOCKS.has(el.tagName);
    if (block && !endsWithNewline()) out.push({ text: NEWLINE });
    const start = out.length;
    el.childNodes.forEach((child) => walk(child, childMarks));
    if (block && (out.length === start || !endsWithNewline())) out.push({ text: NEWLINE });
  };
  root.childNodes.forEach((child) => walk(child, {}));

  const lines: Line[] = [[]];
  for (const run of out) {
    if (run.text === NEWLINE) lines.push([]);
    else lines[lines.length - 1].push(run);
  }
  if (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop(); // newline closing the last block
  return mergeRuns(lines);
}

const sameMarks = (a: Run, b: Run) =>
  !!a.bold === !!b.bold &&
  !!a.italic === !!b.italic &&
  !!a.strike === !!b.strike &&
  (a.size ?? 'normal') === (b.size ?? 'normal');

function mergeRuns(lines: Line[]): Line[] {
  return lines.map((line) =>
    line.reduce<Run[]>((acc, run) => {
      const last = acc[acc.length - 1];
      if (last && sameMarks(last, run)) acc[acc.length - 1] = { ...last, text: last.text + run.text };
      else acc.push({ ...run });
      return acc;
    }, []),
  );
}

export function isEmptyMessage(lines: Line[]): boolean {
  return lines.every((line) => line.every((run) => !run.text.trim()));
}

/** The lines with the variables replaced by the data of one client. */
export function personalize(lines: Line[], vars: MessageVariables): Line[] {
  return lines.map((line) => line.map((run) => ({ ...run, text: applyVariables(run.text, vars) })));
}

/** What the client receives: WhatsApp has no text sizes and SMS has no format at all. */
export function forChannel(lines: Line[], channel: Channel): Line[] {
  return mergeRuns(
    lines.map((line) =>
      line.map(({ text, bold, italic, strike }) => (channel === 'WHATSAPP' ? { text, bold, italic, strike } : { text })),
    ),
  );
}

/** WhatsApp markers must touch the text: "*hola*" works, "*hola *" does not. */
function whatsAppRun(run: Run): string {
  const [, lead, body, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(run.text)!;
  if (!body) return run.text;
  let text = body;
  if (run.strike) text = `~${text}~`;
  if (run.italic) text = `_${text}_`;
  if (run.bold) text = `*${text}*`;
  return lead + text + trail;
}

/** Final text of the message for the channel (what would be sent). */
export function formatMessage(lines: Line[], channel: Channel): string {
  return lines
    .map((line) => line.map((run) => (channel === 'WHATSAPP' ? whatsAppRun(run) : run.text)).join(''))
    .join('\n')
    .trim();
}
