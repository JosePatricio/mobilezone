interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pages, total, onChange }: PaginationProps) {
  if (total === 0) return null;
  return (
    <nav className="pagination" aria-label="Paginación">
      <span className="muted">
        {total} registro{total === 1 ? '' : 's'} · Página {page} de {Math.max(pages, 1)}
      </span>
      <div className="pagination-buttons">
        <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          ‹ Anterior
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Siguiente ›
        </button>
      </div>
    </nav>
  );
}
