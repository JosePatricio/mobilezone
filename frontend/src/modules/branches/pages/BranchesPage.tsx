import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { usePermission } from '@/modules/auth/components/Can';
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
import { BRANCHES_KEY, branchApi } from '../services/branchApi';
import type { Branch, BranchRequest } from '../types';

const schema = z.object({
  nombre: zText(100),
  ubicacion: zText(255, 'Ingrese la ubicación'),
  telefono: zOptionalText(20).refine((v) => v === null || /^[\d\s()+-]{7,20}$/.test(v), 'Teléfono inválido'),
  estado: z.boolean(),
});
type FormInput = FormShape<typeof schema>;
type FormOutput = z.output<typeof schema>;

export function BranchesPage() {
  const canCreate = usePermission(P.BRANCHES_CREATE);
  const canUpdate = usePermission(P.BRANCHES_UPDATE);
  const canDelete = usePermission(P.BRANCHES_DELETE);
  const list = useListParams<{ estado: string }>({ estado: '' });
  const query = useCrudList(BRANCHES_KEY, branchApi, list.params);
  const mutations = useCrudMutations(BRANCHES_KEY, branchApi);
  const toggleStatus = useStatusToggle(mutations.setStatus, 'la sucursal');
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState<Branch | null | undefined>(undefined);

  const onDelete = async (b: Branch) => {
    const ok = await confirm({
      title: 'Eliminar sucursal',
      message: `¿Está seguro de que desea eliminar "${b.nombre}"? Si tiene inventario o ventas, desactívela en su lugar.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await mutations.remove.mutateAsync(b.id);
      toast.success('Sucursal eliminada.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const columns: Column<Branch>[] = [
    { key: 'nombre', header: 'Sucursal', render: (r) => <strong>{r.nombre}</strong>, sortValue: (r) => r.nombre },
    { key: 'ubicacion', header: 'Ubicación', render: (r) => r.ubicacion },
    { key: 'telefono', header: 'Teléfono', render: (r) => r.telefono ?? '—' },
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
        title="Sucursales"
        actions={canCreate && <Button onClick={() => setEditing(null)}>Nueva sucursal</Button>}
      />
      <div className="toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Buscar por nombre o ubicación…" />
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
        <BranchFormModal
          branch={editing}
          onClose={() => setEditing(undefined)}
          onSubmit={async (body) => {
            if (editing) await mutations.update.mutateAsync({ id: editing.id, body });
            else await mutations.create.mutateAsync(body);
            toast.success(editing ? 'Cambios guardados.' : 'Sucursal creada.');
            setEditing(undefined);
          }}
        />
      )}
    </>
  );
}

function BranchFormModal({
  branch,
  onClose,
  onSubmit,
}: {
  branch: Branch | null;
  onClose: () => void;
  onSubmit: (body: BranchRequest) => Promise<void>;
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
      nombre: branch?.nombre ?? '',
      ubicacion: branch?.ubicacion ?? '',
      telefono: branch?.telefono ?? '',
      estado: branch?.estado ?? true,
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
      title={branch ? 'Editar sucursal' : 'Nueva sucursal'}
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="branch-form" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="branch-form" onSubmit={submit} noValidate className="form-grid">
        {serverError && (
          <div className="alert alert-error full" role="alert">
            {serverError}
          </div>
        )}
        <Input label="Nombre" required error={errors.nombre?.message} {...register('nombre')} />
        <Input label="Teléfono" type="tel" inputMode="tel" error={errors.telefono?.message} {...register('telefono')} />
        <Input label="Ubicación" required className="full" error={errors.ubicacion?.message} {...register('ubicacion')} />
        <Checkbox label="Activa" toggle {...register('estado')} />
      </form>
    </Modal>
  );
}
