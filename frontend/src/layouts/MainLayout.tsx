import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { visibleNavigation } from '@/app/router/navigation';
import { useAuth } from '@/app/store/AuthProvider';
import { Avatar, useConfirm } from '@/shared/components';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { fullName } from '@/shared/utils/format';
import { TodaySales } from './TodaySales';

export function MainLayout() {
  const { user, logout, hasAnyPermission, defaultPassword } = useAuth();
  const confirm = useConfirm();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const groups = visibleNavigation(hasAnyPermission);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const onLogout = async () => {
    if (await confirm({ title: 'Cerrar sesión', message: '¿Desea cerrar la sesión?', confirmLabel: 'Cerrar sesión' })) {
      logout('manual');
    }
  };

  return (
    <div className={`app-shell ${menuOpen ? 'menu-open' : ''}`}>
      <header className="app-header">
        <button
          type="button"
          className="icon-btn menu-toggle"
          aria-label="Abrir menú"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          ☰
        </button>
        <Link to="/" className="app-brand" aria-label="MobileZone: ir al inicio">
          <span className="brand-mark" aria-hidden>
            MZ
          </span>
          <span>MobileZone</span>
        </Link>
        <div className="app-user">
          {hasAnyPermission([P.SALES_CREATE, P.SALES_VIEW]) && <TodaySales />}
          <Link to="/profile" className="app-user-link" title="Mi perfil">
            <Avatar src={user?.foto_url} alt={fullName(user)} size="sm" />
            <div className="app-user-info">
              <strong>{fullName(user)}</strong>
              <small className="muted">{user?.role?.nombre ?? ''}</small>
            </div>
          </Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      <aside className="app-sidebar" aria-label="Menú principal">
        <nav>
          {groups.map((group, i) => (
            <div className="nav-group" key={group.label ?? i}>
              {group.label && <p className="nav-group-label">{group.label}</p>}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden />

      <main className="app-content">
        {defaultPassword && (
          <div className="alert alert-warning" role="alert">
            Su contraseña sigue siendo su cédula / RUC. Por seguridad, cámbiela en{' '}
            <Link to="/profile">Mi perfil</Link>.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
