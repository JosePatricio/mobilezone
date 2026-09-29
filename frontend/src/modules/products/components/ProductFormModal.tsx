import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Checkbox, Input, Modal, MoneyInput, Select, Textarea, type SelectOption } from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import { type FormShape, zodForm, applyServerErrors, zMoney, zOptionalText, zRequiredId, zText } from '@/shared/utils/validation';
import type { CreateProductRequest, Product } from '../types';

export const productSchema = z.object({
  nombre: zText(150),
  category_id: zRequiredId('Seleccione una categoría'),
  descripcion: zOptionalText(2000),
  precio: zMoney,
  stock: z.coerce
    .number({ invalid_type_error: 'Ingrese un número' })
    .int('Debe ser un número entero')
    .min(0, 'El stock no puede ser negativo'),
  estado: z.boolean(),
});
type FormInput = FormShape<typeof productSchema>;
type FormOutput = z.output<typeof productSchema>;

interface Props {
  product: Product | null;
  categoryOptions: SelectOption[];
  onClose: () => void;
  onSubmit: (body: CreateProductRequest) => Promise<void>;
}

export function ProductFormModal({ product, categoryOptions, onClose, onSubmit }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const options =
    product && !categoryOptions.some((c) => c.value === product.category_id)
      ? [...categoryOptions, { value: product.category_id, label: product.category.nombre }]
      : categoryOptions;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodForm(productSchema),
    defaultValues: {
      nombre: product?.nombre ?? '',
      category_id: product?.category_id ?? '',
      descripcion: product?.descripcion ?? '',
      precio: product?.precio ?? '',
      stock: product?.stock ?? 0,
      estado: product?.estado ?? true,
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
      size="lg"
      title={product ? 'Editar producto' : 'Nuevo producto'}
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="product-form" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} noValidate className="form-grid">
        {serverError && (
          <div className="alert alert-error full" role="alert">
            {serverError}
          </div>
        )}
        <Input label="Nombre" required error={errors.nombre?.message} {...register('nombre')} />
        <Select
          label="Categoría"
          required
          options={options}
          placeholder="Seleccione…"
          error={errors.category_id?.message}
          {...register('category_id')}
        />
        <Textarea label="Descripción" className="full" error={errors.descripcion?.message} {...register('descripcion')} />
        <MoneyInput label="Precio" required error={errors.precio?.message} {...register('precio')} />
        <Input
          label={product ? 'Stock actual' : 'Stock inicial'}
          type="number"
          min={0}
          step={1}
          readOnly={Boolean(product)}
          hint={product ? 'El stock se modifica con "Ajustar stock" o mediante ventas.' : undefined}
          error={errors.stock?.message}
          {...register('stock')}
        />
        <Checkbox label="Activo" toggle {...register('estado')} />
      </form>
    </Modal>
  );
}
