import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Checkbox, Input, Modal } from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import { applyServerErrors, zText } from '@/shared/utils/validation';
import type { Client, ClientRequest } from '../types';

const schema = z.object({
  nombre: zText(100),
  apellido: zText(100),
  email: z.string().trim().min(1, 'Campo obligatorio').email('Email inválido'),
  estado: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  client: Client | null;
  onClose: () => void;
  onSubmit: (body: ClientRequest) => Promise<void>;
}

export function ClientFormModal({ client, onClose, onSubmit }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: client?.nombre ?? '',
      apellido: client?.apellido ?? '',
      email: client?.email ?? '',
      estado: client?.estado ?? true,
    },
  });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      if (!applyServerErrors(err, setError)) setServerError(getErrorMessage(err));
    }
  });

  return (
    <Modal
      open
      title={client ? 'Editar cliente' : 'Nuevo cliente'}
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="client-form" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="client-form"
        onSubmit={(e) => {
          e.stopPropagation(); // may be rendered inside another form (work order)
          void submit(e);
        }}
        noValidate
        className="form-grid"
      >
        {serverError && (
          <div className="alert alert-error full" role="alert">
            {serverError}
          </div>
        )}
        <Input label="Nombre" required error={errors.nombre?.message} {...register('nombre')} />
        <Input label="Apellido" required error={errors.apellido?.message} {...register('apellido')} />
        <Input label="Email" type="email" required className="full" error={errors.email?.message} {...register('email')} />
        <Checkbox label="Activo" toggle {...register('estado')} />
      </form>
    </Modal>
  );
}
