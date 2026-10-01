import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Link of the public status page of an order (opened by the client from the QR). */
export function publicOrderUrl(codigo: string): string {
  const base = (import.meta.env.VITE_PUBLIC_URL || window.location.origin).replace(/\/$/, '');
  return `${base}/orden/${codigo}`;
}

/** QR code pointing to the public status page of the order. */
export function OrderQr({ codigo }: { codigo: string }) {
  const url = publicOrderUrl(codigo);
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' })
      .then((data) => active && setImage(data))
      .catch(() => active && setImage(null));
    return () => {
      active = false;
    };
  }, [url]);

  return (
    <div className="qr-box">
      {image ? <img src={image} alt="Código QR del estado de la orden" /> : <span className="muted">Generando QR…</span>}
      <small className="muted">El cliente puede escanearlo para ver el estado de su orden.</small>
      <a href={url} target="_blank" rel="noreferrer">
        {url}
      </a>
    </div>
  );
}
