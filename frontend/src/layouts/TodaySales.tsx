import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { SALES_KEY, saleApi } from '@/modules/sales/services/saleApi';
import { SETTINGS_KEY, salesMood, settingsApi } from '@/modules/settings/services/settingsApi';
import { formatMoney } from '@/shared/utils/money';

/** "Has vendido $X" of the logged user today, with an emoji by the sales goals; opens Ventas. */
export function TodaySales() {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: [SALES_KEY, 'summary', 'today'],
    queryFn: saleApi.todaySummary,
    refetchInterval: 60_000,
  });
  const goals = useQuery({ queryKey: [SETTINGS_KEY, 'sales-goals'], queryFn: settingsApi.salesGoals, staleTime: 60_000 });
  if (!query.data) return null;
  const { cantidad, total } = query.data;
  const mood = goals.data ? salesMood(total, goals.data) : null;
  return (
    <button
      type="button"
      className="today-sales"
      title={`${cantidad} venta(s) confirmada(s) hoy · Ir a Ventas`}
      onClick={() => navigate('/sales')}
    >
      <span>
        Has vendido <strong>{formatMoney(total)}</strong>
      </span>
      {mood && (
        <span className="today-sales-emoji" role="img" aria-label={mood.label}>
          {mood.emoji}
        </span>
      )}
    </button>
  );
}
