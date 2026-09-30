import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import {
  Button,
  Checkbox,
  ImageField,
  Input,
  LocationFields,
  Modal,
  NO_IMAGE_CHANGE,
  type ImageSelection,
} from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import { zCelular, zIdentificacion } from '@/shared/utils/identification';
import { type FormShape, zodForm, applyServerErrors, zOptionalText, zText } from '@/shared/utils/validation';
import type { Client, ClientRequest } from '../types';

/** Client fields (also used by the quick registration in the sales screen). */
export const clientSchema = z
  .object({
    nombre: zText(100),
    apellido: zText(100),
    identificacion: zIdentificacion,
    email: z.string().trim().min(1, 'Campo obligatorio').email('Email inválido'),
    celular: zCelular,
    provincia: zOptionalText(100),
    ciudad: zOptionalText(100),
    estado: z.boolean(),
  })
  .refine((v) => !v.provincia || v.ciudad, { path: ['ciudad'], message: 'Seleccione la ciudad' });
const schema = clientSchema;
type FormInput = FormShape<typeof schema>;
type FormOutput = z.output<typeof schema>;

interface Props {
  client: Client | null;
  onClose: () => void;
  onSubmit: (body: ClientRequest, image: ImageSelection) => Promise<void>;
  /** The photo can be hidden in quick-create flows. */
  withPhoto?: boolean;
}

export function ClientFormModal({ client, onClose, onSubmit, withPhoto = true }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [image, setImage] = useState<ImageSelection>(NO_IMAGE_CHANGE);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodForm(schema),
    defaultValues: {
      nombre: client?.nombre ?? '',
      apellido: client?.apellido ?? '',
      identificacion: client?.identificacion ?? '',
      email: client?.email ?? '',
      celular: client?.celular ?? '',
      provincia: client?.provincia ?? '',
      ciudad: client?.ciudad ?? '',
      estado: client?.estado ?? true,
    },
  });

  const provincia = useWatch({ control, name: 'provincia' }) as string;

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await onSubmit(values, image);
    } catch (err) {
      if (!applyServerErrors(err, setError)) setServerError(getErrorMessage(err));
    }
  });

  return (
    <Modal
      open
      size="lg"
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
        {withPhoto && (
          <div className="full">
            <ImageField label="Foto" variant="avatar" currentUrl={client?.foto_url} value={image} onChange={setImage} />
          </div>
        )}
        <Input label="Nombre" required error={errors.nombre?.message} {...register('nombre')} />
        <Input label="Apellido" required error={errors.apellido?.message} {...register('apellido')} />
        <Input
          label="Cédula o RUC"
          required
          inputMode="numeric"
          maxLength={13}
          hint="10 dígitos (cédula) o 13 (RUC)"
          error={errors.identificacion?.message}
          {...register('identificacion')}
        />
        <Input label="Email" type="email" required error={errors.email?.message} {...register('email')} />
        <Input label="Celular" type="tel" inputMode="tel" error={errors.celular?.message} {...register('celular')} />
        <LocationFields register={register} setValue={setValue} errors={errors} provincia={provincia} />
        <Checkbox label="Activo" toggle {...register('estado')} />
      </form>
    </Modal>
  );
}
