import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useCrudList, useCrudMutations } from '@/shared/hooks/useCrud';
import { useListParams } from '@/shared/hooks/useListParams';
import { useStatusToggle } from '@/shared/hooks/useStatusToggle';
import { getErrorMessage } from '@/shared/services/apiError';
import type { CrudApi } from '@/shared/services/crudApi';
import type { Id, Timestamps } from '@/shared/types/api';
import { type FormShape, zodForm, applyServerErrors, zOptionalText, zText } from '@/shared/utils/validation';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { useConfirm } from './ConfirmDialog';
import { DataList } from './DataList';
import { Input, Textarea } from './FormField';
import { SearchInput } from './Inputs';
import { Modal } from './Modal';
import { Select, STATUS_FILTER_OPTIONS } from './Select';
import { PageHeader, StatusBadge } from './States';
import type { Column } from './Table';
import { useToast } from './Toast';

export interface CatalogItem extends Timestamps {
  id: Id;
  nombre: string;
  descripcion: string | null;
  estado: boolean;
}

export interface CatalogRequest {
  nombre: string;
  descripcion: string | null;
  estado: boolean;
}

const schema = z.object({
  nombre: zText(100),
  descripcion: zOptionalText(2000),
  estado: z.boolean(),
});
type FormInput = FormShape<typeof schema>;
type FormOutput = z.output<typeof schema>;

interface CatalogPageProps<T extends CatalogItem> {
  title: string;
  entityLabel: string;
  queryKey: string;
  api: CrudApi<T, CatalogRequest>;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** Content of the name cell (e.g. a link); defaults to the plain name. */
  renderName?: (item: T) => ReactNode;
  /** Columns shown after the description. */
  extraColumns?: Column<T>[];
}

/** Generic list + form screen for simple catalogs (nombre / descripción / estado). */
export function CatalogPage<T extends CatalogItem>({
  title,
  entityLabel,
  queryKey,
  api,
  canCreate,
  canUpdate,
  canDelete,
  renderName = (r) => r.nombre,
  extraColumns = [],
}: CatalogPageProps<T>) {
  const list = useListParams<{ estado: string }>({ estado: '' });
  const query = useCrudList(queryKey, api, list.params);
  const mutations = useCrudMutations(queryKey, api);
  const toggleStatus = useStatusToggle(mutations.setStatus, `la ${entityLabel}`);
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState<T | null | undefined>(undefined);

  const onDelete = async (item: T) => {
    const ok = await confirm({
      title: `Eliminar ${entityLabel}`,
      message: `¿Está seguro de que desea eliminar "${item.nombre}"? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await mutations.remove.mutateAsync(item.id);
      toast.success('Registro eliminado.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const columns: Column<T>[] = [
    { key: 'id', header: 'ID', render: (r) => r.id, sortValue: (r) => r.id },
    { key: 'nombre', header: 'Nombre', render: renderName, sortValue: (r) => r.nombre.toLowerCase() },
    { key: 'descripcion', header: 'Descripción', render: (r) => r.descripcion ?? '—' },
    ...extraColumns,
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
      <PageHeader
        title={title}
        actions={canCreate && <Button onClick={() => setEditing(null)}>Nueva {entityLabel}</Button>}
      />
      <div className="toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Buscar por nombre…" />
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
        <CatalogFormModal
          item={editing}
          entityLabel={entityLabel}
          onClose={() => setEditing(undefined)}
          onSubmit={async (body) => {
            if (editing) await mutations.update.mutateAsync({ id: editing.id, body });
            else await mutations.create.mutateAsync(body);
            toast.success(editing ? 'Cambios guardados.' : `${entityLabel[0].toUpperCase()}${entityLabel.slice(1)} creada.`);
            setEditing(undefined);
          }}
        />
      )}
    </>
  );
}

function CatalogFormModal({
  item,
  entityLabel,
  onClose,
  onSubmit,
}: {
  item: CatalogItem | null;
  entityLabel: string;
  onClose: () => void;
  onSubmit: (body: CatalogRequest) => Promise<void>;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodForm(schema),
    defaultValues: { nombre: item?.nombre ?? '', descripcion: item?.descripcion ?? '', estado: item?.estado ?? true },
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
      title={item ? `Editar ${entityLabel}` : `Nueva ${entityLabel}`}
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="catalog-form" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="catalog-form" onSubmit={submit} noValidate className="form-grid">
        {serverError && (
          <div className="alert alert-error full" role="alert">
            {serverError}
          </div>
        )}
        <Input label="Nombre" required className="full" error={errors.nombre?.message} {...register('nombre')} />
        <Textarea label="Descripción" className="full" error={errors.descripcion?.message} {...register('descripcion')} />
        <Checkbox label="Activo" toggle {...register('estado')} />
      </form>
    </Modal>
  );
}
