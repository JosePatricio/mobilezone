import { describe, expect, it } from 'vitest';
import { applyVariables, formatMessage, forChannel, isEmptyMessage, parseEditor, personalize } from './message';

function editor(html: string): HTMLElement {
  return new DOMParser().parseFromString(`<div id="e">${html}</div>`, 'text/html').getElementById('e')!;
}

const vars = { nombre: 'Ana', telefono: 'Samsung' };

describe('CRM message', () => {
  it('replaces @NOMBRE and @TELEFONO with the data of the client', () => {
    expect(applyVariables('Hola @NOMBRE, tienes una promoción para tu teléfono @TELEFONO a 430$.', vars)).toBe(
      'Hola Ana, tienes una promoción para tu teléfono Samsung a 430$.',
    );
    expect(applyVariables('@nombre', { nombre: '$&', telefono: '' })).toBe('$&');
  });

  it('reads the lines of the editor (blocks, <br> and empty lines)', () => {
    const lines = parseEditor(editor('Hola<div><br></div><div>Promo</div><div>a<br>b</div>'));
    expect(lines.map((l) => l.map((r) => r.text).join(''))).toEqual(['Hola', '', 'Promo', 'a', 'b']);
  });

  it('keeps bold, italic, strikethrough and size', () => {
    const [line] = parseEditor(
      editor('<b>Oferta</b> <i>hoy</i> <strike>500$</strike> <font size="5">430$</font><span style="font-weight: bold">!</span>'),
    );
    expect(line).toEqual([
      { text: 'Oferta', bold: true },
      { text: ' ' },
      { text: 'hoy', italic: true },
      { text: ' ' },
      { text: '500$', strike: true },
      { text: ' ' },
      { text: '430$', size: 'large' },
      { text: '!', bold: true },
    ]);
  });

  it('formats the message for WhatsApp with its markers and for SMS as plain text', () => {
    const lines = personalize(parseEditor(editor('Hola <b>@NOMBRE </b><div><i>tu @TELEFONO</i> <s>500$</s> 430$</div>')), vars);
    expect(formatMessage(lines, 'WHATSAPP')).toBe('Hola *Ana* \n_tu Samsung_ ~500$~ 430$');
    expect(formatMessage(lines, 'SMS')).toBe('Hola Ana \ntu Samsung 500$ 430$');
  });

  it('drops what the channel cannot show', () => {
    const lines = parseEditor(editor('<b><font size="5">Gran</font></b> oferta'));
    expect(forChannel(lines, 'WHATSAPP')[0][0]).toEqual({ text: 'Gran', bold: true, italic: undefined, strike: undefined });
    expect(forChannel(lines, 'SMS')).toEqual([[{ text: 'Gran oferta' }]]);
  });

  it('detects an empty message', () => {
    expect(isEmptyMessage(parseEditor(editor('<div><br></div> ')))).toBe(true);
    expect(isEmptyMessage(parseEditor(editor('Hola')))).toBe(false);
  });
});
