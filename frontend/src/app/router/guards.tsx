import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/store/AuthProvider';
import { EmptyState, Loading } from '@/shared/components';

/** Requires an authenticated session; otherwise redirects to /login. */
export function ProtectedRoute({ children }: { children?: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading label="Verificando sesión…" />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children ?? <Outlet />}</>;
}

/** Requires a permission. Being authenticated does not imply having every permission. */
export function PermissionRoute({ permission, children }: { permission: string | string[]; children?: ReactNode }) {
  const { hasAnyPermission } = useAuth();
  const codes = Array.isArray(permission) ? permission : [permission];
  if (!hasAnyPermission(codes)) {
    return (
      <EmptyState title="Acceso restringido">No tiene permisos para acceder a esta sección.</EmptyState>
    );
  }
  return <>{children ?? <Outlet />}</>;
}
