import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '@/app/store/AuthProvider';
import { BRANDS_KEY, brandApi } from '@/modules/brands/services/brandApi';
import { MODELS_KEY, modelApi } from '@/modules/models/services/modelApi';
import { userApi } from '@/modules/users/services/userApi';
import { hasRole, SYSTEM_ROLES } from '@/modules/users/types';
import { Button, Card, DatePicker, Input, MoneyInput, Select, Textarea } from '@/shared/components';
import { Combobox } from '@/shared/components/Combobox';
import { useOptions } from '@/shared/hooks/useCrud';
import { getErrorMessage, toApiError } from '@/shared/services/apiError';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { fullName, todayIso } from '@/shared/utils/format';
import { cleanIdentificacion, isValidIdentificacion, zCelular, zIdentificacion } from '@/shared/utils/identification';
import { calculateBalance, formatMoney, isValidMoney, toCents } from '@/shared/utils/money';
import { type FormShape, zodForm, applyServerErrors, zMoney, zOptionalId, zOptionalText, zRequiredId, zText } from '@/shared/utils/validation';
import { useWorkOrderCatalogs } from '../hooks/useWorkOrderCatalogs';
import { useWorkOrderStatuses } from '../hooks/useWorkOrderStatuses';
import { workOrderApi } from '../services/workOrderApi';
import { DISPLAY_CHANGE, type LockType, type WorkOrder, type WorkOrderRequest } from '../types';
import { MIN_PATTERN_DOTS, parsePattern, PatternLock } from './PatternLock';
import { photoChanges, PhotoSlots, type PhotoChanges } from './PhotoSlots';

export const workOrderSchema = z
  .object({
    cliente: z.object({
      identificacion: zIdentificacion,
      nombre: zText(100),
      apellido: zText(100),
      celular: zCelular,
    }),
    marca_id: zRequiredId('Seleccione una marca'),
    modelo_id: zRequiredId('Seleccione un modelo'),
    color: zOptionalText(50),
    motivo_ingreso: z.string().min(1, 'Seleccione el motivo de ingreso'),
    tipo_display: z.string().optional().transform((v) => (v ? v : null)),
    tipo_garantia: z.string().min(1, 'Seleccione el tipo de garantía'),
    bloqueo_tipo: z.enum(['NINGUNO', 'PATRON', 'PIN']),
    bloqueo_valor: z.string().trim().optional().transform((v) => (v ? v : null)),
    tecnico_id: zOptionalId,
    observacion: zOptionalText(5000),
    estado: z.coerce.number().int().min(0).max(2),
    presupuesto: zMoney,
    anticipo: zMoney,
    fecha: z.string().min(1, 'Seleccione una fecha'),
  })
  .superRefine((v, ctx) => {
    if (toCents(v.anticipo) > toCents(v.presupuesto)) {
      ctx.addIssue({ code: 'custom', path: ['anticipo'], message: 'El anticipo no puede ser mayor que el costo de reparación' });
    }
    if (v.motivo_ingreso === DISPLAY_CHANGE && !v.tipo_display) {
      ctx.addIssue({ code: 'custom', path: ['tipo_display'], message: 'Seleccione el tipo de display' });
    }
    if (v.bloqueo_tipo === 'PATRON' && parsePattern(v.bloqueo_valor).length < MIN_PATTERN_DOTS) {
      ctx.addIssue({ code: 'custom', path: ['bloqueo_valor'], message: `Dibuje un patrón de al menos ${MIN_PATTERN_DOTS} puntos` });
    }
    if (v.bloqueo_tipo === 'PIN' && !/^\d{4,12}$/.test(v.bloqueo_valor ?? '')) {
      ctx.addIssue({ code: 'custom', path: ['bloqueo_valor'], message: 'El PIN debe tener entre 4 y 12 dígitos' });
    }
  })
  .transform((v) => ({
    ...v,
    tipo_display: v.motivo_ingreso === DISPLAY_CHANGE ? v.tipo_display : null,
    bloqueo_valor: v.bloqueo_tipo === 'NINGUNO' ? null : v.bloqueo_valor,
  }));
type FormInput = FormShape<typeof workOrderSchema>;
type FormOutput = z.output<typeof workOrderSchema>;

interface Props {
  order?: WorkOrder;
  onSubmit: (body: WorkOrderRequest, photos: PhotoChanges) => Promise<void>;
  onCancel: () => void;
}

type ClientLookup = 'idle' | 'searching' | 'found' | 'new';

export function WorkOrderForm({ order, onSubmit, onCancel }: Props) {
  const { user, hasPermission } = useAuth();
  const canAssign = hasPermission(P.WORK_ORDERS_ASSIGN_TECHNICIAN);
  const isTechnician = hasRole(user, SYSTEM_ROLES.TECNICO);
  const { statuses } = useWorkOrderStatuses();
  const { catalogs } = useWorkOrderCatalogs();
  const [serverError, setServerError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<ClientLookup>(order ? 'found' : 'idle');
  const [photos, setPhotos] = useState<PhotoChanges>(() => photoChanges(order?.photos));

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodForm(workOrderSchema),
    defaultValues: {
      cliente: {
        identificacion: order?.cliente.identificacion ?? '',
        nombre: order?.cliente.nombre ?? '',
        apellido: order?.cliente.apellido ?? '',
        celular: order?.cliente.celular ?? '',
      },
      marca_id: order?.marca_id ?? '',
      modelo_id: order?.modelo_id ?? '',
      color: order?.color ?? '',
      motivo_ingreso: order?.motivo_ingreso ?? '',
      tipo_display: order?.tipo_display ?? '',
      tipo_garantia: order?.tipo_garantia ?? 'SIN_GARANTIA',
      bloqueo_tipo: order?.bloqueo_tipo ?? 'NINGUNO',
      bloqueo_valor: order?.bloqueo_valor ?? '',
      tecnico_id: order?.tecnico_id ?? (isTechnician && user ? user.id : ''),
      observacion: order?.observacion ?? '',
      estado: order?.estado ?? 0,
      presupuesto: order?.presupuesto ?? '0.00',
      anticipo: order?.anticipo ?? '0.00',
      fecha: order?.fecha ?? todayIso(),
    },
  });

  const marcaId = useWatch({ control, name: 'marca_id' });
  const motivo = useWatch({ control, name: 'motivo_ingreso' });
  const bloqueo = useWatch({ control, name: 'bloqueo_tipo' }) as LockType;
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

  /** Looks the client up by cédula / RUC: an existing client fills the form, otherwise it is registered on save. */
  const lookupClient = async () => {
    const identificacion = cleanIdentificacion(String(getValues('cliente.identificacion') ?? ''));
    if (!isValidIdentificacion(identificacion)) {
      setError('cliente.identificacion', { type: 'manual', message: 'La cédula o el RUC no es válido' });
      return;
    }
    clearErrors('cliente');
    setLookup('searching');
    try {
      const client = await workOrderApi.lookupCustomer(identificacion);
      setValue('cliente.identificacion', identificacion);
      setValue('cliente.nombre', client.nombre);
      setValue('cliente.apellido', client.apellido);
      setValue('cliente.celular', client.celular ?? '');
      setLookup('found');
    } catch (err) {
      const apiError = toApiError(err);
      if (apiError.status === 404) {
        setValue('cliente.nombre', '');
        setValue('cliente.apellido', '');
        setValue('cliente.celular', '');
        setLookup('new');
      } else {
        setLookup('idle');
        setError('cliente.identificacion', { type: 'server', message: apiError.message });
      }
    }
  };

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

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await onSubmit(
        {
          ...values,
          // Technicians without assign permission never send someone else's id; the backend decides.
          tecnico_id: canAssign ? values.tecnico_id : isTechnician ? (user?.id ?? null) : (order?.tecnico_id ?? null),
        },
        photos,
      );
    } catch (err) {
      if (!applyServerErrors(err, setError)) setServerError(getErrorMessage(err));
    }
  });

  const safeMoney = (v: unknown) => (typeof v === 'string' && isValidMoney(v) ? v : '0');
  const saldo = calculateBalance(safeMoney(presupuesto), safeMoney(anticipo));
  const clientLocked = lookup === 'found';

  return (
    <form onSubmit={submit} noValidate>
      {serverError && (
        <div className="alert alert-error" role="alert">
          {serverError}
        </div>
      )}
      <Card title="Cliente">
        <div className="form-grid">
          <div className="lookup-row full">
            <Input
              label="Cédula / RUC"
              required
              inputMode="numeric"
              maxLength={13}
              hint="Presione Enter para buscar al cliente"
              error={errors.cliente?.identificacion?.message}
              {...register('cliente.identificacion', {
                onChange: () => lookup !== 'idle' && setLookup('idle'),
              })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void lookupClient();
                }
              }}
            />
            <Button variant="secondary" onClick={() => void lookupClient()} loading={lookup === 'searching'}>
              Buscar
            </Button>
          </div>
          {lookup === 'found' && <p className="field-hint full">Cliente registrado.</p>}
          {lookup === 'new' && <p className="field-hint full">Cliente nuevo: se registrará al guardar la orden.</p>}
          <Input
            label="Nombres"
            required
            readOnly={clientLocked}
            error={errors.cliente?.nombre?.message}
            {...register('cliente.nombre')}
          />
          <Input
            label="Apellidos"
            required
            readOnly={clientLocked}
            error={errors.cliente?.apellido?.message}
            {...register('cliente.apellido')}
          />
          <Input
            label="Celular"
            inputMode="tel"
            error={errors.cliente?.celular?.message}
            {...register('cliente.celular')}
          />
        </div>
      </Card>

      <Card title="Datos del celular">
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
          <Controller
            control={control}
            name="motivo_ingreso"
            render={({ field, fieldState }) => (
              <Combobox
                label="Motivo de ingreso"
                required
                options={catalogs.motivos_ingreso}
                value={field.value as string}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
          {motivo === DISPLAY_CHANGE && (
            <Select
              label="Tipo de display"
              required
              options={catalogs.tipos_display}
              placeholder="Seleccione…"
              error={errors.tipo_display?.message}
              {...register('tipo_display')}
            />
          )}
          <Select
            label="Tipo de garantía"
            required
            options={catalogs.tipos_garantia}
            error={errors.tipo_garantia?.message}
            {...register('tipo_garantia')}
          />
        </div>
      </Card>

      <Card title="Desbloqueo del equipo">
        <div className="lock-types" role="radiogroup" aria-label="Tipo de bloqueo">
          {catalogs.tipos_bloqueo.map((option) => (
            <label key={option.value} className="radio">
              <input
                type="radio"
                value={option.value}
                {...register('bloqueo_tipo', { onChange: () => setValue('bloqueo_valor', '') })}
              />
              {option.label}
            </label>
          ))}
        </div>
        {bloqueo === 'PATRON' && (
          <Controller
            control={control}
            name="bloqueo_valor"
            render={({ field, fieldState }) => (
              <div className="field">
                <p className="field-hint">Dibuje el patrón con el mouse o el dedo, uniendo al menos {MIN_PATTERN_DOTS} puntos.</p>
                <PatternLock value={(field.value as string) || null} onChange={field.onChange} />
                <div className="pattern-actions">
                  <span className="muted">{field.value ? `Secuencia: ${field.value}` : 'Sin patrón'}</span>
                  {Boolean(field.value) && (
                    <Button size="sm" variant="ghost" onClick={() => field.onChange('')}>
                      Borrar
                    </Button>
                  )}
                </div>
                {fieldState.error && (
                  <p className="field-error" role="alert">
                    {fieldState.error.message}
                  </p>
                )}
              </div>
            )}
          />
        )}
        {bloqueo === 'PIN' && (
          <div className="form-grid">
            <Input
              label="PIN"
              required
              inputMode="numeric"
              autoComplete="off"
              maxLength={12}
              error={errors.bloqueo_valor?.message}
              {...register('bloqueo_valor', {
                onChange: (e) => setValue('bloqueo_valor', String(e.target.value).replace(/\D/g, '')),
              })}
            />
          </div>
        )}
      </Card>

      <Card title="Trabajo">
        <div className="form-grid">
          <Textarea label="Observaciones" rows={4} className="full" error={errors.observacion?.message} {...register('observacion')} />
          <div className="full">
            <PhotoSlots value={photos} onChange={setPhotos} />
          </div>
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
        <div className="form-grid form-grid-3">
          <MoneyInput label="Costo de reparación $" required error={errors.presupuesto?.message} {...register('presupuesto')} />
          <MoneyInput label="Anticipo $" required error={errors.anticipo?.message} {...register('anticipo')} />
          <div className="field">
            <span className="field-label">Saldo $</span>
            <p className={`readonly-value ${toCents(saldo) < 0 ? 'text-danger' : ''}`} data-testid="form-saldo">
              {formatMoney(saldo)}
            </p>
          </div>
        </div>
        <p className="field-hint">El saldo definitivo es calculado por el sistema al guardar.</p>
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
