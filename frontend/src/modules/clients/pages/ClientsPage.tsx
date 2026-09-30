import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePermission } from '@/modules/auth/components/Can';
import {
  Avatar,
  Button,
  DataList,
  PageHeader,
  SearchInput,
  Select,
  STATUS_FILTER_OPTIONS,
  StatusBadge,
  useToast,
  type Column,
} from '@/shared/components';
import { useCrudList, useCrudMutations } from '@/shared/hooks/useCrud';
import { useListParams } from '@/shared/hooks/useListParams';
import { useStatusToggle } from '@/shared/hooks/useStatusToggle';
import { applyImageSelection } from '@/shared/services/uploads';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { ClientFormModal } from '../components/ClientFormModal';
import { CLIENTS_KEY, clientApi } from '../services/clientApi';
import type { Client } from '../types';

export function ClientsPage() {
  const canCreate = usePermission(P.CLIENTS_CREATE);
  const canUpdate = usePermission(P.CLIENTS_UPDATE);
  const list = useListParams<{ estado: string }>({ estado: '' });
  const query = useCrudList(CLIENTS_KEY, clientApi, list.params);
  const mutations = useCrudMutations(CLIENTS_KEY, clientApi);
  const toggleStatus = useStatusToggle(mutations.setStatus, 'el cliente');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Client | null | undefined>(undefined);

  const columns: Column<Client>[] = [
    {
      key: 'nombre',
      header: 'Cliente',
      sortValue: (r) => `${r.nombre} ${r.apellido}`.toLowerCase(),
      render: (r) => (
        <div className="cell-with-image">
          <Avatar src={r.foto_url} alt={`${r.nombre} ${r.apellido}`} size="sm" />
          <div>
            <strong>
              {r.nombre} {r.apellido}
            </strong>
            <small className="muted">{r.email}</small>
          </div>
        </div>
      ),
    },
    { key: 'identificacion', header: 'Cédula / RUC', render: (r) => r.identificacion ?? '—' },
    { key: 'celular', header: 'Celular', render: (r) => r.celular ?? '—' },
    {
      key: 'ciudad',
      header: 'Ciudad',
      render: (r) => (r.ciudad ? `${r.ciudad}, ${r.provincia}` : '—'),
      sortValue: (r) => r.ciudad ?? '',
    },
    { key: 'estado', header: 'Estado', render: (r) => <StatusBadge active={r.estado} /> },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      render: (r) =>
        canUpdate && (
          <div className="row-actions">
            <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
              Editar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => toggleStatus(r.id, r.estado, `${r.nombre} ${r.apellido}`)}>
              {r.estado ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Clientes" actions={canCreate && <Button onClick={() => setEditing(null)}>Nuevo cliente</Button>} />
      <div className="toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Buscar por nombre, email o cédula…" />
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
        <ClientFormModal
          client={editing}
          onClose={() => setEditing(undefined)}
          onSubmit={async (body, image) => {
            const saved = editing
              ? await mutations.update.mutateAsync({ id: editing.id, body })
              : await mutations.create.mutateAsync(body);
            await applyImageSelection(
              image,
              (file) => clientApi.uploadPhoto(saved.id, file),
              () => clientApi.removePhoto(saved.id),
            );
            await queryClient.invalidateQueries({ queryKey: [CLIENTS_KEY] });
            toast.success(editing ? 'Cambios guardados.' : 'Cliente creado.');
            setEditing(undefined);
          }}
        />
      )}
    </>
  );
}
