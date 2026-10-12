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
import {
  type FormShape,
  zodForm,
  applyServerErrors,
  zOptionalEmail,
  zOptionalText,
  zText,
} from '@/shared/utils/validation';
import { SUPPLIERS_KEY, supplierApi } from '../services/supplierApi';
import type { Supplier, SupplierRequest } from '../types';

const schema = z.object({
  nombre: zText(150),
  ruc: zOptionalText(20).refine((v) => v === null || /^\d{10,13}$/.test(v), 'RUC / cédula inválido (10 a 13 dígitos)'),
  telefono: zOptionalText(20).refine((v) => v === null || /^[\d\s()+-]{7,20}$/.test(v), 'Teléfono inválido'),
  email: zOptionalEmail,
  direccion: zOptionalText(255),
  estado: z.boolean(),
});
type FormInput = FormShape<typeof schema>;
type FormOutput = z.output<typeof schema>;

/** Proveedores: chosen in the product form (Productos › Proveedor). */
export function SuppliersPage() {
  const canCreate = usePermission(P.SUPPLIERS_CREATE);
  const canUpdate = usePermission(P.SUPPLIERS_UPDATE);
  const canDelete = usePermission(P.SUPPLIERS_DELETE);
  const list = useListParams<{ estado: string }>({ estado: '' });
  const query = useCrudList(SUPPLIERS_KEY, supplierApi, list.params);
  const mutations = useCrudMutations(SUPPLIERS_KEY, supplierApi);
  const toggleStatus = useStatusToggle(mutations.setStatus, 'el proveedor');
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState<Supplier | null | undefined>(undefined);

  const onDelete = async (s: Supplier) => {
    const ok = await confirm({
      title: 'Eliminar proveedor',
      message: `¿Está seguro de que desea eliminar "${s.nombre}"? Si tiene productos asociados, desactívelo en su lugar.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await mutations.remove.mutateAsync(s.id);
      toast.success('Proveedor eliminado.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const columns: Column<Supplier>[] = [
    { key: 'nombre', header: 'Proveedor', render: (r) => <strong>{r.nombre}</strong>, sortValue: (r) => r.nombre.toLowerCase() },
    { key: 'ruc', header: 'RUC / Cédula', render: (r) => r.ruc ?? '—' },
    { key: 'telefono', header: 'Teléfono', render: (r) => r.telefono ?? '—' },
    { key: 'email', header: 'Email', render: (r) => r.email ?? '—' },
    { key: 'direccion', header: 'Dirección', render: (r) => r.direccion ?? '—' },
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
        title="Proveedores"
        actions={canCreate && <Button onClick={() => setEditing(null)}>Nuevo proveedor</Button>}
      >
        Proveedores de los productos; se eligen al registrar un producto.
      </PageHeader>
      <div className="toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Buscar por nombre o RUC…" />
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
        <SupplierFormModal
          supplier={editing}
          onClose={() => setEditing(undefined)}
          onSubmit={async (body) => {
            if (editing) await mutations.update.mutateAsync({ id: editing.id, body });
            else await mutations.create.mutateAsync(body);
            toast.success(editing ? 'Cambios guardados.' : 'Proveedor creado.');
            setEditing(undefined);
          }}
        />
      )}
    </>
  );
}

function SupplierFormModal({
  supplier,
  onClose,
  onSubmit,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSubmit: (body: SupplierRequest) => Promise<void>;
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
      nombre: supplier?.nombre ?? '',
      ruc: supplier?.ruc ?? '',
      telefono: supplier?.telefono ?? '',
      email: supplier?.email ?? '',
      direccion: supplier?.direccion ?? '',
      estado: supplier?.estado ?? true,
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
      title={supplier ? 'Editar proveedor' : 'Nuevo proveedor'}
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="supplier-form" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="supplier-form" onSubmit={submit} noValidate className="form-grid">
        {serverError && (
          <div className="alert alert-error full" role="alert">
            {serverError}
          </div>
        )}
        <Input label="Nombre" required className="full" error={errors.nombre?.message} {...register('nombre')} />
        <Input label="RUC / Cédula" inputMode="numeric" error={errors.ruc?.message} {...register('ruc')} />
        <Input label="Teléfono" type="tel" inputMode="tel" error={errors.telefono?.message} {...register('telefono')} />
        <Input label="Email" type="email" className="full" error={errors.email?.message} {...register('email')} />
        <Input label="Dirección" className="full" error={errors.direccion?.message} {...register('direccion')} />
        <Checkbox label="Activo" toggle {...register('estado')} />
      </form>
    </Modal>
  );
}
