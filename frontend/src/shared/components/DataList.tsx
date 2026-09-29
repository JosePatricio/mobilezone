import type { ReactNode } from 'react';
import type { Page } from '@/shared/types/api';
import { Pagination } from './Pagination';
import { EmptyState, ErrorState, Loading } from './States';
import { Table, type Column } from './Table';

interface DataListProps<T> {
  query: { data?: Page<T>; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  onPageChange: (page: number) => void;
  onRowClick?: (row: T) => void;
  emptyMessage?: ReactNode;
}

/** Table + loading / error / empty states + backend pagination. */
export function DataList<T>({ query, columns, rowKey, onPageChange, onRowClick, emptyMessage }: DataListProps<T>) {
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const page = query.data;
  if (!page || page.items.length === 0) return <EmptyState>{emptyMessage}</EmptyState>;
  return (
    <>
      <Table columns={columns} rows={page.items} rowKey={rowKey} onRowClick={onRowClick} />
      <Pagination page={page.page} pages={page.pages} total={page.total} onChange={onPageChange} />
    </>
  );
}
