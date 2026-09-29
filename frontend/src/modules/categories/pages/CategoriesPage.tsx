import { usePermission } from '@/modules/auth/components/Can';
import { CatalogPage } from '@/shared/components/CatalogPage';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { CATEGORIES_KEY, categoryApi } from '../services/categoryApi';

export function CategoriesPage() {
  return (
    <CatalogPage
      title="Categorías"
      entityLabel="categoría"
      queryKey={CATEGORIES_KEY}
      api={categoryApi}
      canCreate={usePermission(P.CATEGORIES_CREATE)}
      canUpdate={usePermission(P.CATEGORIES_UPDATE)}
      canDelete={usePermission(P.CATEGORIES_DELETE)}
    />
  );
}
