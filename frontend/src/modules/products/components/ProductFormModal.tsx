import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Button,
  Checkbox,
  ImageField,
  Input,
  Modal,
  MoneyInput,
  NO_IMAGE_CHANGE,
  Select,
  Textarea,
  type ImageSelection,
  type SelectOption,
} from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import { type FormShape, zodForm, applyServerErrors, zMoney, zOptionalText, zRequiredId, zText } from '@/shared/utils/validation';
import type { Product, ProductRequest } from '../types';

export const productSchema = z.object({
  sku: zText(50)
    .refine((v) => !/\s/.test(v), 'El SKU no puede contener espacios')
    .transform((v) => v.toUpperCase()),
  nombre: zText(150),
  category_id: zRequiredId('Seleccione una categoría'),
  descripcion: zOptionalText(2000),
  precio_venta: zMoney,
  precio_costo: zMoney,
  precio_mayor: zMoney,
  estado: z.boolean(),
});
type FormInput = FormShape<typeof productSchema>;
type FormOutput = z.output<typeof productSchema>;

interface Props {
  product: Product | null;
  categoryOptions: SelectOption[];
  onClose: () => void;
  onSubmit: (body: ProductRequest, image: ImageSelection) => Promise<void>;
}

/** Stock is not part of the product: it is registered per branch in the Inventario module. */
export function ProductFormModal({ product, categoryOptions, onClose, onSubmit }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [image, setImage] = useState<ImageSelection>(NO_IMAGE_CHANGE);
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
      sku: product?.sku ?? '',
      nombre: product?.nombre ?? '',
      category_id: product?.category_id ?? '',
      descripcion: product?.descripcion ?? '',
      precio_venta: product?.precio_venta ?? '',
      precio_costo: product?.precio_costo ?? '',
      precio_mayor: product?.precio_mayor ?? '',
      estado: product?.estado ?? true,
    },
  });

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
        <div className="full">
          <ImageField label="Imagen" variant="product" currentUrl={product?.imagen_url} value={image} onChange={setImage} />
        </div>
        <Input
          label="SKU (código de producto)"
          required
          autoComplete="off"
          className="input-uppercase"
          error={errors.sku?.message}
          {...register('sku')}
        />
        <Input label="Nombre" required error={errors.nombre?.message} {...register('nombre')} />
        <Select
          label="Categoría"
          required
          options={options}
          placeholder="Seleccione…"
          error={errors.category_id?.message}
          {...register('category_id')}
        />
        <MoneyInput label="Precio de venta (PVP)" required error={errors.precio_venta?.message} {...register('precio_venta')} />
        <MoneyInput
          label="Precio de adquisición (costo)"
          required
          error={errors.precio_costo?.message}
          {...register('precio_costo')}
        />
        <MoneyInput label="Precio al por mayor" required error={errors.precio_mayor?.message} {...register('precio_mayor')} />
        <Textarea label="Descripción" className="full" error={errors.descripcion?.message} {...register('descripcion')} />
        <Checkbox label="Activo" toggle {...register('estado')} />
        {!product && (
          <p className="field-hint full">El stock se registra por sucursal en el módulo Inventario.</p>
        )}
      </form>
    </Modal>
  );
}
