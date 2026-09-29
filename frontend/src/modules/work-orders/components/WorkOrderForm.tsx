import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '@/app/store/AuthProvider';
import { BRANDS_KEY, brandApi } from '@/modules/brands/services/brandApi';
import { ClientSelect } from '@/modules/clients/components/ClientSelect';
import { MODELS_KEY, modelApi } from '@/modules/models/services/modelApi';
import { userApi } from '@/modules/users/services/userApi';
import { Button, Card, Checkbox, DatePicker, Input, MoneyInput, Select, Textarea } from '@/shared/components';
import { useOptions } from '@/shared/hooks/useCrud';
import { getErrorMessage } from '@/shared/services/apiError';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { fullName, todayIso } from '@/shared/utils/format';
import { isValidMoney, toCents } from '@/shared/utils/money';
import { type FormShape, zodForm, applyServerErrors, zMoney, zOptionalId, zOptionalText, zRequiredId } from '@/shared/utils/validation';
import { useWorkOrderStatuses } from '../hooks/useWorkOrderStatuses';
import type { WorkOrder, WorkOrderRequest } from '../types';
import { BalanceSummary } from './BalanceSummary';

const clientRef = z.object({ id: z.number(), nombre: z.string(), apellido: z.string(), email: z.string() });

export const workOrderSchema = z
  .object({
    cliente: clientRef.nullable().refine((v) => v !== null, 'Seleccione un cliente'),
    marca_id: zRequiredId('Seleccione una marca'),
    modelo_id: zRequiredId('Seleccione un modelo'),
    tecnico_id: zOptionalId,
    observacion: zOptionalText(5000),
    estado: z.coerce.number().int().min(0).max(2),
    garantia: z.boolean(),
    color: zOptionalText(50),
    presupuesto: zMoney,
    anticipo: zMoney,
    fecha: z.string().min(1, 'Seleccione una fecha'),
  })
  .refine((v) => toCents(v.anticipo) <= toCents(v.presupuesto), {
    path: ['anticipo'],
    message: 'El anticipo no puede ser mayor que el presupuesto',
  });
type FormInput = FormShape<typeof workOrderSchema>;
type FormOutput = z.output<typeof workOrderSchema>;

interface Props {
  order?: WorkOrder;
  onSubmit: (body: WorkOrderRequest) => Promise<void>;
  onCancel: () => void;
}

export function WorkOrderForm({ order, onSubmit, onCancel }: Props) {
  const { user, hasPermission } = useAuth();
  const canAssign = hasPermission(P.WORK_ORDERS_ASSIGN_TECHNICIAN);
  const isTechnician = user?.tipo_usuario === 'TECNICO';
  const { statuses } = useWorkOrderStatuses();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodForm(workOrderSchema),
    defaultValues: {
      cliente: order?.cliente ?? null,
      marca_id: order?.marca_id ?? '',
      modelo_id: order?.modelo_id ?? '',
      tecnico_id: order?.tecnico_id ?? (isTechnician && user ? user.id : ''),
      observacion: order?.observacion ?? '',
      estado: order?.estado ?? 0,
      garantia: order?.garantia ?? false,
      color: order?.color ?? '',
      presupuesto: order?.presupuesto ?? '0.00',
      anticipo: order?.anticipo ?? '0.00',
      fecha: order?.fecha ?? todayIso(),
    },
  });

  const marcaId = useWatch({ control, name: 'marca_id' });
  const [presupuesto, anticipo] = useWatch({ control, name: ['presupuesto', 'anticipo'] });
  const brands = useOptions(BRANDS_KEY, brandApi);
  const models = useOptions(MODELS_KEY, modelApi, { brand_id: Number(marcaId) }, Boolean(marcaId));
  const technicians = useQuery({
    queryKey: ['users', 'technicians'],
    queryFn: userApi.technicians,
    enabled: canAssign,
    staleTime: 60_000,
  });

  // Reset the model when the brand changes (models are filtered by brand).
  const previousBrand = useRef(marcaId);
  useEffect(() => {
    if (previousBrand.current !== marcaId) setValue('modelo_id', '');
    previousBrand.current = marcaId;
  }, [marcaId, setValue]);

  const withCurrent = <T extends { value: number; label: string }>(options: T[], id?: number, label?: string) =>
    id && label && !options.some((o) => o.value === id) ? [...options, { value: id, label } as T] : options;

  const brandOptions = withCurrent(
    (brands.data ?? []).map((b) => ({ value: b.id, label: b.nombre })),
    order?.marca_id,
    order?.marca.nombre,
  );
  const modelOptions = withCurrent(
    (models.data ?? []).map((m) => ({ value: m.id, label: m.nombre })),
    Number(marcaId) === order?.marca_id ? order?.modelo_id : undefined,
    order?.modelo.nombre,
  );
  const technicianOptions = withCurrent(
    (technicians.data ?? []).map((t) => ({ value: t.id, label: fullName(t) })),
    order?.tecnico_id ?? undefined,
    order?.tecnico ? fullName(order.tecnico) : undefined,
  );

  const submit = handleSubmit(async ({ cliente, ...values }) => {
    setServerError(null);
    try {
      await onSubmit({
        ...values,
        cliente_id: cliente!.id,
        // Technicians without assign permission never send someone else's id; the backend decides.
        tecnico_id: canAssign ? values.tecnico_id : isTechnician ? (user?.id ?? null) : (order?.tecnico_id ?? null),
      });
    } catch (err) {
      if (!applyServerErrors(err, setError)) setServerError(getErrorMessage(err));
    }
  });

  const safeMoney = (v: unknown) => (typeof v === 'string' && isValidMoney(v) ? v : '0');

  return (
    <form onSubmit={submit} noValidate>
      {serverError && (
        <div className="alert alert-error" role="alert">
          {serverError}
        </div>
      )}
      <Card title="Cliente">
        <Controller
          control={control}
          name="cliente"
          render={({ field, fieldState }) => (
            <ClientSelect value={field.value ?? null} onChange={field.onChange} error={fieldState.error?.message} />
          )}
        />
      </Card>

      <Card title="Equipo">
        <div className="form-grid">
          <Select label="Marca" required options={brandOptions} placeholder="Seleccione…" error={errors.marca_id?.message} {...register('marca_id')} />
          <Select
            label="Modelo"
            required
            options={modelOptions}
            placeholder={marcaId ? 'Seleccione…' : 'Seleccione primero una marca'}
            disabled={!marcaId}
            error={errors.modelo_id?.message}
            {...register('modelo_id')}
          />
          <Input label="Color" error={errors.color?.message} {...register('color')} />
          <Checkbox label="Garantía" toggle {...register('garantia')} />
        </div>
      </Card>

      <Card title="Trabajo">
        <div className="form-grid">
          <Textarea label="Observación" rows={4} className="full" error={errors.observacion?.message} {...register('observacion')} />
          <Select
            label="Estado"
            required
            options={statuses.map((s) => ({ value: s.value, label: s.label }))}
            error={errors.estado?.message}
            {...register('estado')}
          />
          {canAssign ? (
            <Select label="Técnico" options={technicianOptions} placeholder="Sin asignar" error={errors.tecnico_id?.message} {...register('tecnico_id')} />
          ) : (
            <div className="field">
              <span className="field-label">Técnico</span>
              <p className="readonly-value">
                {isTechnician ? `${fullName(user)} (usted)` : order?.tecnico ? fullName(order.tecnico) : 'Sin asignar'}
              </p>
            </div>
          )}
          <DatePicker label="Fecha" required error={errors.fecha?.message} {...register('fecha')} />
        </div>
      </Card>

      <Card title="Valores">
        <div className="form-grid">
          <MoneyInput label="Presupuesto" required error={errors.presupuesto?.message} {...register('presupuesto')} />
          <MoneyInput label="Anticipo" required error={errors.anticipo?.message} {...register('anticipo')} />
          <div className="full">
            <BalanceSummary presupuesto={safeMoney(presupuesto)} anticipo={safeMoney(anticipo)} />
            <p className="field-hint">El saldo definitivo es calculado por el sistema al guardar.</p>
          </div>
        </div>
      </Card>

      <div className="form-actions">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {order ? 'Guardar cambios' : 'Crear orden'}
        </Button>
      </div>
    </form>
  );
}
