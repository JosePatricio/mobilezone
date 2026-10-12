import { useQuery } from '@tanstack/react-query';
import { Button, ErrorState, Loading, Modal } from '@/shared/components';
import type { Id } from '@/shared/types/api';
import { SALES_KEY, saleApi } from '../services/saleApi';
import { PrintableSale, SaleReceipt } from './PrintableSale';

interface ReceiptViewerProps {
  /** Sale whose receipt is shown; null = closed. */
  saleId: Id | null;
  onClose: () => void;
}

/**
 * Shows the receipt (comprobante / factura) of the sale as it will be printed: 80 mm thermal
 * receipt printed with window.print, the same format as the work orders.
 */
export function ReceiptViewer({ saleId, onClose }: ReceiptViewerProps) {
  const query = useQuery({
    queryKey: [SALES_KEY, 'detail', saleId],
    queryFn: () => saleApi.get(saleId as Id),
    enabled: saleId != null,
  });
  const sale = saleId != null ? query.data : undefined;

  return (
    <Modal
      open={saleId != null}
      title={`Comprobante · Venta #${saleId ?? ''}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={() => window.print()} disabled={!sale}>
            Imprimir
          </Button>
        </>
      }
    >
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : sale ? (
        <>
          <div className="receipt-preview" data-testid="receipt-preview">
            <SaleReceipt sale={sale} />
          </div>
          <PrintableSale sale={sale} />
        </>
      ) : (
        <Loading />
      )}
    </Modal>
  );
}
