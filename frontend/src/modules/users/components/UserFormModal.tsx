import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Checkbox, Input, Modal, Select, type SelectOption } from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import { type FormShape, zodForm, applyServerErrors, zOptionalId, zText } from '@/shared/utils/validation';
import { USER_TYPE_LABELS, type User, type UserRequest, type UserType } from '../types';

const USER_TYPES = Object.keys(USER_TYPE_LABELS) as [UserType, ...UserType[]];

function buildSchema(isEdit: boolean) {
  return z
    .object({
      nombre: zText(100),
      apellido: zText(100),
      email: z.string().trim().min(1, 'Campo obligatorio').email('Email inválido'),
      tipo_usuario: z.enum(USER_TYPES, { errorMap: () => ({ message: 'Seleccione un tipo' }) }),
      rol_id: zOptionalId,
      password: z.string().max(128).optional(),
      estado: z.boolean(),
    })
    .superRefine((v, ctx) => {
      const pwd = v.password ?? '';
      const requiresPassword = !isEdit && v.tipo_usuario !== 'CLIENTE';
      if (requiresPassword && !pwd) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: 'La contraseña es obligatoria' });
      } else if (pwd && pwd.length < 8) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: 'Mínimo 8 caracteres' });
      }
    });
}
type Schema = ReturnType<typeof buildSchema>;
type FormInput = FormShape<Schema>;
type FormOutput = z.output<Schema>;

interface Props {
  user: User | null;
  roleOptions: SelectOption[];
  onClose: () => void;
  onSubmit: (body: UserRequest) => Promise<void>;
}

export function UserFormModal({ user, roleOptions, onClose, onSubmit }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodForm(buildSchema(Boolean(user))),
    defaultValues: {
      nombre: user?.nombre ?? '',
      apellido: user?.apellido ?? '',
      email: user?.email ?? '',
      tipo_usuario: user?.tipo_usuario ?? 'USUARIO',
      rol_id: user?.rol_id ?? '',
      password: '',
      estado: user?.estado ?? true,
    },
  });

  const submit = handleSubmit(async ({ password, ...values }) => {
    setServerError(null);
    try {
      await onSubmit({ ...values, password: password ? password : null });
    } catch (err) {
      if (!applyServerErrors(err, setError)) setServerError(getErrorMessage(err));
    }
  });

  return (
    <Modal
      open
      size="lg"
      title={user ? 'Editar usuario' : 'Nuevo usuario'}
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="user-form" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} noValidate className="form-grid">
        {serverError && (
          <div className="alert alert-error full" role="alert">
            {serverError}
          </div>
        )}
        <Input label="Nombre" required error={errors.nombre?.message} {...register('nombre')} />
        <Input label="Apellido" required error={errors.apellido?.message} {...register('apellido')} />
        <Input label="Email" type="email" required error={errors.email?.message} {...register('email')} />
        <Input
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          hint={user ? 'Deje vacío para mantener la actual' : 'Mínimo 8 caracteres'}
          error={errors.password?.message}
          {...register('password')}
        />
        <Select
          label="Tipo de usuario"
          required
          options={USER_TYPES.map((t) => ({ value: t, label: USER_TYPE_LABELS[t] }))}
          error={errors.tipo_usuario?.message}
          {...register('tipo_usuario')}
        />
        <Select
          label="Rol"
          options={roleOptions}
          placeholder="Sin rol"
          error={errors.rol_id?.message}
          {...register('rol_id')}
        />
        <Checkbox label="Activo" toggle {...register('estado')} />
      </form>
    </Modal>
  );
}
