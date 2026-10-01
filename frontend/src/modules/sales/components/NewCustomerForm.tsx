import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { clientSchema } from '@/modules/clients/components/ClientFormModal';
import type { Client, ClientRequest } from '@/modules/clients/types';
import { Button, Input, LocationFields } from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import { type FormShape, zodForm, applyServerErrors } from '@/shared/utils/validation';
import { saleApi } from '../services/saleApi';

type FormInput = FormShape<typeof clientSchema>;
type FormOutput = z.output<typeof clientSchema>;

interface Props {
  identificacion: string;
  onCreated: (client: Client) => void;
  onCancel: () => void;
  /** Endpoint that registers the client (sales by default; work orders use their own). */
  create?: (body: ClientRequest) => Promise<Client>;
}

/**
 * Quick registration of a client from the sales or work order screen. Same fields as a user; the role
 * is always CLIENTE (shown as text) and clients have no password. Available to sellers.
 */
export function NewCustomerForm({ identificacion, onCreated, onCancel, create = saleApi.createCustomer }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodForm(clientSchema),
    defaultValues: {
      nombre: '',
      apellido: '',
      identificacion,
      email: '',
      celular: '',
      provincia: '',
      ciudad: '',
      estado: true,
    },
  });
  const provincia = useWatch({ control, name: 'provincia' }) as string;

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      onCreated(await create(values));
    } catch (err) {
      if (!applyServerErrors(err, setError)) setServerError(getErrorMessage(err));
    }
  });

  return (
    <form
      className="new-customer form-grid"
      aria-label="Registrar cliente"
      noValidate
      onSubmit={(e) => {
        e.stopPropagation();
        void submit(e);
      }}
    >
      <h3 className="full">Registrar nuevo cliente</h3>
      {serverError && (
        <div className="alert alert-error full" role="alert">
          {serverError}
        </div>
      )}
      <Input label="Nombre" required error={errors.nombre?.message} {...register('nombre')} />
      <Input label="Apellido" required error={errors.apellido?.message} {...register('apellido')} />
      <Input
        label="Cédula o RUC"
        required
        inputMode="numeric"
        maxLength={13}
        error={errors.identificacion?.message}
        {...register('identificacion')}
      />
      <Input label="Email" type="email" hint="Opcional" error={errors.email?.message} {...register('email')} />
      <Input label="Celular" type="tel" inputMode="tel" error={errors.celular?.message} {...register('celular')} />
      <div className="field">
        <span className="field-label">Rol</span>
        <p className="readonly-value">CLIENTE</p>
      </div>
      <LocationFields register={register} setValue={setValue} errors={errors} provincia={provincia} />
      <div className="full form-actions">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Registrar cliente
        </Button>
      </div>
    </form>
  );
}
