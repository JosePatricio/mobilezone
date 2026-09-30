import { useState } from 'react';
import { DEFAULT_PRODUCT_IMAGE, ProductThumb } from './Images';
import { Modal } from './Modal';

/** Product thumbnail that opens the image in a large view when clicked. */
export function ProductImagePreview({ src, alt }: { src: string | null; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="thumb-button" aria-label={`Ver imagen de ${alt}`} onClick={() => setOpen(true)}>
        <ProductThumb src={src} alt={alt} size="sm" />
      </button>
      {open && (
        <Modal open title={alt} onClose={() => setOpen(false)} size="lg">
          <img className="image-preview" src={src ?? DEFAULT_PRODUCT_IMAGE} alt={alt} />
        </Modal>
      )}
    </>
  );
}
