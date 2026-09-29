import { useMemo, useState, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Enables client-side sorting of the current page. */
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  caption?: string;
}

export function Table<T>({ columns, rows, rowKey, onRowClick, caption }: TableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const sorted = useMemo(() => {
    const column = sort && columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;
    const factor = sort!.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = column.sortValue!(a);
      const vb = column.sortValue!(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * factor;
    });
  }, [rows, sort, columns]);

  const toggleSort = (key: string) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <div className="table-wrapper">
      <table className="table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`${c.align ? `text-${c.align}` : ''} ${c.className ?? ''}`}
                aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
              >
                {c.sortValue ? (
                  <button type="button" className="th-sort" onClick={() => toggleSort(c.key)}>
                    {c.header}
                    <span aria-hidden>{sort?.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ' ↕'}</span>
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? 'clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  data-label={c.header}
                  className={`${c.align ? `text-${c.align}` : ''} ${c.className ?? ''}`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
