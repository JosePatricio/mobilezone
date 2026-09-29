import type { ReactNode } from 'react';
import { useAuth } from '@/app/store/AuthProvider';

interface CanProps {
  /** Required permission (or any of the list). */
  permission: string | string[];
  children: ReactNode;
  fallback?: ReactNode;
}

/** Hides UI the user is not allowed to use. The backend still enforces permissions. */
export function Can({ permission, children, fallback = null }: CanProps) {
  const { hasAnyPermission } = useAuth();
  const codes = Array.isArray(permission) ? permission : [permission];
  return <>{hasAnyPermission(codes) ? children : fallback}</>;
}

export function usePermission(code: string): boolean {
  return useAuth().hasPermission(code);
}
