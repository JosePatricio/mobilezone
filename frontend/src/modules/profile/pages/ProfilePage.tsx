import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/app/store/AuthProvider';
import { Avatar, Button, Card, Input, PageHeader, useToast } from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import { fullName } from '@/shared/utils/format';
import { type FormShape, applyServerErrors, zodForm } from '@/shared/utils/validation';
import { profileApi } from '../services/profileApi';

const MIN_PASSWORD_LENGTH = 8;

const schema = z
  .object({
    current_password: z.string().min(1, 'Ingrese su contraseña actual'),
    new_password: z.string().min(MIN_PASSWORD_LENGTH, `Mínimo ${MIN_PASSWORD_LENGTH} caracteres`).max(128),
    confirm_password: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.confirm_password !== v.new_password) {
      ctx.addIssue({ code: 'custom', path: ['confirm_password'], message: 'Las contraseñas no coinciden' });
    }
    if (v.current_password && v.new_password === v.current_password) {
      ctx.addIssue({ code: 'custom', path: ['new_password'], message: 'Debe ser distinta de la actual' });
    }
  });
type FormInput = FormShape<typeof schema>;
type FormOutput = z.output<typeof schema>;

const EMPTY: FormInput = { current_password: '', new_password: '', confirm_password: '' };

/** Mi perfil: data of the logged user (managed by the administrator) and password change. */
export function ProfilePage() {
  const { user } = useAuth();
  const location = [user?.ciudad, user?.provincia].filter(Boolean).join(', ');
  const show = (value: string | null | undefined) => value || '—';

  return (
    <>
      <PageHeader title="Mi perfil">Sus datos los administra el administrador del sistema.</PageHeader>
      <div className="profile-grid">
        <Card title="Datos personales">
          <div className="profile-header">
            <Avatar src={user?.foto_url} alt={fullName(user)} size="lg" />
            <div>
              <strong>{fullName(user)}</strong>
              <div className="muted">{user?.role?.nombre}</div>
            </div>
          </div>
          <dl className="detail-list">
            <dt>Email</dt>
            <dd>{show(user?.email)}</dd>
            <dt>Cédula / RUC</dt>
            <dd>{show(user?.identificacion)}</dd>
            <dt>Celular</dt>
            <dd>{show(user?.celular)}</dd>
            <dt>Ubicación</dt>
            <dd>{show(location)}</dd>
            <dt>Dirección</dt>
            <dd>{show(user?.direccion)}</dd>
            {user && user.branches.length > 0 && (
              <>
                <dt>Sucursales</dt>
                <dd>{user.branches.map((b) => b.nombre).join(', ')}</dd>
              </>
            )}
          </dl>
        </Card>
        <ChangePasswordCard />
      </div>
    </>
  );
}

function ChangePasswordCard() {
  const toast = useToast();
  const { passwordChanged } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({ resolver: zodForm(schema), defaultValues: EMPTY });

  const submit = handleSubmit(async ({ current_password, new_password }) => {
    setServerError(null);
    try {
      await profileApi.changePassword({ current_password, new_password });
      reset(EMPTY);
      passwordChanged();
      toast.success('Contraseña actualizada.');
    } catch (err) {
      if (!applyServerErrors(err, setError)) setServerError(getErrorMessage(err));
    }
  });

  return (
    <Card title="Cambiar contraseña">
      <form onSubmit={submit} noValidate className="form-stack">
        {serverError && (
          <div className="alert alert-error" role="alert">
            {serverError}
          </div>
        )}
        <Input
          label="Contraseña actual"
          type="password"
          autoComplete="current-password"
          required
          error={errors.current_password?.message}
          {...register('current_password')}
        />
        <Input
          label="Nueva contraseña"
          type="password"
          autoComplete="new-password"
          required
          hint={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
          error={errors.new_password?.message}
          {...register('new_password')}
        />
        <Input
          label="Confirmar nueva contraseña"
          type="password"
          autoComplete="new-password"
          required
          error={errors.confirm_password?.message}
          {...register('confirm_password')}
        />
        <div>
          <Button type="submit" loading={isSubmitting}>
            Cambiar contraseña
          </Button>
        </div>
      </form>
    </Card>
  );
}
