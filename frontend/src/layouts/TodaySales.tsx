import { useQuery } from '@tanstack/react-query';
import { SALES_KEY, saleApi } from '@/modules/sales/services/saleApi';
import { formatMoney } from '@/shared/utils/money';

/** Total sold today by the logged user (left of the name in the header). */
export function TodaySales() {
  const query = useQuery({
    queryKey: [SALES_KEY, 'summary', 'today'],
    queryFn: saleApi.todaySummary,
    refetchInterval: 60_000,
  });
  if (!query.data) return null;
  const { cantidad, total } = query.data;
  return (
    <div className="today-sales" title={`${cantidad} venta(s) confirmada(s) hoy`} aria-label="Mis ventas de hoy">
      <small>Ventas de hoy</small>
      <strong>{formatMoney(total)}</strong>
    </div>
  );
}
