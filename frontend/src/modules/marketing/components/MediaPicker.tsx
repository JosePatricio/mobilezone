import { useRef, useState } from 'react';
import { Button } from '@/shared/components';
import type { MediaKind, MessageMedia } from '../types';

const MB = 1024 * 1024;

/** What WhatsApp accepts in the header of a template: JPG / PNG up to 5 MB, MP4 / 3GP up to 16 MB. */
export const MEDIA_TYPES: Record<MediaKind, string[]> = {
  image: ['image/jpeg', 'image/png'],
  video: ['video/mp4', 'video/3gpp'],
};
export const MEDIA_MAX_MB: Record<MediaKind, number> = { image: 5, video: 16 };
const MEDIA_LABELS: Record<MediaKind, string> = { image: 'La imagen', video: 'El video' };

const kindOf = (type: string): MediaKind | null =>
  (Object.keys(MEDIA_TYPES) as MediaKind[]).find((k) => MEDIA_TYPES[k].includes(type)) ?? null;

interface Props {
  media: MessageMedia | null;
  onChange: (media: MessageMedia | null) => void;
}

/** "¿Agregar imagen o video?": one optional file, previewed on the message. */
export function MediaPicker({ media, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const kind = kindOf(file.type);
    if (!kind) {
      setError('El archivo debe ser una imagen JPG / PNG o un video MP4.');
      return;
    }
    if (file.size > MEDIA_MAX_MB[kind] * MB) {
      setError(`${MEDIA_LABELS[kind]} supera los ${MEDIA_MAX_MB[kind]} MB.`);
      return;
    }
    setError(null);
    onChange({ kind, file, url: URL.createObjectURL(file) });
  };

  return (
    <div className="media-picker">
      <div className="choice-group" role="group" aria-label="Agregar imagen o video">
        <Button
          variant={media ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => {
            setError(null);
            input.current?.click();
          }}
        >
          {media ? 'Cambiar archivo' : 'Agregar imagen o video'}
        </Button>
        <Button
          variant={media ? 'secondary' : 'primary'}
          size="sm"
          onClick={() => {
            setError(null);
            onChange(null);
          }}
        >
          Sin archivo
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept={[...MEDIA_TYPES.image, ...MEDIA_TYPES.video].join(',')}
        data-testid="media-input"
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
      {media && (
        <p className="muted media-name">
          {media.kind === 'image' ? 'Imagen' : 'Video'}: {media.file.name}
        </p>
      )}
    </div>
  );
}
