import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { visibleNavigation } from '@/app/router/navigation';
import { useAuth } from '@/app/store/AuthProvider';
import { USER_TYPE_LABELS } from '@/modules/users/types';
import { useConfirm } from '@/shared/components';
import { fullName } from '@/shared/utils/format';

export function MainLayout() {
  const { user, logout, hasAnyPermission } = useAuth();
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
        <div className="app-brand">
          <span className="brand-mark" aria-hidden>
            MZ
          </span>
          <span>MobileZone</span>
        </div>
        <div className="app-user">
          <div className="app-user-info">
            <strong>{fullName(user)}</strong>
            <small className="muted">
              {user ? (user.role?.nombre ?? USER_TYPE_LABELS[user.tipo_usuario]) : ''}
            </small>
          </div>
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
        <Outlet />
      </main>
    </div>
  );
}
