import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermission } from '@/modules/auth/components/Can';
import { Button, DataList, PageHeader, SearchInput, StatusBadge, useToast, type Column } from '@/shared/components';
import { useCrudList, useCrudMutations } from '@/shared/hooks/useCrud';
import { useListParams } from '@/shared/hooks/useListParams';
import { useStatusToggle } from '@/shared/hooks/useStatusToggle';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { RoleFormModal } from '../components/RoleFormModal';
import { ROLES_KEY, roleApi } from '../services/roleApi';
import type { Role } from '../types';

export function RolesPage() {
  const canManage = usePermission(P.ROLES_MANAGE);
  const navigate = useNavigate();
  const list = useListParams({});
  const query = useCrudList(ROLES_KEY, roleApi, list.params);
  const mutations = useCrudMutations(ROLES_KEY, roleApi);
  const toggleStatus = useStatusToggle(mutations.setStatus, 'el rol');
  const toast = useToast();
  const [editing, setEditing] = useState<Role | null | undefined>(undefined);

  const columns: Column<Role>[] = [
    { key: 'nombre', header: 'Rol', render: (r) => <strong>{r.nombre}</strong>, sortValue: (r) => r.nombre },
    { key: 'descripcion', header: 'Descripción', render: (r) => r.descripcion ?? '—' },
    { key: 'permisos', header: 'Permisos', align: 'right', render: (r) => r.permissions.length },
    { key: 'estado', header: 'Estado', render: (r) => <StatusBadge active={r.estado} /> },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      render: (r) => (
        <div className="row-actions">
          <Button size="sm" variant="ghost" onClick={() => navigate(`/roles/${r.id}/permissions`)}>
            Permisos
          </Button>
          {canManage && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => toggleStatus(r.id, r.estado, r.nombre)}>
                {r.estado ? 'Desactivar' : 'Activar'}
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Roles" actions={canManage && <Button onClick={() => setEditing(null)}>Nuevo rol</Button>} />
      <div className="toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Buscar rol…" />
      </div>
      <DataList query={query} columns={columns} rowKey={(r) => r.id} onPageChange={list.setPage} />

      {editing !== undefined && (
        <RoleFormModal
          role={editing}
          onClose={() => setEditing(undefined)}
          onSubmit={async (body) => {
            if (editing) await mutations.update.mutateAsync({ id: editing.id, body });
            else await mutations.create.mutateAsync(body);
            toast.success(editing ? 'Cambios guardados.' : 'Rol creado.');
            setEditing(undefined);
          }}
        />
      )}
    </>
  );
}
