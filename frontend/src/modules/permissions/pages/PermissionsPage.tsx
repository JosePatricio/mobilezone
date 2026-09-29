import { Card, ErrorState, Loading, PageHeader } from '@/shared/components';
import { usePermissionsCatalog } from '../services/permissionApi';
import { groupPermissions, MODULE_LABELS } from '../types';

export function PermissionsPage() {
  const query = usePermissionsCatalog();
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  return (
    <>
      <PageHeader title="Permisos">Catálogo de permisos del sistema. Se asignan a los roles.</PageHeader>
      <div className="permission-groups">
        {groupPermissions(query.data ?? []).map(([module, perms]) => (
          <Card key={module} title={MODULE_LABELS[module] ?? module}>
            <ul className="plain-list">
              {perms.map((p) => (
                <li key={p.id}>
                  <code>{p.codigo}</code>
                  <span className="muted">{p.descripcion}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
