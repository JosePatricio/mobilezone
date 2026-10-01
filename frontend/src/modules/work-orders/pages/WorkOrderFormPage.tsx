import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorState, Loading, PageHeader, useToast } from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
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
        onSubmit={async (body, photos) => {
          const saved = id ? await workOrderApi.update(id, body) : await workOrderApi.create(body);
          // Photos need the order id: they are applied once the order is saved.
          const results = await Promise.allSettled([
            ...photos.removed.map((photoId) => workOrderApi.removePhoto(saved.id, photoId)),
            ...photos.added.map((file) => workOrderApi.addPhoto(saved.id, file)),
          ]);
          await queryClient.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] });
          toast.success(id ? 'Orden actualizada.' : `Orden #${formatOrderNumber(saved.num_orden)} creada.`);
          const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
          if (failed) toast.error(`La orden se guardó, pero algunas fotos no: ${getErrorMessage(failed.reason)}`);
          navigate(`/work-orders/${saved.id}`);
        }}
      />
    </>
  );
}
