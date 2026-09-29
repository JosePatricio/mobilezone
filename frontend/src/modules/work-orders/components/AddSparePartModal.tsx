import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { SPARE_PARTS_KEY, sparePartApi } from '@/modules/spare-parts/services/sparePartApi';
import { Button, Input, Modal, MoneyInput, Select } from '@/shared/components';
import { useOptions } from '@/shared/hooks/useCrud';
import { getErrorMessage } from '@/shared/services/apiError';
import { formatMoney } from '@/shared/utils/money';
import { type FormShape, zodForm, applyServerErrors, zMoney, zRequiredId } from '@/shared/utils/validation';
import type { AddSparePartRequest } from '../types';

const schema = z.object({
  spare_part_id: zRequiredId('Seleccione un repuesto'),
  cantidad: z.coerce.number({ invalid_type_error: 'Ingrese un número' }).int('Debe ser entero').min(1, 'Mínimo 1'),
  precio: zMoney,
});
type FormInput = FormShape<typeof schema>;
type FormOutput = z.output<typeof schema>;

interface Props {
  onClose: () => void;
  onSubmit: (body: AddSparePartRequest) => Promise<void>;
}

/** The technician is taken from the session by the backend; it is not selectable here. */
export function AddSparePartModal({ onClose, onSubmit }: Props) {
  const parts = useOptions(SPARE_PARTS_KEY, sparePartApi);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodForm(schema),
    defaultValues: { spare_part_id: '', cantidad: 1, precio: '' },
  });

  const partField = register('spare_part_id', {
    onChange: (e) => {
      const part = parts.data?.find((p) => p.id === Number(e.target.value));
      if (part) setValue('precio', part.precio, { shouldValidate: true });
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
      title="Agregar repuesto"
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="add-spare-part-form" loading={isSubmitting}>
            Agregar
          </Button>
        </>
      }
    >
      <form id="add-spare-part-form" onSubmit={submit} noValidate className="form-grid">
        {serverError && (
          <div className="alert alert-error full" role="alert">
            {serverError}
          </div>
        )}
        <Select
          label="Repuesto"
          required
          className="full"
          placeholder={parts.isLoading ? 'Cargando…' : 'Seleccione…'}
          options={(parts.data ?? []).map((p) => ({ value: p.id, label: `${p.tipo} (${formatMoney(p.precio)})` }))}
          error={errors.spare_part_id?.message}
          {...partField}
        />
        <Input label="Cantidad" type="number" min={1} step={1} required error={errors.cantidad?.message} {...register('cantidad')} />
        <MoneyInput label="Precio" required error={errors.precio?.message} {...register('precio')} />
      </form>
    </Modal>
  );
}
