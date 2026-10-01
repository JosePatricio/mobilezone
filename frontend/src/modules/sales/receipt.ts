import type { Id } from '@/shared/types/api';
import { formatOrderNumber } from '@/shared/utils/format';
import { saleApi } from './services/saleApi';

/**
 * Downloads the PDF receipt (comprobante) of a sale. A download is used instead of
 * window.open because it is not blocked by pop-up blockers after an async request.
 */
export async function downloadReceipt(saleId: Id): Promise<void> {
  const blob = await saleApi.receipt(saleId);
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `comprobante-${formatOrderNumber(saleId)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
