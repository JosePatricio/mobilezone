import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, Table, type Column } from '@/shared/components';
import { DASHBOARD_KEY, dashboardApi, type LowStockProduct } from '../services/dashboardApi';

const columns: Column<LowStockProduct>[] = [
  { key: 'sku', header: 'SKU', render: (r) => r.sku, sortValue: (r) => r.sku },
  { key: 'nombre', header: 'Producto', render: (r) => r.nombre, sortValue: (r) => r.nombre.toLowerCase() },
  { key: 'stock', header: 'Stock', align: 'right', render: (r) => r.stock, sortValue: (r) => r.stock },
  {
    key: 'minimo',
    header: 'Mínimo recomendado',
    align: 'right',
    render: (r) => r.minimo_recomendado,
    sortValue: (r) => r.minimo_recomendado,
  },
  {
    key: 'faltante',
    header: 'Faltan',
    align: 'right',
    render: (r) => <strong className="text-danger">{r.faltante}</strong>,
    sortValue: (r) => r.faltante,
  },
];

/** Products whose total stock is below their "Mínimo recomendado"; hidden while there are none. */
export function LowStockAlert() {
  const query = useQuery({ queryKey: [DASHBOARD_KEY, 'low-stock'], queryFn: dashboardApi.lowStock });
  if (!query.data?.length) return null;
  return (
    <Card
      title={`⚠ Productos bajo el mínimo recomendado (${query.data.length})`}
      actions={<Link to="/products">Ver productos</Link>}
    >
      <Table columns={columns} rows={query.data} rowKey={(r) => r.id} caption="Productos bajo el mínimo recomendado" />
    </Card>
  );
}
