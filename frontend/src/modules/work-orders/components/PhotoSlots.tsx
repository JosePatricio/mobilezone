import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/shared/components';
import { IMAGE_ACCEPT, MAX_IMAGE_BYTES } from '@/shared/components/Images';
import type { WorkOrderPhoto } from '../types';

export const MAX_PHOTOS = 3;

/** Photo changes applied after the order is saved (uploads need the order id). */
export interface PhotoChanges {
  existing: WorkOrderPhoto[];
  removed: number[];
  added: File[];
}

export const photoChanges = (existing: WorkOrderPhoto[] = []): PhotoChanges => ({ existing, removed: [], added: [] });

interface Props {
  value: PhotoChanges;
  onChange: (value: PhotoChanges) => void;
}

/** Up to 3 photos of the device (JPG, PNG or WEBP, max 2 MB). On phones the camera can be used. */
export function PhotoSlots({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const kept = value.existing.filter((p) => !value.removed.includes(p.id));
  const previews = useMemo(() => value.added.map((file) => URL.createObjectURL(file)), [value.added]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);
  const free = MAX_PHOTOS - kept.length - value.added.length;

  const onFile = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!IMAGE_ACCEPT.split(',').includes(file.type)) return setError('Formato no permitido. Use JPG, PNG o WEBP.');
    if (file.size > MAX_IMAGE_BYTES) return setError('La imagen supera el tamaño máximo de 2 MB.');
    onChange({ ...value, added: [...value.added, file] });
  };

  return (
    <div className="field">
      <span className="field-label">Fotos del equipo (máx. {MAX_PHOTOS})</span>
      <div className="photo-slots">
        {kept.map((photo, i) => (
          <figure key={photo.id} className="photo-slot">
            <img src={photo.url} alt={`Foto ${i + 1}`} />
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              onClick={() => onChange({ ...value, removed: [...value.removed, photo.id] })}
            >
              Quitar
            </Button>
          </figure>
        ))}
        {previews.map((url, i) => (
          <figure key={url} className="photo-slot">
            <img src={url} alt={`Foto nueva ${i + 1}`} />
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              onClick={() => onChange({ ...value, added: value.added.filter((_, j) => j !== i) })}
            >
              Quitar
            </Button>
          </figure>
        ))}
        {Array.from({ length: Math.max(free, 0) }, (_, i) => (
          <button key={`empty-${i}`} type="button" className="photo-slot photo-slot-empty" onClick={() => inputRef.current?.click()}>
            + Agregar foto
          </button>
        ))}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        capture="environment"
        className="sr-only"
        aria-label="Agregar foto del equipo"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="field-hint">JPG, PNG o WEBP · máx. 2 MB cada una. Se suben al guardar la orden.</p>
      )}
    </div>
  );
}
