import { PERMISSIONS as P } from '@/shared/types/permissions';

export interface NavItem {
  to: string;
  label: string;
  /** Any of these permissions shows the item. Empty = always visible. */
  permissions: string[];
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/** Sidebar menu. Items are filtered by the permissions of the current user. */
export const NAVIGATION: NavGroup[] = [
  // Ventas is the first menu entry.
  { items: [{ to: '/sales', label: 'Ventas', permissions: [P.SALES_VIEW, P.SALES_CREATE] }] },
  { items: [{ to: '/', label: 'Dashboard', permissions: [] }] },
  {
    label: 'Comercial',
    items: [
      { to: '/products', label: 'Productos', permissions: [P.PRODUCTS_VIEW] },
      { to: '/inventory', label: 'Inventario', permissions: [P.INVENTORY_VIEW] },
      { to: '/categories', label: 'Categorías', permissions: [P.CATEGORIES_VIEW] },
    ],
  },
  {
    label: 'Taller',
    items: [
      { to: '/work-orders', label: 'Órdenes', permissions: [P.WORK_ORDERS_VIEW] },
      { to: '/spare-parts', label: 'Repuestos', permissions: [P.SPARE_PARTS_VIEW] },
      { to: '/clients', label: 'Clientes', permissions: [P.CLIENTS_VIEW] },
    ],
  },
  {
    label: 'Afiliados',
    items: [{ to: '/affiliate-parts', label: 'Repuestos afiliados', permissions: [P.AFFILIATE_PARTS_MANAGE] }],
  },
  {
    label: 'Configuración',
    items: [
      { to: '/branches', label: 'Sucursales', permissions: [P.BRANCHES_VIEW] },
      { to: '/brands', label: 'Marcas', permissions: [P.BRANDS_VIEW] },
      { to: '/models', label: 'Modelos', permissions: [P.MODELS_VIEW] },
      { to: '/users', label: 'Usuarios', permissions: [P.USERS_VIEW] },
      { to: '/roles', label: 'Roles', permissions: [P.ROLES_VIEW] },
      { to: '/permissions', label: 'Permisos', permissions: [P.PERMISSIONS_VIEW] },
      { to: '/settings', label: 'Configuración', permissions: [P.SETTINGS_RESET_DATA] },
    ],
  },
];

export function visibleNavigation(hasAny: (codes: string[]) => boolean): NavGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.permissions.length === 0 || hasAny(item.permissions)),
  })).filter((group) => group.items.length > 0);
}
