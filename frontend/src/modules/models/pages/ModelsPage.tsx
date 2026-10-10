import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
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
  Loading,
  Select,
  STATUS_FILTER_OPTIONS,
  StatusBadge,
  Textarea,
  useConfirm,
  useToast,
  type Column,
} from '@/shared/components';
import { useCrudList, useCrudMutations } from '@/shared/hooks/useCrud';
import { useListParams } from '@/shared/hooks/useListParams';
import { useStatusToggle } from '@/shared/hooks/useStatusToggle';
import { getErrorMessage } from '@/shared/services/apiError';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { type FormShape, zodForm, applyServerErrors, zOptionalText, zText } from '@/shared/utils/validation';
import { MODELS_KEY, modelApi } from '../services/modelApi';
import type { DeviceModel } from '../types';

// The brand is not chosen in the form: it is the brand the screen was opened for.
const schema = z.object({
  nombre: zText(100),
  descripcion: zOptionalText(2000),
  estado: z.boolean(),
});
type FormInput = FormShape<typeof schema>;
type FormOutput = z.output<typeof schema>;

/** Models of one brand: opened from Marcas (the name of a brand) as /models?brand_id=4. */
export function ModelsPage() {
  const [searchParams] = useSearchParams();
  const brandId = Number(searchParams.get('brand_id'));
  // Without a brand there is nothing to show: Modelos is reached from Marcas.
  if (!Number.isInteger(brandId) || brandId <= 0) return <Navigate to="/brands" replace />;
  return <BrandModels key={brandId} brandId={brandId} />;
}

function BrandModels({ brandId }: { brandId: number }) {
  const canCreate = usePermission(P.MODELS_CREATE);
  const canUpdate = usePermission(P.MODELS_UPDATE);
  const canDelete = usePermission(P.MODELS_DELETE);
  const list = useListParams<{ brand_id: string; estado: string }>({ brand_id: String(brandId), estado: '' });
  const query = useCrudList(MODELS_KEY, modelApi, list.params);
  const brand = useQuery({ queryKey: [BRANDS_KEY, 'detail', brandId], queryFn: () => brandApi.get(brandId) });
  const mutations = useCrudMutations(MODELS_KEY, modelApi);
  // Marcas shows how many models each brand has.
  const queryClient = useQueryClient();
  const refreshBrandCounts = () => queryClient.invalidateQueries({ queryKey: [BRANDS_KEY] });
  const toggleStatus = useStatusToggle(mutations.setStatus, 'el modelo');
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState<DeviceModel | null | undefined>(undefined);

  const onDelete = async (m: DeviceModel) => {
    if (!(await confirm({ title: 'Eliminar modelo', message: `¿Eliminar "${m.nombre}"?`, danger: true, confirmLabel: 'Eliminar' })))
      return;
    try {
      await mutations.remove.mutateAsync(m.id);
      void refreshBrandCounts();
      toast.success('Modelo eliminado.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const columns: Column<DeviceModel>[] = [
    { key: 'id', header: 'ID', render: (r) => r.id, sortValue: (r) => r.id },
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

  if (brand.isPending) return <Loading />;
  // An unknown brand (e.g. deleted, or a wrong link): back to Marcas.
  if (brand.isError) return <Navigate to="/brands" replace />;
  const brandName = brand.data.nombre;

  return (
    <>
      <PageHeader
        title={`Modelos de ${brandName}`}
        actions={canCreate && <Button onClick={() => setEditing(null)}>Nuevo modelo</Button>}
      >
        <Link to="/brands">← Volver a Marcas</Link>
      </PageHeader>
      <div className="toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Buscar modelo…" />
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
          brandName={brandName}
          onClose={() => setEditing(undefined)}
          onSubmit={async (values) => {
            const body = { ...values, brand_id: brandId };
            if (editing) await mutations.update.mutateAsync({ id: editing.id, body });
            else {
              await mutations.create.mutateAsync(body);
              void refreshBrandCounts();
            }
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
  brandName,
  onClose,
  onSubmit,
}: {
  model: DeviceModel | null;
  brandName: string;
  onClose: () => void;
  onSubmit: (body: FormOutput) => Promise<void>;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodForm(schema),
    defaultValues: {
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
      title={model ? `Editar modelo de la marca ${brandName}` : `Ingresar modelo de la marca ${brandName}`}
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
        <Input label="Modelo" required error={errors.nombre?.message} {...register('nombre')} />
        <Textarea label="Descripción" className="full" error={errors.descripcion?.message} {...register('descripcion')} />
        <Checkbox label="Activo" toggle {...register('estado')} />
      </form>
    </Modal>
  );
}
