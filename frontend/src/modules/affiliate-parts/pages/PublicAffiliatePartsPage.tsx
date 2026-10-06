import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { EmptyState, ErrorState, Loading, Pagination, SearchInput, Select, StatusBadge } from '@/shared/components';
import { useListParams } from '@/shared/hooks/useListParams';
import { formatDate, fullName } from '@/shared/utils/format';
import { formatMoney } from '@/shared/utils/money';
import { partStatusTone, useAffiliatePartCatalogs } from '../hooks/useAffiliatePartCatalogs';
import { affiliatePartApi } from '../services/affiliatePartApi';
import type { AffiliatePart } from '../types';

/** Public catalog (no login): the spare parts every affiliate publishes. Each opening counts one visit. */
export function PublicAffiliatePartsPage() {
  const catalogs = useAffiliatePartCatalogs();
  const list = useListParams<{ tipo: string; condicion: string; estado: string }>(
    { tipo: '', condicion: '', estado: 'DISPONIBLE' },
    24,
  );
  const query = useQuery({
    queryKey: ['public-affiliate-parts', list.params],
    queryFn: () => affiliatePartApi.publicList(list.params),
    placeholderData: keepPreviousData,
  });
  const [visitas, setVisitas] = useState<number | null>(null);
  const counted = useRef(false);

  useEffect(() => {
    // Once per page load (StrictMode runs effects twice in development).
    if (counted.current) return;
    counted.current = true;
    affiliatePartApi.registerVisit().then(setVisitas, () => undefined);
  }, []);

  const page = query.data;

  return (
    <div className="public-page">
      <div className="public-catalog">
        <div className="app-brand">
          <span className="brand-mark" aria-hidden>
            MZ
          </span>
          <span>MobileZone · Repuestos de afiliados</span>
        </div>

        <div className="toolbar">
          <SearchInput value={list.search} onChange={list.setSearch} placeholder="Buscar modelo, afiliado o ciudad…" />
          <Select
            aria-label="Tipo de repuesto"
            value={list.filters.tipo}
            onChange={(e) => list.setFilter('tipo', e.target.value)}
            options={catalogs.tipos}
            placeholder="Todos los tipos"
          />
          <Select
            aria-label="Estado"
            value={list.filters.condicion}
            onChange={(e) => list.setFilter('condicion', e.target.value)}
            options={catalogs.condiciones}
            placeholder="Nuevo y usado"
          />
          <Select
            aria-label="Disponibilidad"
            value={list.filters.estado}
            onChange={(e) => list.setFilter('estado', e.target.value)}
            options={catalogs.estados}
            placeholder="Disponibles y vendidos"
          />
        </div>

        {query.isLoading ? (
          <Loading />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : !page || page.items.length === 0 ? (
          <EmptyState>No hay repuestos publicados con esos filtros.</EmptyState>
        ) : (
          <>
            <ul className="part-grid">
              {page.items.map((part) => (
                <PartCard key={part.id} part={part} />
              ))}
            </ul>
            <Pagination page={page.page} pages={page.pages} total={page.total} onChange={list.setPage} />
          </>
        )}

        {visitas !== null && (
          <p className="field-hint public-visits">
            {visitas} {visitas === 1 ? 'visita' : 'visitas'}
          </p>
        )}
      </div>
    </div>
  );
}

function PartCard({ part }: { part: AffiliatePart }) {
  const { afiliado } = part;
  const location = [afiliado.ciudad, afiliado.provincia].filter(Boolean).join(', ');
  return (
    <li className="card part-card">
      <div className="card-body">
        <header className="part-card-header">
          <h2>{part.tipo_label}</h2>
          <StatusBadge label={part.estado_label} tone={partStatusTone(part.estado)} />
        </header>
        {part.descripcion && <p>{part.descripcion}</p>}
        <dl className="detail-list">
          <dt>Estado</dt>
          <dd>{part.condicion_label}</dd>
          <dt>Garantía</dt>
          <dd>{part.garantia ? 'Sí' : 'No'}</dd>
          {part.precio && (
            <>
              <dt>Precio</dt>
              <dd>
                <strong>{formatMoney(part.precio)}</strong>
              </dd>
            </>
          )}
          <dt>Afiliado</dt>
          <dd>{fullName(afiliado)}</dd>
          <dt>Dirección</dt>
          <dd>
            {afiliado.direccion ?? 'Por confirmar'}
            {location && <span className="d-block muted">{location}</span>}
          </dd>
          {afiliado.celular && (
            <>
              <dt>Contacto</dt>
              <dd>
                <a href={`tel:${afiliado.celular}`}>{afiliado.celular}</a>
              </dd>
            </>
          )}
        </dl>
        <p className="field-hint">Publicado el {formatDate(part.created_at)}</p>
      </div>
    </li>
  );
}
