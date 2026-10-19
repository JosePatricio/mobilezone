import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/store/AuthProvider';
import { SALES_KEY, saleApi } from '@/modules/sales/services/saleApi';
import { SETTINGS_KEY, salesMood, settingsApi } from '@/modules/settings/services/settingsApi';
import { formatMoney } from '@/shared/utils/money';

/**
 * "Has vendido $X" of the logged user today (only their own sales), net of the spare part costs of the
 * work order sales, with an emoji by the sales goals; only on hover shows "Neto en ventas"; opens Ventas.
 */
export function TodaySales() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const query = useQuery({
    // By user, so a seller logging in on the same browser never sees the cached sales of the previous one.
    queryKey: [SALES_KEY, 'summary', 'today', user?.id],
    queryFn: saleApi.todaySummary,
    refetchInterval: 60_000,
    enabled: !!user,
  });
  const goals = useQuery({ queryKey: [SETTINGS_KEY, 'sales-goals'], queryFn: settingsApi.salesGoals, staleTime: 60_000 });
  if (!query.data) return null;
  const { neto } = query.data;
  const mood = goals.data ? salesMood(neto, goals.data) : null;
  return (
    <div className="today-sales-wrap">
      <button type="button" className="today-sales" aria-describedby="today-sales-net" onClick={() => navigate('/sales')}>
        <span>
          Has vendido <strong>{formatMoney(neto)}</strong>
        </span>
        {mood && (
          <span className="today-sales-emoji" role="img" aria-label={mood.label}>
            {mood.emoji}
          </span>
        )}
      </button>
      <span id="today-sales-net" role="tooltip" className="today-sales-tip">
        Neto en ventas <strong>{formatMoney(neto)}</strong>
      </span>
    </div>
  );
}
