import type { Id } from '@/shared/types/api';

export interface Permission {
  id: Id;
  codigo: string;
  descripcion: string | null;
}

/** "work_orders.spare_parts.add" -> "work_orders" */
export function permissionModule(codigo: string): string {
  return codigo.split('.')[0];
}

export const MODULE_LABELS: Record<string, string> = {
  users: 'Usuarios',
  roles: 'Roles',
  permissions: 'Permisos',
  categories: 'Categorías',
  products: 'Productos',
  sales: 'Ventas',
  clients: 'Clientes',
  brands: 'Marcas',
  models: 'Modelos',
  work_orders: 'Órdenes de trabajo',
  spare_parts: 'Repuestos',
};

export function groupPermissions(permissions: Permission[]): [string, Permission[]][] {
  const groups = new Map<string, Permission[]>();
  for (const p of permissions) {
    const key = permissionModule(p.codigo);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()];
}
