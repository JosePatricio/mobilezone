import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Card, ErrorState, Loading } from '@/shared/components';
import { toApiError } from '@/shared/services/apiError';
import { PUBLIC_CATALOG_PATH } from '../paths';
import { affiliatePartApi } from '../services/affiliatePartApi';
import { PartDetails } from './PublicAffiliatePartsPage';

/** Public page of one spare part (shareable link, no login). */
export function PublicAffiliatePartPage() {
  const id = Number(useParams().id);
  const query = useQuery({
    queryKey: ['public-affiliate-part', id],
    queryFn: () => affiliatePartApi.publicGet(id),
    enabled: !Number.isNaN(id),
  });
  const notFound = Number.isNaN(id) || (query.isError && toApiError(query.error).status === 404);

  return (
    <div className="public-page">
      <div className="public-card">
        <div className="app-brand">
          <span className="brand-mark" aria-hidden>
            MZ
          </span>
          <span>MobileZone · Repuestos de afiliados</span>
        </div>
        {notFound ? (
          <Card title="Repuesto no encontrado">
            <p className="muted">El enlace no corresponde a ningún repuesto publicado.</p>
          </Card>
        ) : query.isLoading ? (
          <Loading />
        ) : query.isError || !query.data ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <section className="card part-card">
            <div className="card-body">
              <PartDetails part={query.data} />
            </div>
          </section>
        )}
        <p className="public-visits">
          <Link to={PUBLIC_CATALOG_PATH}>Ver todos los repuestos</Link>
        </p>
      </div>
    </div>
  );
}
