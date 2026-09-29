import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/store/AuthProvider';
import { Button, Input } from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';

const schema = z.object({
  email: z.string().trim().min(1, 'Ingrese su email').email('Email inválido'),
  password: z.string().min(1, 'Ingrese su contraseña'),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { status, login, logoutReason } = useAuth();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login(values);
    } catch (err) {
      setServerError(getErrorMessage(err));
    }
  });

  return (
    <div className="login-page">
      <form className="login-card card" onSubmit={onSubmit} noValidate>
        <div className="login-brand">
          <span className="brand-mark" aria-hidden>
            MZ
          </span>
          <h1>MobileZone</h1>
          <p className="muted">Ventas y órdenes de trabajo</p>
        </div>

        {logoutReason === 'expired' && !serverError && (
          <div className="alert alert-info" role="status">
            Su sesión ha expirado. Inicie sesión nuevamente.
          </div>
        )}
        {serverError && (
          <div className="alert alert-error" role="alert">
            {serverError}
          </div>
        )}

        <Input
          label="Email"
          type="email"
          autoComplete="username"
          autoFocus
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" loading={isSubmitting} className="btn-block">
          Ingresar
        </Button>
      </form>
    </div>
  );
}
