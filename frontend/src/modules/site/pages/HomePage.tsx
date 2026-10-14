import { Link } from 'react-router-dom';
import { PUBLIC_CATALOG_PATH } from '@/modules/affiliate-parts/paths';
import { SiteLayout } from '../components/SiteLayout';
import { SITE_CONTACT_EMAIL } from '../paths';

const FEATURES = [
  { title: 'Ventas', text: 'Facturación rápida, control de caja y comprobantes para cada venta.' },
  { title: 'Órdenes de trabajo', text: 'Registro de reparaciones con fotos, estados y seguimiento por código QR.' },
  { title: 'Inventario', text: 'Stock por sucursal, productos, proveedores y repuestos.' },
  { title: 'Repuestos de afiliados', text: 'Catálogo público de repuestos publicados por técnicos afiliados.' },
];

/** Public landing page (no login). */
export function HomePage() {
  return (
    <SiteLayout>
      <section className="site-hero">
        <h1>Gestión para tiendas y servicios técnicos de celulares</h1>
        <p className="muted">
          MobileZone reúne ventas, reparaciones e inventario en un solo lugar, para que su negocio atienda mejor y
          más rápido.
        </p>
        <div className="site-actions">
          <Link to="/login" className="btn btn-primary btn-md">
            Ingresar
          </Link>
          <Link to={PUBLIC_CATALOG_PATH} className="btn btn-secondary btn-md">
            Ver repuestos
          </Link>
        </div>
      </section>

      <ul className="site-features">
        {FEATURES.map((f) => (
          <li key={f.title} className="card card-body">
            <h2>{f.title}</h2>
            <p className="muted">{f.text}</p>
          </li>
        ))}
      </ul>

      <section className="site-section">
        <h2>Contacto</h2>
        <p>
          Escríbanos a <a href={`mailto:${SITE_CONTACT_EMAIL}`}>{SITE_CONTACT_EMAIL}</a>.
        </p>
      </section>
    </SiteLayout>
  );
}
