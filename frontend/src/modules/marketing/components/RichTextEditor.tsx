import { useCallback, useEffect, useId, useRef, useState, type ClipboardEvent } from 'react';
import { type Line, type MessageVariable, parseEditor, VARIABLES } from '../message';

type Format = 'bold' | 'italic' | 'strikeThrough';

const FORMATS: { command: Format; label: string; text: string; className: string }[] = [
  { command: 'bold', label: 'Negrita', text: 'B', className: 'rte-bold' },
  { command: 'italic', label: 'Cursiva', text: 'I', className: 'rte-italic' },
  { command: 'strikeThrough', label: 'Tachado', text: 'S', className: 'rte-strike' },
];

/** Values of execCommand('fontSize'): 2 small, 3 normal, 5 large. */
const SIZES = [
  { value: '2', label: 'Pequeño' },
  { value: '3', label: 'Normal' },
  { value: '5', label: 'Grande' },
];

function runCommand(command: string, value?: string): boolean {
  try {
    return typeof document.execCommand === 'function' && document.execCommand(command, false, value);
  } catch {
    return false;
  }
}

function commandState(command: Format): boolean {
  try {
    return typeof document.queryCommandState === 'function' && document.queryCommandState(command);
  } catch {
    return false;
  }
}

interface Props {
  label: string;
  onChange: (lines: Line[]) => void;
  placeholder?: string;
  /** Plain text the editor starts with (one line per "\n"); it can be edited or erased. */
  defaultText?: string;
  /** Buttons to insert (default @NOMBRE, @TELEFONO). */
  variables?: readonly MessageVariable[];
  /** Added at the end of the text while set (if missing); removed from the text when it is unset. */
  requiredToken?: string;
}

/**
 * Text editor with bold, italic, strikethrough and size, plus buttons to insert the variables
 * (@NOMBRE, @TELEFONO). Pasted content goes in as plain text.
 */
export function RichTextEditor({ label, onChange, placeholder, defaultText, variables = VARIABLES, requiredToken }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const [active, setActive] = useState<Record<Format, boolean>>({ bold: false, italic: false, strikeThrough: false });
  const [size, setSize] = useState('3');

  const emit = useCallback(() => {
    if (ref.current) onChange(parseEditor(ref.current));
  }, [onChange]);

  const refreshToolbar = useCallback(() => {
    const editor = ref.current;
    const selection = document.getSelection();
    if (!editor || !selection?.anchorNode || !editor.contains(selection.anchorNode)) return;
    setActive({ bold: commandState('bold'), italic: commandState('italic'), strikeThrough: commandState('strikeThrough') });
  }, []);

  // The starting text goes in once, as if typed, so the page sees it right away.
  useEffect(() => {
    const editor = ref.current;
    if (!editor || !defaultText || editor.hasChildNodes()) return; // StrictMode runs effects twice
    defaultText.split('\n').forEach((line, i) => {
      if (i > 0) editor.append(document.createElement('br'));
      editor.append(document.createTextNode(line));
    });
    emit();
  }, []); // only on mount

  // The token goes in (new line at the end) or out of the text with its option, e.g. "¿Incluir ruleta?".
  const previousToken = useRef<string | undefined>(undefined);
  useEffect(() => {
    const editor = ref.current;
    const removed = previousToken.current;
    previousToken.current = requiredToken;
    if (!editor) return;
    if (requiredToken && !(editor.textContent ?? '').toUpperCase().includes(requiredToken)) {
      if (editor.hasChildNodes()) editor.append(document.createElement('br'));
      editor.append(document.createTextNode(requiredToken));
      emit();
    } else if (!requiredToken && removed) {
      const pattern = new RegExp(`\\s?${removed}\\b`, 'gi');
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.textContent && pattern.test(node.textContent)) node.textContent = node.textContent.replace(pattern, '');
        pattern.lastIndex = 0;
      }
      emit();
    }
  }, [requiredToken]); // only when the option changes

  useEffect(() => {
    document.addEventListener('selectionchange', refreshToolbar);
    return () => document.removeEventListener('selectionchange', refreshToolbar);
  }, [refreshToolbar]);

  const exec = (command: string, value?: string) => {
    ref.current?.focus();
    runCommand(command, value);
    refreshToolbar();
    emit();
  };

  /** Inserts at the cursor; without editing support (or focus) it is added at the end. */
  const insertText = (text: string) => {
    const editor = ref.current;
    if (!editor) return;
    const selection = document.getSelection();
    const inside = selection?.anchorNode && editor.contains(selection.anchorNode);
    if (!inside || !runCommand('insertText', text)) editor.append(document.createTextNode(text));
    emit();
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    insertText(e.clipboardData.getData('text/plain'));
  };

  return (
    <div className="rte">
      <span id={labelId} className="field-label">
        {label}
      </span>
      <div className="rte-toolbar" role="toolbar" aria-label="Formato del texto">
        {FORMATS.map((f) => (
          <button
            key={f.command}
            type="button"
            className={`rte-btn ${f.className}`}
            aria-label={f.label}
            title={f.label}
            aria-pressed={active[f.command]}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(f.command)}
          >
            {f.text}
          </button>
        ))}
        <select
          className="input rte-size"
          aria-label="Tamaño"
          title="Tamaño"
          value={size}
          onChange={(e) => {
            setSize(e.target.value);
            exec('fontSize', e.target.value);
          }}
        >
          {SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="rte-separator" aria-hidden />
        {variables.map((v) => (
          <button
            key={v.token}
            type="button"
            className="rte-btn rte-variable"
            title={`Insertar ${v.token}: ${v.hint}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertText(v.token)}
          >
            {v.token}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        className="rte-content input"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelId}
        data-placeholder={placeholder}
        onInput={emit}
        onPaste={onPaste}
        onDrop={(e) => e.preventDefault()}
        onKeyUp={refreshToolbar}
        onMouseUp={refreshToolbar}
      />
    </div>
  );
}
