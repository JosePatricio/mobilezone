import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, ErrorState, Loading, Modal } from '@/shared/components';
import type { Id } from '@/shared/types/api';
import { SALES_KEY, saleApi } from '../services/saleApi';

interface ReceiptViewerProps {
  /** Sale whose receipt is shown; null = closed. */
  saleId: Id | null;
  onClose: () => void;
}

/**
 * Shows the PDF receipt (comprobante) inside the app with the browser PDF viewer.
 * Nothing is downloaded, so no "save as" dialog is opened.
 */
export function ReceiptViewer({ saleId, onClose }: ReceiptViewerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const query = useQuery({
    queryKey: [SALES_KEY, 'receipt', saleId],
    queryFn: () => saleApi.receipt(saleId as Id),
    enabled: saleId != null,
    gcTime: 0,
    staleTime: 0,
  });

  useEffect(() => {
    if (!query.data) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(new Blob([query.data], { type: 'application/pdf' }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [query.data]);

  return (
    <Modal
      open={saleId != null}
      title={`Comprobante · Venta #${saleId ?? ''}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={() => frameRef.current?.contentWindow?.print()} disabled={!url}>
            Imprimir
          </Button>
        </>
      }
    >
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : url ? (
        <iframe ref={frameRef} className="receipt-frame" src={url} title="Comprobante PDF" />
      ) : (
        <Loading />
      )}
    </Modal>
  );
}
