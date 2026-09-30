import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import {
  Button,
  Checkbox,
  ImageField,
  Input,
  Modal,
  NO_IMAGE_CHANGE,
  Select,
  type ImageSelection,
} from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import type { NamedRef } from '@/shared/types/api';
import { zCelular, zOptionalIdentificacion } from '@/shared/utils/identification';
import { type FormShape, zodForm, applyServerErrors, zOptionalText, zRequiredId, zText } from '@/shared/utils/validation';
import { SYSTEM_ROLES, type User, type UserRequest } from '../types';

function buildSchema(isEdit: boolean, roles: NamedRef[]) {
  return z
    .object({
      nombre: zText(100),
      apellido: zText(100),
      email: z.string().trim().min(1, 'Campo obligatorio').email('Email inválido'),
      identificacion: zOptionalIdentificacion,
      celular: zCelular,
      ciudad: zOptionalText(100),
      rol_id: zRequiredId('Seleccione un rol'),
      password: z.string().max(128).optional(),
      estado: z.boolean(),
    })
    .superRefine((v, ctx) => {
      const pwd = v.password ?? '';
      const isClient = roles.find((r) => r.id === v.rol_id)?.nombre === SYSTEM_ROLES.CLIENTE;
      if (!isEdit && !isClient && !pwd) {
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
  roles: NamedRef[];
  onClose: () => void;
  onSubmit: (body: UserRequest, image: ImageSelection) => Promise<void>;
}

/** The role is the only classification of a user (there is no separate "tipo de usuario"). */
export function UserFormModal({ user, roles, onClose, onSubmit }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [image, setImage] = useState<ImageSelection>(NO_IMAGE_CHANGE);
  const roleOptions = user && !roles.some((r) => r.id === user.rol_id) ? [...roles, user.role] : roles;
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodForm(buildSchema(Boolean(user), roleOptions)),
    defaultValues: {
      nombre: user?.nombre ?? '',
      apellido: user?.apellido ?? '',
      email: user?.email ?? '',
      identificacion: user?.identificacion ?? '',
      celular: user?.celular ?? '',
      ciudad: user?.ciudad ?? '',
      rol_id: user?.rol_id ?? '',
      password: '',
      estado: user?.estado ?? true,
    },
  });
  const rolId = useWatch({ control, name: 'rol_id' });
  const isClient = roleOptions.find((r) => r.id === Number(rolId))?.nombre === SYSTEM_ROLES.CLIENTE;

  const submit = handleSubmit(async ({ password, ...values }) => {
    setServerError(null);
    try {
      await onSubmit({ ...values, password: password && !isClient ? password : null }, image);
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
        <div className="full">
          <ImageField label="Foto" variant="avatar" currentUrl={user?.foto_url} value={image} onChange={setImage} />
        </div>
        <Input label="Nombre" required error={errors.nombre?.message} {...register('nombre')} />
        <Input label="Apellido" required error={errors.apellido?.message} {...register('apellido')} />
        <Input
          label="Cédula o RUC"
          inputMode="numeric"
          maxLength={13}
          hint="10 dígitos (cédula) o 13 (RUC)"
          error={errors.identificacion?.message}
          {...register('identificacion')}
        />
        <Input label="Email" type="email" required error={errors.email?.message} {...register('email')} />
        <Input label="Celular" type="tel" inputMode="tel" error={errors.celular?.message} {...register('celular')} />
        <Input label="Ciudad" error={errors.ciudad?.message} {...register('ciudad')} />
        <Select
          label="Rol"
          required
          options={roleOptions.map((r) => ({ value: r.id, label: r.nombre }))}
          placeholder="Seleccione…"
          error={errors.rol_id?.message}
          {...register('rol_id')}
        />
        {isClient ? (
          <p className="field-hint">Los clientes no inician sesión: no necesitan contraseña.</p>
        ) : (
          <Input
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            required={!user}
            hint={user ? 'Deje vacío para mantener la actual' : 'Mínimo 8 caracteres'}
            error={errors.password?.message}
            {...register('password')}
          />
        )}
        <Checkbox label="Activo" toggle {...register('estado')} />
      </form>
    </Modal>
  );
}
