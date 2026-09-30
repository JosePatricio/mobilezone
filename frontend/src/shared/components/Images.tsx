import { useEffect, useId, useRef, useState } from 'react';
import { Button } from './Button';

export const DEFAULT_PRODUCT_IMAGE = '/img/product-default.svg';
export const DEFAULT_AVATAR = '/img/avatar-default.svg';

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Image with a default fallback when there is no URL or it fails to load. */
function FallbackImage({ src, fallback, alt, className }: { src?: string | null; fallback: string; alt: string; className: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <img
      src={src && !failed ? src : fallback}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function Avatar({ src, alt, size = 'md' }: { src?: string | null; alt: string; size?: 'sm' | 'md' | 'lg' }) {
  return <FallbackImage src={src} fallback={DEFAULT_AVATAR} alt={alt} className={`avatar avatar-${size}`} />;
}

export function ProductThumb({ src, alt, size = 'md' }: { src?: string | null; alt: string; size?: 'sm' | 'md' | 'lg' }) {
  return <FallbackImage src={src} fallback={DEFAULT_PRODUCT_IMAGE} alt={alt} className={`thumb thumb-${size}`} />;
}

export interface ImageSelection {
  /** New file chosen by the user (uploaded after saving the form). */
  file: File | null;
  /** The current image must be removed. */
  remove: boolean;
}

export const NO_IMAGE_CHANGE: ImageSelection = { file: null, remove: false };

interface ImageFieldProps {
  label: string;
  currentUrl?: string | null;
  variant: 'avatar' | 'product';
  value: ImageSelection;
  onChange: (value: ImageSelection) => void;
}

/** Image picker with preview, validation (type / 2 MB) and removal. The default image is shown when empty. */
export function ImageField({ label, currentUrl, variant, value, onChange }: ImageFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!value.file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value.file]);

  const shown = preview ?? (value.remove ? null : currentUrl);
  const hasImage = Boolean(shown);

  const onFile = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!IMAGE_ACCEPT.split(',').includes(file.type)) {
      setError('Formato no permitido. Use JPG, PNG o WEBP.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('La imagen supera el tamaño máximo de 2 MB.');
      return;
    }
    onChange({ file, remove: false });
  };

  return (
    <div className="field image-field">
      <span className="field-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="image-field-body">
        {variant === 'avatar' ? <Avatar src={shown} alt={label} size="lg" /> : <ProductThumb src={shown} alt={label} size="lg" />}
        <div className="image-field-actions">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept={IMAGE_ACCEPT}
            className="sr-only"
            aria-labelledby={`${id}-label`}
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>
            {hasImage ? 'Cambiar' : 'Subir imagen'}
          </Button>
          {hasImage && (
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => onChange({ file: null, remove: true })}>
              Quitar
            </Button>
          )}
          <small className="muted">JPG, PNG o WEBP · máx. 2 MB</small>
        </div>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
