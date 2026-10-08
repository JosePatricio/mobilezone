import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/app/store/AuthProvider';
import type { User } from '@/modules/users/types';
import {
  Button,
  Card,
  ImageField,
  Input,
  LocationFields,
  NO_IMAGE_CHANGE,
  PageHeader,
  useToast,
  type ImageSelection,
} from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import { zCelular } from '@/shared/utils/identification';
import { type FormShape, applyServerErrors, zodForm, zOptionalText, zText } from '@/shared/utils/validation';
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

const profileSchema = z
  .object({
    nombre: zText(100),
    apellido: zText(100),
    email: z.string().trim().min(1, 'Campo obligatorio').email('Email inválido'),
    celular: zCelular,
    provincia: zOptionalText(100),
    ciudad: zOptionalText(100),
    direccion: zOptionalText(255),
  })
  .superRefine((v, ctx) => {
    if (v.provincia && !v.ciudad) ctx.addIssue({ code: 'custom', path: ['ciudad'], message: 'Seleccione la ciudad' });
  });
type ProfileInput = FormShape<typeof profileSchema>;
type ProfileOutput = z.output<typeof profileSchema>;

/** Perfil (opened from the user data in the header): own data, photo and password. */
export function ProfilePage() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Perfil">Actualice sus datos y su contraseña.</PageHeader>
      <div className="profile-grid">
        {user && <ProfileCard user={user} />}
        <ChangePasswordCard />
      </div>
    </>
  );
}

function ProfileCard({ user }: { user: User }) {
  const { updateUser } = useAuth();
  const toast = useToast();
  const [image, setImage] = useState<ImageSelection>(NO_IMAGE_CHANGE);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInput, unknown, ProfileOutput>({
    resolver: zodForm(profileSchema),
    defaultValues: {
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email ?? '',
      celular: user.celular ?? '',
      provincia: user.provincia ?? '',
      ciudad: user.ciudad ?? '',
      direccion: user.direccion ?? '',
    },
  });
  const [provincia, ciudad] = useWatch({ control, name: ['provincia', 'ciudad'] });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      let saved = await profileApi.update(values);
      if (image.file) saved = await profileApi.uploadPhoto(image.file);
      else if (image.remove) saved = await profileApi.removePhoto();
      updateUser(saved);
      setImage(NO_IMAGE_CHANGE);
      toast.success('Datos actualizados.');
    } catch (err) {
      if (!applyServerErrors(err, setError)) setServerError(getErrorMessage(err));
    }
  });

  return (
    <Card title="Mis datos">
      <form onSubmit={submit} noValidate className="form-grid">
        {serverError && (
          <div className="alert alert-error full" role="alert">
            {serverError}
          </div>
        )}
        <div className="full">
          <ImageField label="Foto" variant="avatar" currentUrl={user.foto_url} value={image} onChange={setImage} />
        </div>
        <Input label="Nombre" required error={errors.nombre?.message} {...register('nombre')} />
        <Input label="Apellido" required error={errors.apellido?.message} {...register('apellido')} />
        <Input label="Email" type="email" required hint="Es su usuario para iniciar sesión" error={errors.email?.message} {...register('email')} />
        <Input label="Celular" type="tel" inputMode="tel" error={errors.celular?.message} {...register('celular')} />
        <LocationFields
          register={register}
          setValue={setValue}
          errors={errors}
          provincia={provincia as string}
          ciudad={ciudad as string}
        />
        <Input label="Dirección" className="full" error={errors.direccion?.message} {...register('direccion')} />
        <dl className="detail-list full">
          <dt>Rol</dt>
          <dd>{user.role?.nombre}</dd>
          <dt>Cédula / RUC</dt>
          <dd>{user.identificacion ?? '—'}</dd>
          {user.branches.length > 0 && (
            <>
              <dt>Sucursales</dt>
              <dd>{user.branches.map((b) => b.nombre).join(', ')}</dd>
            </>
          )}
        </dl>
        <p className="field-hint full">El rol, la cédula y las sucursales los cambia el administrador.</p>
        <div className="full">
          <Button type="submit" loading={isSubmitting}>
            Guardar cambios
          </Button>
        </div>
      </form>
    </Card>
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
