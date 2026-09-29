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
  MoneyInput,
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
import { formatMoney, toCents } from '@/shared/utils/money';
import { type FormShape, zodForm, applyServerErrors, zMoney, zText } from '@/shared/utils/validation';
import { SPARE_PARTS_KEY, sparePartApi } from '../services/sparePartApi';
import type { SparePart } from '../types';

const schema = z.object({
  tipo: zText(100),
  ubicacion: z.boolean(),
  precio: zMoney,
  garantia: z.boolean(),
  estado: z.boolean(),
});
type FormInput = FormShape<typeof schema>;
type FormOutput = z.output<typeof schema>;

const yesNo = (value: boolean) => (value ? 'Sí' : 'No');

export function SparePartsPage() {
  const canCreate = usePermission(P.SPARE_PARTS_CREATE);
  const canUpdate = usePermission(P.SPARE_PARTS_UPDATE);
  const canDelete = usePermission(P.SPARE_PARTS_DELETE);
  const list = useListParams<{ estado: string }>({ estado: '' });
  const query = useCrudList(SPARE_PARTS_KEY, sparePartApi, list.params);
  const mutations = useCrudMutations(SPARE_PARTS_KEY, sparePartApi);
  const toggleStatus = useStatusToggle(mutations.setStatus, 'el repuesto');
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState<SparePart | null | undefined>(undefined);

  const onDelete = async (part: SparePart) => {
    const ok = await confirm({
      title: 'Eliminar repuesto',
      message: `¿Está seguro de que desea eliminar "${part.tipo}"?`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await mutations.remove.mutateAsync(part.id);
      toast.success('Repuesto eliminado.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const columns: Column<SparePart>[] = [
    { key: 'id', header: 'ID', render: (r) => r.id, sortValue: (r) => r.id },
    { key: 'tipo', header: 'Tipo', render: (r) => r.tipo, sortValue: (r) => r.tipo.toLowerCase() },
    { key: 'ubicacion', header: 'Ubicación', render: (r) => yesNo(r.ubicacion) },
    { key: 'precio', header: 'Precio', align: 'right', render: (r) => formatMoney(r.precio), sortValue: (r) => toCents(r.precio) },
    { key: 'garantia', header: 'Garantía', render: (r) => yesNo(r.garantia) },
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
              <Button size="sm" variant="ghost" onClick={() => toggleStatus(r.id, r.estado, r.tipo)}>
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
        title="Repuestos"
        actions={canCreate && <Button onClick={() => setEditing(null)}>Nuevo repuesto</Button>}
      />
      <div className="toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Buscar por tipo…" />
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
        <SparePartFormModal
          part={editing}
          onClose={() => setEditing(undefined)}
          onSubmit={async (body) => {
            if (editing) await mutations.update.mutateAsync({ id: editing.id, body });
            else await mutations.create.mutateAsync(body);
            toast.success(editing ? 'Cambios guardados.' : 'Repuesto creado.');
            setEditing(undefined);
          }}
        />
      )}
    </>
  );
}

function SparePartFormModal({
  part,
  onClose,
  onSubmit,
}: {
  part: SparePart | null;
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
      tipo: part?.tipo ?? '',
      ubicacion: part?.ubicacion ?? false,
      precio: part?.precio ?? '',
      garantia: part?.garantia ?? false,
      estado: part?.estado ?? true,
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
      title={part ? 'Editar repuesto' : 'Nuevo repuesto'}
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="spare-part-form" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="spare-part-form" onSubmit={submit} noValidate className="form-grid">
        {serverError && (
          <div className="alert alert-error full" role="alert">
            {serverError}
          </div>
        )}
        <Input label="Tipo" required error={errors.tipo?.message} {...register('tipo')} />
        <MoneyInput label="Precio" required error={errors.precio?.message} {...register('precio')} />
        <Checkbox label="Ubicación" toggle {...register('ubicacion')} />
        <Checkbox label="Garantía" toggle {...register('garantia')} />
        <Checkbox label="Activo" toggle {...register('estado')} />
      </form>
    </Modal>
  );
}
