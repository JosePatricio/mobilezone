import { usePermission } from '@/modules/auth/components/Can';
import { CatalogPage } from '@/shared/components/CatalogPage';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { BRANDS_KEY, brandApi } from '../services/brandApi';

export function BrandsPage() {
  return (
    <CatalogPage
      title="Marcas"
      entityLabel="marca"
      queryKey={BRANDS_KEY}
      api={brandApi}
      canCreate={usePermission(P.BRANDS_CREATE)}
      canUpdate={usePermission(P.BRANDS_UPDATE)}
      canDelete={usePermission(P.BRANDS_DELETE)}
    />
  );
}
