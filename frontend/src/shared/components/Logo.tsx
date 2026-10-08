/** MobileZone logo (frontend/public/img/logo.jpeg), on its own light plate so it reads in light and dark mode. */
export const LOGO_URL = '/img/logo.jpeg';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return <img src={LOGO_URL} alt="MobileZone" className={`app-logo app-logo-${size}`} />;
}
