import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch, type FieldValues, type Path, type UseFormSetError } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '@/app/store/AuthProvider';
import { BRANDS_KEY, brandApi } from '@/modules/brands/services/brandApi';
import { MODELS_KEY, modelApi } from '@/modules/models/services/modelApi';
import { NewCustomerForm } from '@/modules/sales/components/NewCustomerForm';
import { Button, Card, Input, Modal, MoneyInput, Select, Textarea } from '@/shared/components';
import { Combobox } from '@/shared/components/Combobox';
import { useOptions } from '@/shared/hooks/useCrud';
import { getErrorMessage, toApiError } from '@/shared/services/apiError';
import { fromDateTimeLocal, fullName, toDateTimeLocal } from '@/shared/utils/format';
import { cleanIdentificacion, isValidIdentificacion, zCelular, zIdentificacion } from '@/shared/utils/identification';
import { calculateBalance, formatMoney, isValidMoney, toCents } from '@/shared/utils/money';
import { type FormShape, zodForm, applyServerErrors, zMoney, zOptionalEmail, zOptionalId, zOptionalText, zRequiredId, zText } from '@/shared/utils/validation';
import { useWorkOrderCatalogs } from '../hooks/useWorkOrderCatalogs';
import { WORK_ORDERS_KEY, workOrderApi } from '../services/workOrderApi';
import { DISPLAY_CHANGE, type LockType, type WorkOrder, type WorkOrderRequest } from '../types';
import { ColorPalette } from './ColorPalette';
import { MIN_PATTERN_DOTS, parsePattern, PatternLock } from './PatternLock';
import { photoChanges, PhotoSlots, type PhotoChanges } from './PhotoSlots';

export const MAX_WARRANTY_DAYS = 3650;

/** Location preselected when registering a new client from a work order. */
const DEFAULT_CUSTOMER_LOCATION = { provincia: 'Pichincha', ciudad: 'Quito' };

export const workOrderSchema = z
  .object({
    cliente: z.object({
      identificacion: zIdentificacion,
      nombre: zText(100),
      apellido: zText(100),
      celular: zCelular,
      email: zOptionalEmail,
    }),
    marca_id: zRequiredId('Seleccione una marca'),
    modelo_id: zRequiredId('Seleccione un modelo'),
    color: zOptionalText(50),
    modelo_tecnico: zOptionalText(50),
    motivo_ingreso: z.string().min(1, 'Seleccione el motivo de ingreso'),
    tipo_display: z.string().optional().transform((v) => (v ? v : null)),
    garantia_dias: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? 0 : Number(v)),
      z
        .number({ invalid_type_error: 'Ingrese el número de días' })
        .int('Ingrese un número entero de días')
        .min(0, 'No puede ser negativo')
        .max(MAX_WARRANTY_DAYS, `Máximo ${MAX_WARRANTY_DAYS} días`),
    ),
    bloqueo_tipo: z.enum(['NINGUNO', 'PATRON', 'PIN']),
    // The pattern and the PIN are kept apart, so switching the lock type never erases them.
    patron: z.string().optional(),
    pin: z.string().trim().optional(),
    observacion: zOptionalText(5000),
    presupuesto: zMoney,
    anticipo: zMoney,
    fecha_entrega: z.string().optional(),
    branch_id: zOptionalId,
  })
  .superRefine((v, ctx) => {
    if (toCents(v.anticipo) > toCents(v.presupuesto)) {
      ctx.addIssue({ code: 'custom', path: ['anticipo'], message: 'El anticipo no puede ser mayor que el costo de reparación' });
    }
    if (v.motivo_ingreso === DISPLAY_CHANGE && !v.tipo_display) {
      ctx.addIssue({ code: 'custom', path: ['tipo_display'], message: 'Seleccione el tipo de display' });
    }
    if (v.bloqueo_tipo === 'PATRON' && parsePattern(v.patron).length < MIN_PATTERN_DOTS) {
      ctx.addIssue({ code: 'custom', path: ['patron'], message: `Dibuje un patrón de al menos ${MIN_PATTERN_DOTS} puntos` });
    }
    if (v.bloqueo_tipo === 'PIN' && !/^\d{4,12}$/.test(v.pin ?? '')) {
      ctx.addIssue({ code: 'custom', path: ['pin'], message: 'El PIN debe tener entre 4 y 12 dígitos' });
    }
    if (v.fecha_entrega && !fromDateTimeLocal(v.fecha_entrega)) {
      ctx.addIssue({ code: 'custom', path: ['fecha_entrega'], message: 'Fecha de entrega inválida' });
    }
  })
  .transform(({ patron, pin, ...v }) => ({
    ...v,
    tipo_display: v.motivo_ingreso === DISPLAY_CHANGE ? v.tipo_display : null,
    bloqueo_valor: v.bloqueo_tipo === 'PATRON' ? (patron ?? null) : v.bloqueo_tipo === 'PIN' ? (pin ?? null) : null,
    fecha_entrega: fromDateTimeLocal(v.fecha_entrega),
  }));
type FormInput = FormShape<typeof workOrderSchema>;
type FormOutput = z.output<typeof workOrderSchema>;

interface Props {
  order?: WorkOrder;
  onSubmit: (body: WorkOrderRequest, photos: PhotoChanges) => Promise<void>;
  onCancel: () => void;
}

type ClientLookup = 'idle' | 'searching' | 'found' | 'missing';

export function WorkOrderForm({ order, onSubmit, onCancel }: Props) {
  const { user } = useAuth();
  const { catalogs } = useWorkOrderCatalogs();
  const [serverError, setServerError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<ClientLookup>(order ? 'found' : 'idle');
  const [registering, setRegistering] = useState<string | null>(null);
  // A client that already has an email keeps it; otherwise it can be entered here.
  const [clientHasEmail, setClientHasEmail] = useState(Boolean(order?.cliente.email));
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
        email: order?.cliente.email ?? '',
      },
      marca_id: order?.marca_id ?? '',
      modelo_id: order?.modelo_id ?? '',
      color: order?.color ?? '',
      modelo_tecnico: order?.modelo_tecnico ?? '',
      motivo_ingreso: order?.motivo_ingreso ?? '',
      tipo_display: order?.tipo_display ?? '',
      garantia_dias: order?.garantia_dias ?? 0,
      bloqueo_tipo: order?.bloqueo_tipo ?? 'NINGUNO',
      patron: order?.bloqueo_tipo === 'PATRON' ? (order.bloqueo_valor ?? '') : '',
      pin: order?.bloqueo_tipo === 'PIN' ? (order.bloqueo_valor ?? '') : '',
      observacion: order?.observacion ?? '',
      presupuesto: order?.presupuesto ?? '0.00',
      anticipo: order?.anticipo ?? '0.00',
      fecha_entrega: toDateTimeLocal(order?.fecha_entrega),
      branch_id: order ? (order.branch_id ?? '') : (user?.branches[0]?.id ?? ''),
    },
  });

  const marcaId = useWatch({ control, name: 'marca_id' });

  // Sucursal (local): its address and phone are printed on the order.
  const branches = useQuery({ queryKey: [WORK_ORDERS_KEY, 'branches'], queryFn: workOrderApi.branches, staleTime: 60_000 });
  const branchesLoaded = Boolean(branches.data);
  useEffect(() => {
    // A <select> shows its value only once the option exists: re-apply it (or take the first branch).
    if (!branchesLoaded) return;
    const current = getValues('branch_id');
    const first = branches.data?.[0]?.id;
    setValue('branch_id', current || (order ? '' : (first ?? '')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchesLoaded]);
  const motivo = useWatch({ control, name: 'motivo_ingreso' });
  const bloqueo = useWatch({ control, name: 'bloqueo_tipo' }) as LockType;
  const [presupuesto, anticipo] = useWatch({ control, name: ['presupuesto', 'anticipo'] });
  const brands = useOptions(BRANDS_KEY, brandApi);
  const models = useOptions(MODELS_KEY, modelApi, { brand_id: Number(marcaId) }, Boolean(marcaId));

  // Brands and models can be added from another tab: query both every time a selector is opened
  // (and when returning to this tab). An in-flight query is reused instead of starting another one.
  const { refetch: refetchBrands } = brands;
  const { refetch: refetchModels } = models;
  const refreshDevices = useCallback(() => {
    void refetchBrands({ cancelRefetch: false });
    if (marcaId) void refetchModels({ cancelRefetch: false });
  }, [refetchBrands, refetchModels, marcaId]);
  useEffect(() => {
    window.addEventListener('focus', refreshDevices);
    return () => window.removeEventListener('focus', refreshDevices);
  }, [refreshDevices]);

  // Reset the model when the brand changes (models are filtered by brand).
  const previousBrand = useRef(marcaId);
  useEffect(() => {
    if (previousBrand.current !== marcaId) setValue('modelo_id', '');
    previousBrand.current = marcaId;
  }, [marcaId, setValue]);

  const fillClient = (client: {
    identificacion: string | null;
    nombre: string;
    apellido: string;
    celular: string | null;
    email?: string | null;
  }) => {
    setValue('cliente.identificacion', client.identificacion ?? '');
    setValue('cliente.nombre', client.nombre);
    setValue('cliente.apellido', client.apellido);
    setValue('cliente.celular', client.celular ?? '');
    setValue('cliente.email', client.email ?? '');
    setClientHasEmail(Boolean(client.email));
    clearErrors('cliente');
    setLookup('found');
  };

  /** Looks the client up by cédula / RUC; when it does not exist, the registration modal opens. */
  const lookupClient = async () => {
    const identificacion = cleanIdentificacion(String(getValues('cliente.identificacion') ?? ''));
    if (!isValidIdentificacion(identificacion)) {
      setError('cliente.identificacion', { type: 'manual', message: 'La cédula o el RUC no es válido' });
      return;
    }
    clearErrors('cliente');
    setLookup('searching');
    try {
      fillClient(await workOrderApi.lookupCustomer(identificacion));
    } catch (err) {
      const apiError = toApiError(err);
      setValue('cliente.nombre', '');
      setValue('cliente.apellido', '');
      setValue('cliente.celular', '');
      setValue('cliente.email', '');
      setClientHasEmail(false);
      if (apiError.status === 404) {
        setLookup('missing');
        setRegistering(identificacion);
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

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    if (lookup !== 'found') {
      setError('cliente.identificacion', { type: 'manual', message: 'Busque al cliente (Enter) o regístrelo' });
      return;
    }
    try {
      await onSubmit(values, photos);
    } catch (err) {
      // The API reports the lock value as "bloqueo_valor": show it on the pattern or the PIN.
      const mapLockField: UseFormSetError<FieldValues> = (field, error) =>
        setError((field === 'bloqueo_valor' ? (bloqueo === 'PIN' ? 'pin' : 'patron') : field) as Path<FormInput>, error);
      if (!applyServerErrors(err, mapLockField)) setServerError(getErrorMessage(err));
    }
  });

  const safeMoney = (v: unknown) => (typeof v === 'string' && isValidMoney(v) ? v : '0');
  const saldo = calculateBalance(safeMoney(presupuesto), safeMoney(anticipo));
  const branchOptions = withCurrent(
    (branches.data ?? []).map((b) => ({ value: b.id, label: b.nombre })),
    order?.branch_id ?? undefined,
    order?.branch?.nombre,
  );
  const technician = order ? (order.tecnico ? fullName(order.tecnico) : 'Sin asignar') : `${fullName(user)} (usted)`;

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
          {lookup === 'missing' && (
            <p className="field-hint full">
              El cliente no está registrado.{' '}
              <button type="button" className="link-button" onClick={() => setRegistering(cleanIdentificacion(String(getValues('cliente.identificacion') ?? '')))}>
                Registrar cliente
              </button>
            </p>
          )}
          <Input label="Nombres" required readOnly error={errors.cliente?.nombre?.message} {...register('cliente.nombre')} />
          <Input label="Apellidos" required readOnly error={errors.cliente?.apellido?.message} {...register('cliente.apellido')} />
          <Input label="Celular" readOnly error={errors.cliente?.celular?.message} {...register('cliente.celular')} />
          <Input
            label="Email"
            type="email"
            readOnly={clientHasEmail}
            hint={clientHasEmail ? undefined : 'Opcional: se guarda en el cliente'}
            error={errors.cliente?.email?.message}
            {...register('cliente.email')}
          />
        </div>
      </Card>

      <Card title="Datos del celular">
        <div className="form-grid">
          <Select
            label="Marca"
            required
            options={brandOptions}
            placeholder="Seleccione…"
            error={errors.marca_id?.message}
            onMouseDown={refreshDevices}
            onFocus={refreshDevices}
            {...register('marca_id')}
          />
          <Select
            label="Modelo"
            required
            onMouseDown={refreshDevices}
            onFocus={refreshDevices}
            options={modelOptions}
            placeholder={marcaId ? 'Seleccione…' : 'Seleccione primero una marca'}
            disabled={!marcaId}
            error={errors.modelo_id?.message}
            {...register('modelo_id')}
          />
          <Input
            label="Modelo técnico"
            placeholder="Ej.: SM-A105M"
            hint="Código del modelo (Ajustes › Acerca del teléfono)"
            autoComplete="off"
            error={errors.modelo_tecnico?.message}
            {...register('modelo_tecnico')}
          />
          <Controller
            control={control}
            name="color"
            render={({ field, fieldState }) => (
              <ColorPalette value={field.value as string} onChange={field.onChange} error={fieldState.error?.message} />
            )}
          />
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
          <Input
            label="Tiempo de garantía (días)"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_WARRANTY_DAYS}
            step={1}
            hint="0 = sin garantía"
            error={errors.garantia_dias?.message}
            {...register('garantia_dias')}
          />
        </div>
      </Card>

      <Card title="Desbloqueo del equipo">
        <div className="lock-types" role="radiogroup" aria-label="Tipo de bloqueo">
          {catalogs.tipos_bloqueo.map((option) => (
            <label key={option.value} className="radio">
              <input type="radio" value={option.value} {...register('bloqueo_tipo')} />
              {option.label}
            </label>
          ))}
        </div>
        {bloqueo === 'PATRON' && (
          <Controller
            control={control}
            name="patron"
            render={({ field, fieldState }) => (
              <div className="field">
                <p className="field-hint">
                  Dibuje el patrón con el mouse o el dedo (también punto por punto), uniendo al menos {MIN_PATTERN_DOTS} puntos.
                </p>
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
              error={errors.pin?.message}
              {...register('pin', {
                onChange: (e) => setValue('pin', String(e.target.value).replace(/\D/g, '')),
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
            label="Sucursal"
            options={branchOptions}
            placeholder="Seleccione…"
            hint="Su dirección y teléfono se imprimen en la orden"
            error={errors.branch_id?.message}
            {...register('branch_id')}
          />
          <div className="field">
            <span className="field-label">Vendedor</span>
            <p className="readonly-value">{technician}</p>
          </div>
          <Input
            label="Fecha de entrega"
            type="datetime-local"
            min={order ? undefined : toDateTimeLocal(new Date().toISOString())}
            error={errors.fecha_entrega?.message}
            {...register('fecha_entrega')}
          />
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

      <Modal open={registering !== null} title="Nuevo cliente" onClose={() => setRegistering(null)} size="lg">
        {registering !== null && (
          <NewCustomerForm
            identificacion={registering}
            create={workOrderApi.createCustomer}
            showRole={false}
            defaultLocation={DEFAULT_CUSTOMER_LOCATION}
            onCancel={() => setRegistering(null)}
            onCreated={(client) => {
              setRegistering(null);
              fillClient(client);
            }}
          />
        )}
      </Modal>
    </form>
  );
}
