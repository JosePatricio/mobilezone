import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/shared/components';
import { PUBLIC_CATALOG_PATH } from '@/modules/affiliate-parts/paths';
import { SITE_CONTACT_EMAIL, SITE_HOME_PATH, SITE_PRIVACY_PATH } from '../paths';

/** Header and footer shared by the public site pages. */
export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-page">
      <div className="site">
        <header className="site-header">
          <Link to={SITE_HOME_PATH} className="app-brand" aria-label="Inicio">
            <Logo />
          </Link>
          <nav className="site-nav">
            <Link to={PUBLIC_CATALOG_PATH}>Repuestos</Link>
            <Link to="/login">Ingresar</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer muted">
          <span>© {new Date().getFullYear()} MobileZone</span>
          <Link to={SITE_PRIVACY_PATH}>Política de privacidad</Link>
          <a href={`mailto:${SITE_CONTACT_EMAIL}`}>{SITE_CONTACT_EMAIL}</a>
        </footer>
      </div>
    </div>
  );
}
