import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { Can } from '@/modules/auth/components/Can';
import { fakeAuth, renderWithProviders } from '@/test/utils';
import { visibleNavigation } from './navigation';
import { PermissionRoute, ProtectedRoute } from './guards';

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
  it('adapts the menu to the user permissions', () => {
    const auth = fakeAuth({ permissionCodes: ['work_orders.view'] });
    const labels = visibleNavigation(auth.hasAnyPermission).flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toEqual(['Dashboard', 'Órdenes']);
  });
});
