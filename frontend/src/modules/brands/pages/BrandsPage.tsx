import { Link } from 'react-router-dom';
import { usePermission } from '@/modules/auth/components/Can';
import { CatalogPage } from '@/shared/components/CatalogPage';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { BRANDS_KEY, brandApi } from '../services/brandApi';

/** Modelos is not in the menu: it opens from the name of a brand, filtered by that brand. */
export function BrandsPage() {
  const canViewModels = usePermission(P.MODELS_VIEW);
  return (
    <CatalogPage
      title="Marcas"
      entityLabel="marca"
      queryKey={BRANDS_KEY}
      api={brandApi}
      canCreate={usePermission(P.BRANDS_CREATE)}
      canUpdate={usePermission(P.BRANDS_UPDATE)}
      canDelete={usePermission(P.BRANDS_DELETE)}
      renderName={(r) =>
        canViewModels ? (
          <Link to={`/models?brand_id=${r.id}`} title={`Ver los modelos de ${r.nombre}`}>
            {r.nombre}
          </Link>
        ) : (
          r.nombre
        )
      }
      extraColumns={[
        {
          key: 'modelos',
          header: 'Modelos',
          align: 'right',
          render: (r) => r.modelos_count,
          sortValue: (r) => r.modelos_count,
        },
      ]}
    />
  );
}
