import { PERMISSIONS as P } from '@/shared/types/permissions';

export interface NavItem {
  to: string;
  label: string;
  /** Any of these permissions shows the item. Empty = always visible. */
  permissions: string[];
}

export interface NavGroup {
  label?: string;
  /** Tree in the sidebar: the label opens / closes its options. */
  collapsible?: boolean;
  items: NavItem[];
}

/** The dashboard shows work orders and sales: without them there is nothing to show. */
export const DASHBOARD_PERMISSIONS: string[] = [P.WORK_ORDERS_VIEW, P.SALES_VIEW];

/**
 * Sidebar menu, in this order. Items are filtered by the permissions of the current user.
 * The profile is opened from the user data in the header (top right).
 */
export const NAVIGATION: NavGroup[] = [
  {
    items: [
      { to: '/', label: 'Dashboard', permissions: DASHBOARD_PERMISSIONS },
      { to: '/work-orders', label: 'Órdenes', permissions: [P.WORK_ORDERS_VIEW] },
      { to: '/sales', label: 'Ventas', permissions: [P.SALES_VIEW, P.SALES_CREATE] },
      { to: '/affiliate-parts', label: 'Repuestos afiliados', permissions: [P.AFFILIATE_PARTS_MANAGE] },
    ],
  },
  {
    label: 'Comercial',
    collapsible: true,
    items: [
      { to: '/products', label: 'Productos', permissions: [P.PRODUCTS_VIEW] },
      { to: '/inventory', label: 'Inventario', permissions: [P.INVENTORY_VIEW] },
      { to: '/categories', label: 'Categorías', permissions: [P.CATEGORIES_VIEW] },
      { to: '/brands', label: 'Marcas', permissions: [P.BRANDS_VIEW] },
      { to: '/models', label: 'Modelos', permissions: [P.MODELS_VIEW] },
      { to: '/clients', label: 'Clientes', permissions: [P.CLIENTS_VIEW] },
    ],
  },
  {
    label: 'Configuración',
    collapsible: true,
    items: [
      { to: '/users', label: 'Usuarios', permissions: [P.USERS_VIEW] },
      { to: '/branches', label: 'Sucursales', permissions: [P.BRANCHES_VIEW] },
      { to: '/roles', label: 'Roles', permissions: [P.ROLES_VIEW] },
      { to: '/permissions', label: 'Permisos', permissions: [P.PERMISSIONS_VIEW] },
      { to: '/settings', label: 'Metas de venta', permissions: [P.SETTINGS_MANAGE] },
    ],
  },
];

export function visibleNavigation(hasAny: (codes: string[]) => boolean): NavGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.permissions.length === 0 || hasAny(item.permissions)),
  })).filter((group) => group.items.length > 0);
}

/**
 * Start page of users without a dashboard (e.g. TECNICO → Repuestos afiliados):
 * their first module of the menu, else Mi perfil.
 */
export function homePath(hasAny: (codes: string[]) => boolean): string {
  const items = visibleNavigation(hasAny).flatMap((group) => group.items);
  return items.find((item) => item.to !== '/' && item.to !== '/profile')?.to ?? '/profile';
}
