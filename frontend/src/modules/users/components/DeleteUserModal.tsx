import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, ErrorState, Loading, Modal, SearchInput, Select } from '@/shared/components';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { getErrorMessage } from '@/shared/services/apiError';
import { formatDate, formatDateTime, formatOrderNumber, fullName } from '@/shared/utils/format';
import { formatMoney } from '@/shared/utils/money';
import { USERS_KEY, userApi } from '../services/userApi';
import { SYSTEM_ROLES, type User } from '../types';

interface Props {
  user: User;
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * Confirms the deletion of a user. When it has sales or work orders, they are listed and
 * another user must be chosen to receive them (a client's records go to another client).
 */
export function DeleteUserModal({ user, onClose, onDeleted }: Props) {
  const usage = useQuery({ queryKey: [USERS_KEY, 'usage', user.id], queryFn: () => userApi.usage(user.id) });
  const isClient = user.role.nombre === SYSTEM_ROLES.CLIENTE;
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);
  const candidates = useQuery({
    queryKey: [USERS_KEY, 'reassign', debounced],
    queryFn: () => userApi.list({ estado: true, size: 100, search: debounced.trim() }),
    enabled: Boolean(usage.data?.has_records),
  });
  const options = (candidates.data?.items ?? [])
    .filter((u) => u.id !== user.id && (u.role.nombre === SYSTEM_ROLES.CLIENTE) === isClient)
    .map((u) => ({ value: u.id, label: `${fullName(u)} · ${u.role.nombre}` }));
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const data = usage.data;
  const needsTarget = Boolean(data?.has_records);

  const confirm = async () => {
    setError(null);
    setDeleting(true);
    try {
      await userApi.deleteUser(user.id, needsTarget ? Number(target) : undefined);
      onDeleted();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      role="alertdialog"
      title="Eliminar usuario"
      onClose={onClose}
      dismissible={!deleting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => void confirm()}
            loading={deleting}
            disabled={!data || (needsTarget && !target)}
          >
            Eliminar usuario
          </Button>
        </>
      }
    >
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {usage.isLoading ? (
        <Loading />
      ) : usage.isError || !data ? (
        <ErrorState error={usage.error} onRetry={() => usage.refetch()} />
      ) : !data.has_records ? (
        <p>
          ¿Eliminar a <strong>{fullName(user)}</strong>? Esta acción no se puede deshacer.
        </p>
      ) : (
        <>
          <div className="alert alert-warning" role="status">
            <strong>{fullName(user)}</strong> tiene {data.ventas_total} {data.ventas_total === 1 ? 'venta' : 'ventas'} y{' '}
            {data.ordenes_total} {data.ordenes_total === 1 ? 'orden' : 'órdenes'}. Para no perder el historial, se pasarán
            al usuario que elija y luego se eliminará el usuario.
          </div>

          {data.ventas.length > 0 && (
            <>
              <h3 className="section-title">Ventas</h3>
              <div className="table-wrapper">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>N.º</th>
                      <th>Fecha</th>
                      <th>Como</th>
                      <th>Estado</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ventas.map((v) => (
                      <tr key={v.id}>
                        <td>#{v.id}</td>
                        <td>{formatDateTime(v.fecha)}</td>
                        <td>{v.rol}</td>
                        <td>{v.estado === 'CONFIRMADA' ? 'Confirmada' : 'Anulada'}</td>
                        <td className="text-right">{formatMoney(v.total_pagar)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.ventas_total > data.ventas.length && (
                <p className="field-hint">y {data.ventas_total - data.ventas.length} ventas más.</p>
              )}
            </>
          )}

          {data.ordenes.length > 0 && (
            <>
              <h3 className="section-title">Órdenes de trabajo</h3>
              <div className="table-wrapper">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>N.º Orden</th>
                      <th>Fecha</th>
                      <th>Como</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ordenes.map((o) => (
                      <tr key={o.id}>
                        <td>{formatOrderNumber(o.num_orden)}</td>
                        <td>{formatDate(o.fecha)}</td>
                        <td>{o.rol}</td>
                        <td>{o.estado_label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.ordenes_total > data.ordenes.length && (
                <p className="field-hint">y {data.ordenes_total - data.ordenes.length} órdenes más.</p>
              )}
            </>
          )}

          <h3 className="section-title">{isClient ? 'Pasar sus registros al cliente' : 'Pasar sus registros al usuario'}</h3>
          <div className="toolbar">
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, email o cédula…" />
            <Select
              aria-label="Usuario que recibe las ventas y órdenes"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              options={options}
              placeholder={candidates.isLoading ? 'Cargando…' : 'Seleccione…'}
            />
          </div>
        </>
      )}
    </Modal>
  );
}
