import { useState } from 'react';

/** Every table of Promoción shows 10 rows per page. */
export const PAGE_SIZE = 10;

/** Client-side paging of a list already loaded; the page is clamped when the list shrinks. */
export function usePagedRows<T>(items: T[], size = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pages = Math.ceil(items.length / size);
  const current = Math.min(page, Math.max(pages, 1));
  return {
    rows: items.slice((current - 1) * size, current * size),
    page: current,
    pages,
    total: items.length,
    setPage,
  };
}
