import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorState, Loading, PageHeader, useToast } from '@/shared/components';
import { formatOrderNumber } from '@/shared/utils/format';
import { WorkOrderForm } from '../components/WorkOrderForm';
import { WORK_ORDERS_KEY, workOrderApi } from '../services/workOrderApi';

export function WorkOrderFormPage() {
  const params = useParams();
  const id = params.id ? Number(params.id) : undefined;
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [WORK_ORDERS_KEY, 'detail', id],
    queryFn: () => workOrderApi.get(id!),
    enabled: id !== undefined,
  });

  if (id !== undefined && query.isLoading) return <Loading />;
  if (id !== undefined && (query.isError || !query.data)) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  return (
    <>
      <PageHeader title={id ? `Editar orden #${formatOrderNumber(query.data?.num_orden)}` : 'Nueva orden de trabajo'} />
      <WorkOrderForm
        key={query.data?.updated_at ?? 'new'}
        order={query.data}
        onCancel={() => navigate(id ? `/work-orders/${id}` : '/work-orders')}
        onSubmit={async (body) => {
          const saved = id ? await workOrderApi.update(id, body) : await workOrderApi.create(body);
          await queryClient.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] });
          toast.success(id ? 'Orden actualizada.' : `Orden #${formatOrderNumber(saved.num_orden)} creada.`);
          navigate(`/work-orders/${saved.id}`);
        }}
      />
    </>
  );
}
