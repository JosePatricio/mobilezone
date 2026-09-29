import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Checkbox, Input, Modal, Textarea } from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import { type FormShape, zodForm, applyServerErrors, zOptionalText, zText } from '@/shared/utils/validation';
import type { Role, RoleRequest } from '../types';

const schema = z.object({
  nombre: zText(50),
  descripcion: zOptionalText(255),
  estado: z.boolean(),
});
type FormInput = FormShape<typeof schema>;
type FormOutput = z.output<typeof schema>;

interface Props {
  role: Role | null;
  onClose: () => void;
  onSubmit: (body: RoleRequest) => Promise<void>;
}

export function RoleFormModal({ role, onClose, onSubmit }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodForm(schema),
    defaultValues: { nombre: role?.nombre ?? '', descripcion: role?.descripcion ?? '', estado: role?.estado ?? true },
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
      title={role ? 'Editar rol' : 'Nuevo rol'}
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="role-form" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="role-form" onSubmit={submit} noValidate className="form-grid">
        {serverError && (
          <div className="alert alert-error full" role="alert">
            {serverError}
          </div>
        )}
        <Input label="Nombre" required className="full" error={errors.nombre?.message} {...register('nombre')} />
        <Textarea label="Descripción" className="full" error={errors.descripcion?.message} {...register('descripcion')} />
        <Checkbox label="Activo" toggle {...register('estado')} />
      </form>
    </Modal>
  );
}
