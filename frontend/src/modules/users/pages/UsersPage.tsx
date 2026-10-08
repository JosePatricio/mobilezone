import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/store/AuthProvider';
import { usePermission } from '@/modules/auth/components/Can';
import { ROLES_KEY, roleApi } from '@/modules/roles/services/roleApi';
import {
  Avatar,
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
import { applyImageSelection } from '@/shared/services/uploads';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { formatDateTime } from '@/shared/utils/format';
import { DeleteUserModal } from '../components/DeleteUserModal';
import { UserFormModal } from '../components/UserFormModal';
import { USERS_KEY, userApi } from '../services/userApi';
import type { User } from '../types';

export function UsersPage() {
  const { user: me } = useAuth();
  const canCreate = usePermission(P.USERS_CREATE);
  const canUpdate = usePermission(P.USERS_UPDATE);
  const canDelete = usePermission(P.USERS_DELETE);
  const canViewRoles = usePermission(P.ROLES_VIEW);
  const list = useListParams<{ rol_id: string; estado: string }>({ rol_id: '', estado: '' });
  const query = useCrudList(USERS_KEY, userApi, list.params);
  const roles = useOptions(ROLES_KEY, roleApi, {}, canViewRoles);
  const mutations = useCrudMutations(USERS_KEY, userApi);
  const toggleStatus = useStatusToggle(mutations.setStatus, 'el usuario');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<User | null | undefined>(undefined);
  const [viewing, setViewing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  // Stable: the modal refocuses itself whenever onClose changes, which would interrupt typing.
  const closeDelete = useCallback(() => setDeleting(null), []);
  const roleRefs = (roles.data ?? []).map((r) => ({ id: r.id, nombre: r.nombre }));

  const columns: Column<User>[] = [
    {
      key: 'nombre',
      header: 'Usuario',
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
    {
      key: 'sucursales',
      header: 'Sucursales',
      render: (r) => (r.branches.length ? r.branches.map((b) => b.nombre).join(', ') : '—'),
    },
    { key: 'rol', header: 'Rol', render: (r) => r.role.nombre, sortValue: (r) => r.role.nombre },
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
                <Button size="sm" variant="ghost" onClick={() => toggleStatus(r.id, r.estado, `${r.nombre} ${r.apellido}`)}>
                  {r.estado ? 'Desactivar' : 'Activar'}
                </Button>
              )}
            </>
          )}
          {canDelete && r.id !== me?.id && (
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDeleting(r)}>
              Eliminar
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Usuarios" actions={canCreate && <Button onClick={() => setEditing(null)}>Nuevo usuario</Button>} />
      <div className="toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Buscar por nombre, email o cédula…" />
        {canViewRoles && (
          <Select
            aria-label="Filtrar por rol"
            value={list.filters.rol_id}
            onChange={(e) => list.setFilter('rol_id', e.target.value)}
            options={roleRefs.map((r) => ({ value: r.id, label: r.nombre }))}
            placeholder="Todos los roles"
          />
        )}
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
          roles={roleRefs}
          onClose={() => setEditing(undefined)}
          onSubmit={async (body, image) => {
            const saved = editing
              ? await mutations.update.mutateAsync({ id: editing.id, body })
              : await mutations.create.mutateAsync(body);
            await applyImageSelection(
              image,
              (file) => userApi.uploadPhoto(saved.id, file),
              () => userApi.removePhoto(saved.id),
            );
            await queryClient.invalidateQueries({ queryKey: [USERS_KEY] });
            toast.success(editing ? 'Cambios guardados.' : 'Usuario creado.');
            setEditing(undefined);
          }}
        />
      )}

      {deleting && (
        <DeleteUserModal
          user={deleting}
          onClose={closeDelete}
          onDeleted={() => {
            void queryClient.invalidateQueries();
            toast.success('Usuario eliminado.');
            setDeleting(null);
          }}
        />
      )}

      {viewing && (
        <Modal open title="Detalle de usuario" onClose={() => setViewing(null)}>
          <div className="detail-header">
            <Avatar src={viewing.foto_url} alt={`${viewing.nombre} ${viewing.apellido}`} size="lg" />
            <div>
              <h3>
                {viewing.nombre} {viewing.apellido}
              </h3>
              <StatusBadge active={viewing.estado} />
            </div>
          </div>
          <dl className="detail-list">
            <dt>Rol</dt>
            <dd>{viewing.role.nombre}</dd>
            <dt>Cédula / RUC</dt>
            <dd>{viewing.identificacion ?? '—'}</dd>
            <dt>Email</dt>
            <dd>{viewing.email}</dd>
            <dt>Celular</dt>
            <dd>{viewing.celular ?? '—'}</dd>
            <dt>Provincia</dt>
            <dd>{viewing.provincia ?? '—'}</dd>
            <dt>Ciudad</dt>
            <dd>{viewing.ciudad ?? '—'}</dd>
            <dt>Sucursales</dt>
            <dd>{viewing.branches.length ? viewing.branches.map((b) => b.nombre).join(', ') : '—'}</dd>
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
