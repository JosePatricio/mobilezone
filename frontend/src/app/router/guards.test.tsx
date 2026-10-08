import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { Can } from '@/modules/auth/components/Can';
import { PERMISSIONS } from '@/shared/types/permissions';
import { fakeAuth, renderWithProviders } from '@/test/utils';
import { homePath, visibleNavigation } from './navigation';
import { HomeRoute, PermissionRoute, ProtectedRoute } from './guards';

function Routing() {
  return (
    <Routes>
      <Route path="/login" element={<p>Login page</p>} />
      <Route element={<ProtectedRoute />}>
        <Route element={<PermissionRoute permission="products.view" />}>
          <Route path="/products" element={<p>Products page</p>} />
        </Route>
      </Route>
    </Routes>
  );
}

describe('route protection', () => {
  it('redirects anonymous users to login', () => {
    renderWithProviders(<Routing />, { auth: fakeAuth({ status: 'anonymous', user: null }), route: '/products' });
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('being authenticated does not imply every permission', () => {
    renderWithProviders(<Routing />, { auth: fakeAuth({ permissionCodes: [] }), route: '/products' });
    expect(screen.getByText('Acceso restringido')).toBeInTheDocument();
    expect(screen.queryByText('Products page')).not.toBeInTheDocument();
  });

  it('renders when the permission is granted', () => {
    renderWithProviders(<Routing />, { auth: fakeAuth({ permissionCodes: ['products.view'] }), route: '/products' });
    expect(screen.getByText('Products page')).toBeInTheDocument();
  });
});

describe('Can', () => {
  it('hides restricted actions', () => {
    renderWithProviders(
      <>
        <Can permission="users.create">
          <button>Crear usuario</button>
        </Can>
        <Can permission={['products.view', 'x']}>
          <button>Ver productos</button>
        </Can>
      </>,
      { auth: fakeAuth({ permissionCodes: ['products.view'] }) },
    );
    expect(screen.queryByText('Crear usuario')).not.toBeInTheDocument();
    expect(screen.getByText('Ver productos')).toBeInTheDocument();
  });
});

describe('navigation', () => {
  const labels = (codes: string[]) =>
    visibleNavigation(fakeAuth({ permissionCodes: codes }).hasAnyPermission).flatMap((g) => g.items.map((i) => i.label));

  it('adapts the menu to the user permissions', () => {
    expect(labels(['work_orders.view'])).toEqual(['Dashboard', 'Órdenes']);
  });

  it('a seller sees Dashboard, Ventas and their commercial options', () => {
    expect(labels(['products.view', 'inventory.view', 'sales.view', 'sales.create'])).toEqual([
      'Dashboard',
      'Ventas',
      'Productos',
      'Inventario',
    ]);
  });

  it('the administrator sees the menu in this order, with Comercial and Configuración as trees', () => {
    const all = Object.values(PERMISSIONS);
    const groups = visibleNavigation(fakeAuth({ permissionCodes: all }).hasAnyPermission);
    expect(groups.map((g) => [g.label ?? null, g.items.map((i) => i.label)])).toEqual([
      [null, ['Dashboard', 'Órdenes', 'Ventas', 'Repuestos afiliados']],
      ['Comercial', ['Productos', 'Inventario', 'Categorías', 'Marcas', 'Modelos', 'Clientes']],
      ['Configuración', ['Usuarios', 'Sucursales', 'Roles', 'Permisos', 'Metas de venta']],
    ]);
    expect(groups.filter((g) => g.collapsible).map((g) => g.label)).toEqual(['Comercial', 'Configuración']);
    // Removed from the menu: Repuestos, Mi perfil (opened from the header) and "vaciar datos".
    expect(labels(all)).not.toContain('Repuestos');
    expect(labels(all)).not.toContain('Mi perfil');
  });
});

describe('technician (affiliate)', () => {
  const tech = () => fakeAuth({ permissionCodes: ['affiliate_parts.manage'] });

  it('only sees Repuestos afiliados (the profile is in the header)', () => {
    const labels = visibleNavigation(tech().hasAnyPermission).flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toEqual(['Repuestos afiliados']);
    expect(homePath(tech().hasAnyPermission)).toBe('/affiliate-parts');
  });

  it('starts in Repuestos afiliados instead of the dashboard', () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/affiliate-parts" element={<p>Repuestos afiliados page</p>} />
      </Routes>,
      { auth: tech(), route: '/' },
    );
    expect(screen.getByText('Repuestos afiliados page')).toBeInTheDocument();
  });

  it('a user without any module starts in Mi perfil', () => {
    expect(homePath(fakeAuth({ permissionCodes: [] }).hasAnyPermission)).toBe('/profile');
  });
});
