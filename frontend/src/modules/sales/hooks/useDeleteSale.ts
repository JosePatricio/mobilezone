import { useMutation, useQueryClient } from '@tanstack/react-query';
import { INVENTORY_KEY } from '@/modules/inventory/services/inventoryApi';
import { PRODUCTS_KEY } from '@/modules/products/services/productApi';
import { useConfirm, useToast } from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import { SALES_KEY, saleApi } from '../services/saleApi';
import type { Sale } from '../types';

/**
 * "Eliminar" a sale: it is cancelled (kept as ANULADA for auditing) and every unit
 * goes back to the stock of its branch.
 */
export function useDeleteSale() {
  const confirm = useConfirm();
  const toast = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (id: number) => saleApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SALES_KEY] });
      queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
      queryClient.invalidateQueries({ queryKey: [INVENTORY_KEY] });
    },
  });

  const remove = async (sale: Pick<Sale, 'id'>): Promise<boolean> => {
    const ok = await confirm({
      title: 'Eliminar venta',
      message: `¿Está seguro de que desea eliminar la venta #${sale.id}? Quedará anulada y el stock de sus productos se devolverá a la sucursal.`,
      confirmLabel: 'Eliminar venta',
      danger: true,
    });
    if (!ok) return false;
    try {
      await mutation.mutateAsync(sale.id);
      toast.success(`Venta #${sale.id} eliminada (anulada).`);
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err));
      return false;
    }
  };

  return { remove, isPending: mutation.isPending };
}
