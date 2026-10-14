import { useRef, useState } from 'react';
import { Button } from '@/shared/components';
import type { MediaKind, MessageMedia } from '../types';

/** WhatsApp limit for videos (images are smaller anyway). */
export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

const ACCEPT: Record<MediaKind, string> = { image: 'image/*', video: 'video/*' };
const LABEL: Record<MediaKind, string> = { image: 'Imagen', video: 'Video' };

interface Props {
  media: MessageMedia | null;
  onChange: (media: MessageMedia | null) => void;
}

/** "¿Agregar video o imagen?": one optional file, previewed on the message. */
export function MediaPicker({ media, onChange }: Props) {
  const inputs = { image: useRef<HTMLInputElement>(null), video: useRef<HTMLInputElement>(null) };
  const [error, setError] = useState<string | null>(null);

  const choose = (next: MediaKind) => {
    setError(null);
    inputs[next].current?.click();
  };

  const onFile = (kind: MediaKind, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith(`${kind}/`)) {
      setError(`El archivo no es ${kind === 'image' ? 'una imagen' : 'un video'}.`);
      return;
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setError('El archivo supera los 16 MB.');
      return;
    }
    setError(null);
    onChange({ kind, file, url: URL.createObjectURL(file) });
  };

  return (
    <div className="media-picker">
      <div className="choice-group" role="group" aria-label="Agregar video o imagen">
        {(['image', 'video'] as const).map((k) => (
          <Button key={k} variant={media?.kind === k ? 'primary' : 'secondary'} size="sm" onClick={() => choose(k)}>
            {media?.kind === k ? `Cambiar ${LABEL[k].toLowerCase()}` : `Agregar ${LABEL[k].toLowerCase()}`}
          </Button>
        ))}
        <Button
          variant={media ? 'secondary' : 'primary'}
          size="sm"
          onClick={() => {
            setError(null);
            onChange(null);
          }}
        >
          Sin imagen ni video
        </Button>
      </div>
      {(['image', 'video'] as const).map((k) => (
        <input
          key={k}
          ref={inputs[k]}
          type="file"
          hidden
          accept={ACCEPT[k]}
          data-testid={`${k}-input`}
          onChange={(e) => {
            onFile(k, e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      ))}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {media && (
        <p className="muted media-name">
          {LABEL[media.kind]}: {media.file.name}
        </p>
      )}
    </div>
  );
}
