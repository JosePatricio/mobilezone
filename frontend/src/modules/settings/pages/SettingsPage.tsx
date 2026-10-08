import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Card, ErrorState, Loading, MoneyInput, PageHeader, useToast } from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import { formatMoney, isValidMoney, toCents } from '@/shared/utils/money';
import { applyServerErrors, type FormShape, zMoney, zodForm } from '@/shared/utils/validation';
import { SETTINGS_KEY, type SalesGoals, settingsApi } from '../services/settingsApi';

const schema = z
  .object({ baja: zMoney, alta: zMoney })
  .refine((v) => toCents(v.alta) > toCents(v.baja), { path: ['alta'], message: 'Debe ser mayor que la meta baja' });
type FormInput = FormShape<typeof schema>;
type FormOutput = z.output<typeof schema>;

/** Configuración › Metas de venta: amounts that choose the emoji of "Has vendido" in the header. */
export function SettingsPage() {
  const query = useQuery({ queryKey: [SETTINGS_KEY, 'sales-goals'], queryFn: settingsApi.salesGoals });
  return (
    <>
      <PageHeader title="Metas de venta">
        Lo que cada usuario vende en el día se muestra arriba con un emoji según estas metas.
      </PageHeader>
      {query.isLoading ? (
        <Loading />
      ) : query.isError || !query.data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <GoalsForm goals={query.data} />
      )}
    </>
  );
}

function GoalsForm({ goals }: { goals: SalesGoals }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: settingsApi.updateSalesGoals,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SETTINGS_KEY] }),
  });
  const {
    register,
    handleSubmit,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({ resolver: zodForm(schema), defaultValues: goals });
  useEffect(() => reset(goals), [goals, reset]);
  const money = (v: unknown) => (typeof v === 'string' && isValidMoney(v) ? formatMoney(v.replace(',', '.')) : '—');
  const [baja, alta] = watch(['baja', 'alta']).map(money);

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await save.mutateAsync(values);
      toast.success('Metas guardadas.');
    } catch (err) {
      if (!applyServerErrors(err, setError)) setServerError(getErrorMessage(err));
    }
  });

  return (
    <Card title="Ventas del día">
      <form onSubmit={submit} noValidate className="form-stack">
        {serverError && (
          <div className="alert alert-error" role="alert">
            {serverError}
          </div>
        )}
        <MoneyInput label="Meta baja" required error={errors.baja?.message} {...register('baja')} />
        <MoneyInput label="Meta alta" required error={errors.alta?.message} {...register('alta')} />
        <ul className="goal-preview" aria-label="Vista previa">
          <li>
            <span aria-hidden>😞</span> Menos de {baja}
          </li>
          <li>
            <span aria-hidden>😊</span> De {baja} a {alta}
          </li>
          <li>
            <span aria-hidden>🤑</span> Más de {alta}
          </li>
        </ul>
        <div>
          <Button type="submit" loading={isSubmitting}>
            Guardar
          </Button>
        </div>
      </form>
    </Card>
  );
}
