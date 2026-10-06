import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useBranchOptions } from '@/modules/branches/services/branchApi';
import {
  Button,
  Checkbox,
  ImageField,
  Input,
  LocationFields,
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
  const roleName = (id: number) => roles.find((r) => r.id === id)?.nombre;
  return z
    .object({
      nombre: zText(100),
      apellido: zText(100),
      email: z.string().trim().min(1, 'Campo obligatorio').email('Email inválido'),
      identificacion: zOptionalIdentificacion,
      celular: zCelular,
      provincia: zOptionalText(100),
      ciudad: zOptionalText(100),
      direccion: zOptionalText(255),
      rol_id: zRequiredId('Seleccione un rol'),
      password: z.string().max(128).optional(),
      branch_ids: z.array(z.number()),
      estado: z.boolean(),
    })
    .superRefine((v, ctx) => {
      const pwd = v.password ?? '';
      const isClient = roleName(v.rol_id) === SYSTEM_ROLES.CLIENTE;
      const isSeller = roleName(v.rol_id) === SYSTEM_ROLES.VENDEDOR;
      if (!isEdit && isSeller && !pwd && !v.identificacion) {
        // A seller without password gets the cédula / RUC as initial password.
        ctx.addIssue({
          code: 'custom',
          path: ['identificacion'],
          message: 'Ingrese la cédula / RUC: será la contraseña inicial del vendedor',
        });
      } else if (!isEdit && !isClient && !isSeller && !pwd) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: 'La contraseña es obligatoria' });
      } else if (pwd && pwd.length < 8) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: 'Mínimo 8 caracteres' });
      }
      if (v.provincia && !v.ciudad) {
        ctx.addIssue({ code: 'custom', path: ['ciudad'], message: 'Seleccione la ciudad' });
      }
      if (roleName(v.rol_id) === SYSTEM_ROLES.VENDEDOR && v.branch_ids.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['branch_ids'], message: 'Asigne al menos una sucursal al vendedor' });
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

/** The role is the only classification of a user. New users default to the CLIENTE role. */
export function UserFormModal({ user, roles, onClose, onSubmit }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [image, setImage] = useState<ImageSelection>(NO_IMAGE_CHANGE);
  const branches = useBranchOptions();
  const roleOptions = user && !roles.some((r) => r.id === user.rol_id) ? [...roles, user.role] : roles;
  const clientRoleId = roleOptions.find((r) => r.nombre === SYSTEM_ROLES.CLIENTE)?.id;
  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
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
      provincia: user?.provincia ?? '',
      ciudad: user?.ciudad ?? '',
      direccion: user?.direccion ?? '',
      rol_id: user?.rol_id ?? clientRoleId ?? '',
      password: '',
      branch_ids: user?.branches.map((b) => b.id) ?? [],
      estado: user?.estado ?? true,
    },
  });

  // Roles may load after the modal opens: new users default to CLIENTE.
  useEffect(() => {
    if (!user && clientRoleId && !getValues('rol_id')) setValue('rol_id', clientRoleId);
  }, [user, clientRoleId, getValues, setValue]);

  const [rolId, provincia, branchIds] = useWatch({ control, name: ['rol_id', 'provincia', 'branch_ids'] });
  const roleName = roleOptions.find((r) => r.id === Number(rolId))?.nombre;
  const isClient = roleName === SYSTEM_ROLES.CLIENTE;
  const selectedBranches = new Set<number>((branchIds as number[] | undefined) ?? []);

  const toggleBranch = (id: number) => {
    const next = new Set(selectedBranches);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setValue('branch_ids', [...next], { shouldValidate: true });
  };

  const submit = handleSubmit(async ({ password, ...values }) => {
    setServerError(null);
    try {
      await onSubmit(
        { ...values, password: password && !isClient ? password : null, branch_ids: isClient ? [] : values.branch_ids },
        image,
      );
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
        <Select
          label="Rol"
          required
          options={roleOptions.map((r) => ({ value: r.id, label: r.nombre }))}
          placeholder="Seleccione…"
          error={errors.rol_id?.message}
          {...register('rol_id')}
        />
        <LocationFields register={register} setValue={setValue} errors={errors} provincia={provincia as string} />
        <Input
          label="Dirección"
          className="full"
          hint="Se muestra en los repuestos que publica el afiliado"
          error={errors.direccion?.message}
          {...register('direccion')}
        />
        {isClient ? (
          <p className="field-hint">Los clientes no inician sesión: no necesitan contraseña.</p>
        ) : (
          <Input
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            required={!user && roleName !== SYSTEM_ROLES.VENDEDOR}
            hint={
              user
                ? 'Deje vacío para mantener la actual'
                : roleName === SYSTEM_ROLES.VENDEDOR
                  ? 'Si la deja vacía, la contraseña será su cédula / RUC'
                  : 'Mínimo 8 caracteres'
            }
            error={errors.password?.message}
            {...register('password')}
          />
        )}
        {!isClient && (
          <fieldset className="full branch-checks">
            <legend className="field-label">
              Sucursales asignadas{roleName === SYSTEM_ROLES.VENDEDOR && <span className="field-required"> *</span>}
            </legend>
            <div className="branch-checks-grid">
              {(branches.data ?? []).map((b) => (
                <Checkbox
                  key={b.id}
                  label={b.nombre}
                  checked={selectedBranches.has(b.id)}
                  onChange={() => toggleBranch(b.id)}
                />
              ))}
            </div>
            {errors.branch_ids?.message && (
              <p className="field-error" role="alert">
                {errors.branch_ids.message as string}
              </p>
            )}
          </fieldset>
        )}
        <Checkbox label="Activo" toggle {...register('estado')} />
      </form>
    </Modal>
  );
}
