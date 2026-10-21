import { useRef, useState } from 'react';
import { Button } from '@/shared/components';
import type { MessageMedia } from '../types';

/** WhatsApp limit for images. */
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

interface Props {
  media: MessageMedia | null;
  onChange: (media: MessageMedia | null) => void;
}

/** "¿Agregar imagen?": one optional image, previewed on the message. */
export function MediaPicker({ media, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('El archivo no es una imagen.');
      return;
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setError('La imagen supera los 5 MB.');
      return;
    }
    setError(null);
    onChange({ kind: 'image', file, url: URL.createObjectURL(file) });
  };

  return (
    <div className="media-picker">
      <div className="choice-group" role="group" aria-label="Agregar imagen">
        <Button
          variant={media ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => {
            setError(null);
            input.current?.click();
          }}
        >
          {media ? 'Cambiar imagen' : 'Agregar imagen'}
        </Button>
        <Button
          variant={media ? 'secondary' : 'primary'}
          size="sm"
          onClick={() => {
            setError(null);
            onChange(null);
          }}
        >
          Sin imagen
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept="image/jpeg,image/png"
        data-testid="image-input"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {media && <p className="muted media-name">Imagen: {media.file.name}</p>}
    </div>
  );
}
