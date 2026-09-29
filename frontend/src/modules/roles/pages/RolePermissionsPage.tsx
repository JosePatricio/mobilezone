import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermission } from '@/modules/auth/components/Can';
import { usePermissionsCatalog } from '@/modules/permissions/services/permissionApi';
import { groupPermissions, MODULE_LABELS } from '@/modules/permissions/types';
import { Button, Card, Checkbox, ErrorState, Loading, PageHeader, useConfirm, useToast } from '@/shared/components';
import { useCrudItem } from '@/shared/hooks/useCrud';
import { getErrorMessage } from '@/shared/services/apiError';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { ROLES_KEY, roleApi } from '../services/roleApi';

/** Checkbox grid to associate / remove permissions from a role. */
export function RolePermissionsPage() {
  const roleId = Number(useParams().id);
  const canManage = usePermission(P.ROLES_MANAGE);
  const role = useCrudItem(ROLES_KEY, roleApi, roleId);
  const catalog = usePermissionsCatalog();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (role.data) setSelected(new Set(role.data.permissions.map((p) => p.id)));
  }, [role.data]);

  const save = useMutation({
    mutationFn: () => roleApi.setPermissions(roleId, [...selected]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ROLES_KEY] }),
  });

  const groups = useMemo(() => groupPermissions(catalog.data ?? []), [catalog.data]);
  const dirty = useMemo(() => {
    const original = new Set(role.data?.permissions.map((p) => p.id) ?? []);
    return original.size !== selected.size || [...selected].some((id) => !original.has(id));
  }, [role.data, selected]);

  if (role.isLoading || catalog.isLoading) return <Loading />;
  if (role.isError) return <ErrorState error={role.error} onRetry={() => role.refetch()} />;
  if (catalog.isError) return <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} />;

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleGroup = (ids: number[], checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });

  const onSave = async () => {
    const ok = await confirm({
      title: 'Guardar permisos',
      message: `Se actualizarán los permisos del rol ${role.data?.nombre}. Los usuarios con este rol verán los cambios al volver a iniciar sesión o recargar.`,
      confirmLabel: 'Guardar',
    });
    if (!ok) return;
    try {
      await save.mutateAsync();
      toast.success('Permisos actualizados.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title={`Rol: ${role.data?.nombre ?? ''}`}
        actions={
          canManage && (
            <Button onClick={onSave} loading={save.isPending} disabled={!dirty}>
              Guardar cambios
            </Button>
          )
        }
      >
        {selected.size} permiso(s) seleccionado(s)
      </PageHeader>
      <div className="permission-groups">
        {groups.map(([module, perms]) => {
          const ids = perms.map((p) => p.id);
          const all = ids.every((id) => selected.has(id));
          return (
            <Card
              key={module}
              title={MODULE_LABELS[module] ?? module}
              actions={
                canManage && (
                  <Button size="sm" variant="ghost" onClick={() => toggleGroup(ids, !all)}>
                    {all ? 'Quitar todos' : 'Marcar todos'}
                  </Button>
                )
              }
            >
              {perms.map((p) => (
                <Checkbox
                  key={p.id}
                  label={p.codigo}
                  description={p.descripcion ?? undefined}
                  checked={selected.has(p.id)}
                  disabled={!canManage}
                  onChange={() => toggle(p.id)}
                />
              ))}
            </Card>
          );
        })}
      </div>
    </>
  );
}
