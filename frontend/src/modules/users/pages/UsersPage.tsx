import { useState } from 'react';
import { useAuth } from '@/app/store/AuthProvider';
import { usePermission } from '@/modules/auth/components/Can';
import { ROLES_KEY, roleApi } from '@/modules/roles/services/roleApi';
import {
  Button,
  DataList,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  STATUS_FILTER_OPTIONS,
  StatusBadge,
  useToast,
  type Column,
} from '@/shared/components';
import { useCrudList, useCrudMutations, useOptions } from '@/shared/hooks/useCrud';
import { useListParams } from '@/shared/hooks/useListParams';
import { useStatusToggle } from '@/shared/hooks/useStatusToggle';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { formatDateTime } from '@/shared/utils/format';
import { UserFormModal } from '../components/UserFormModal';
import { USERS_KEY, userApi } from '../services/userApi';
import { USER_TYPE_LABELS, type User } from '../types';

export function UsersPage() {
  const { user: me } = useAuth();
  const canCreate = usePermission(P.USERS_CREATE);
  const canUpdate = usePermission(P.USERS_UPDATE);
  const canViewRoles = usePermission(P.ROLES_VIEW);
  const list = useListParams<{ tipo_usuario: string; estado: string }>({ tipo_usuario: '', estado: '' });
  const query = useCrudList(USERS_KEY, userApi, list.params);
  const roles = useOptions(ROLES_KEY, roleApi, {}, canViewRoles);
  const mutations = useCrudMutations(USERS_KEY, userApi);
  const toggleStatus = useStatusToggle(mutations.setStatus, 'el usuario');
  const toast = useToast();
  const [editing, setEditing] = useState<User | null | undefined>(undefined);
  const [viewing, setViewing] = useState<User | null>(null);
  const roleOptions = (roles.data ?? []).map((r) => ({ value: r.id, label: r.nombre }));

  const columns: Column<User>[] = [
    { key: 'id', header: 'ID', render: (r) => r.id, sortValue: (r) => r.id },
    {
      key: 'nombre',
      header: 'Nombre',
      render: (r) => `${r.nombre} ${r.apellido}`,
      sortValue: (r) => `${r.nombre} ${r.apellido}`.toLowerCase(),
    },
    { key: 'email', header: 'Email', render: (r) => r.email },
    { key: 'tipo', header: 'Tipo', render: (r) => USER_TYPE_LABELS[r.tipo_usuario] },
    { key: 'rol', header: 'Rol', render: (r) => r.role?.nombre ?? '—' },
    { key: 'estado', header: 'Estado', render: (r) => <StatusBadge active={r.estado} /> },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      render: (r) => (
        <div className="row-actions">
          <Button size="sm" variant="ghost" onClick={() => setViewing(r)}>
            Ver
          </Button>
          {canUpdate && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                Editar
              </Button>
              {r.id !== me?.id && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleStatus(r.id, r.estado, `${r.nombre} ${r.apellido}`)}
                >
                  {r.estado ? 'Desactivar' : 'Activar'}
                </Button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Usuarios" actions={canCreate && <Button onClick={() => setEditing(null)}>Nuevo usuario</Button>} />
      <div className="toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Buscar por nombre o email…" />
        <Select
          aria-label="Filtrar por tipo"
          value={list.filters.tipo_usuario}
          onChange={(e) => list.setFilter('tipo_usuario', e.target.value)}
          options={Object.entries(USER_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          placeholder="Todos los tipos"
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
        <UserFormModal
          user={editing}
          roleOptions={roleOptions}
          onClose={() => setEditing(undefined)}
          onSubmit={async (body) => {
            if (editing) await mutations.update.mutateAsync({ id: editing.id, body });
            else await mutations.create.mutateAsync(body);
            toast.success(editing ? 'Cambios guardados.' : 'Usuario creado.');
            setEditing(undefined);
          }}
        />
      )}

      {viewing && (
        <Modal open title="Detalle de usuario" onClose={() => setViewing(null)}>
          <dl className="detail-list">
            <dt>Nombre</dt>
            <dd>
              {viewing.nombre} {viewing.apellido}
            </dd>
            <dt>Email</dt>
            <dd>{viewing.email}</dd>
            <dt>Tipo</dt>
            <dd>{USER_TYPE_LABELS[viewing.tipo_usuario]}</dd>
            <dt>Rol</dt>
            <dd>{viewing.role?.nombre ?? '—'}</dd>
            <dt>Estado</dt>
            <dd>
              <StatusBadge active={viewing.estado} />
            </dd>
            <dt>Creado</dt>
            <dd>{formatDateTime(viewing.created_at)}</dd>
            <dt>Actualizado</dt>
            <dd>{formatDateTime(viewing.updated_at)}</dd>
          </dl>
        </Modal>
      )}
    </>
  );
}
