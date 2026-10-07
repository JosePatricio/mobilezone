import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/store/AuthProvider';
import { DashboardPage } from '@/modules/dashboard/pages/DashboardPage';
import { EmptyState, Loading } from '@/shared/components';
import { DASHBOARD_PERMISSIONS, homePath } from './navigation';

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

/** "/" shows the dashboard; users without it start in their own module (e.g. TECNICO → Repuestos afiliados). */
export function HomeRoute() {
  const { hasAnyPermission } = useAuth();
  if (hasAnyPermission(DASHBOARD_PERMISSIONS)) return <DashboardPage />;
  return <Navigate to={homePath(hasAnyPermission)} replace />;
}
