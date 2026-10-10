import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { usePermission } from '@/modules/auth/components/Can';
import { BRANDS_KEY, brandApi } from '@/modules/brands/services/brandApi';
import {
  Button,
  Checkbox,
  DataList,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  STATUS_FILTER_OPTIONS,
  StatusBadge,
  Textarea,
  useConfirm,
  useToast,
  type Column,
} from '@/shared/components';
import { useCrudList, useCrudMutations, useOptions } from '@/shared/hooks/useCrud';
import { useListParams } from '@/shared/hooks/useListParams';
import { useStatusToggle } from '@/shared/hooks/useStatusToggle';
import { getErrorMessage } from '@/shared/services/apiError';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { type FormShape, zodForm, applyServerErrors, zOptionalText, zRequiredId, zText } from '@/shared/utils/validation';
import { MODELS_KEY, modelApi } from '../services/modelApi';
import type { DeviceModel } from '../types';

const schema = z.object({
  brand_id: zRequiredId('Seleccione una marca'),
  nombre: zText(100),
  descripcion: zOptionalText(2000),
  estado: z.boolean(),
});
type FormInput = FormShape<typeof schema>;
type FormOutput = z.output<typeof schema>;

export function ModelsPage() {
  const canCreate = usePermission(P.MODELS_CREATE);
  const canUpdate = usePermission(P.MODELS_UPDATE);
  const canDelete = usePermission(P.MODELS_DELETE);
  // Opened from Marcas (the name of a brand): filtered by that brand.
  const [searchParams] = useSearchParams();
  const list = useListParams<{ brand_id: string; estado: string }>({ brand_id: searchParams.get('brand_id') ?? '', estado: '' });
  const query = useCrudList(MODELS_KEY, modelApi, list.params);
  const brands = useOptions(BRANDS_KEY, brandApi);
  const mutations = useCrudMutations(MODELS_KEY, modelApi);
  const toggleStatus = useStatusToggle(mutations.setStatus, 'el modelo');
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState<DeviceModel | null | undefined>(undefined);
  const brandOptions = (brands.data ?? []).map((b) => ({ value: b.id, label: b.nombre }));

  const onDelete = async (m: DeviceModel) => {
    if (!(await confirm({ title: 'Eliminar modelo', message: `¿Eliminar "${m.nombre}"?`, danger: true, confirmLabel: 'Eliminar' })))
      return;
    try {
      await mutations.remove.mutateAsync(m.id);
      toast.success('Modelo eliminado.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const columns: Column<DeviceModel>[] = [
    { key: 'id', header: 'ID', render: (r) => r.id, sortValue: (r) => r.id },
    { key: 'marca', header: 'Marca', render: (r) => r.brand.nombre, sortValue: (r) => r.brand.nombre.toLowerCase() },
    { key: 'nombre', header: 'Modelo', render: (r) => r.nombre, sortValue: (r) => r.nombre.toLowerCase() },
    { key: 'descripcion', header: 'Descripción', render: (r) => r.descripcion ?? '—' },
    { key: 'estado', header: 'Estado', render: (r) => <StatusBadge active={r.estado} /> },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      render: (r) => (
        <div className="row-actions">
          {canUpdate && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => toggleStatus(r.id, r.estado, r.nombre)}>
                {r.estado ? 'Desactivar' : 'Activar'}
              </Button>
            </>
          )}
          {canDelete && (
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => onDelete(r)}>
              Eliminar
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Modelos" actions={canCreate && <Button onClick={() => setEditing(null)}>Nuevo modelo</Button>}>
        <Link to="/brands">← Volver a Marcas</Link>
      </PageHeader>
      <div className="toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Buscar modelo…" />
        <Select
          aria-label="Filtrar por marca"
          value={list.filters.brand_id}
          onChange={(e) => list.setFilter('brand_id', e.target.value)}
          options={brandOptions}
          placeholder="Todas las marcas"
        />
        <Select
          aria-label="Filtrar por estado"
          value={list.filters.estado}
          onChange={(e) => list.setFilter('estado', e.target.value)}
          options={STATUS_FILTER_OPTIONS}
          placeholder="Todos los estados"
        />
      </div>
      <DataList query={query} columns={columns} rowKey={(r) => r.id} onPageChange={list.setPage} />

      {editing !== undefined && (
        <ModelFormModal
          model={editing}
          brandOptions={brandOptions}
          onClose={() => setEditing(undefined)}
          onSubmit={async (body) => {
            if (editing) await mutations.update.mutateAsync({ id: editing.id, body });
            else await mutations.create.mutateAsync(body);
            toast.success(editing ? 'Cambios guardados.' : 'Modelo creado.');
            setEditing(undefined);
          }}
        />
      )}
    </>
  );
}

function ModelFormModal({
  model,
  brandOptions,
  onClose,
  onSubmit,
}: {
  model: DeviceModel | null;
  brandOptions: { value: number; label: string }[];
  onClose: () => void;
  onSubmit: (body: FormOutput) => Promise<void>;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const options =
    model && !brandOptions.some((b) => b.value === model.brand_id)
      ? [...brandOptions, { value: model.brand_id, label: model.brand.nombre }]
      : brandOptions;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodForm(schema),
    defaultValues: {
      brand_id: model?.brand_id ?? '',
      nombre: model?.nombre ?? '',
      descripcion: model?.descripcion ?? '',
      estado: model?.estado ?? true,
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
      title={model ? 'Editar modelo' : 'Nuevo modelo'}
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="model-form" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="model-form" onSubmit={submit} noValidate className="form-grid">
        {serverError && (
          <div className="alert alert-error full" role="alert">
            {serverError}
          </div>
        )}
        <Select
          label="Marca"
          required
          options={options}
          placeholder="Seleccione…"
          error={errors.brand_id?.message}
          {...register('brand_id')}
        />
        <Input label="Modelo" required error={errors.nombre?.message} {...register('nombre')} />
        <Textarea label="Descripción" className="full" error={errors.descripcion?.message} {...register('descripcion')} />
        <Checkbox label="Activo" toggle {...register('estado')} />
      </form>
    </Modal>
  );
}
