import { useId, useState } from 'react';
import type { Client } from '@/modules/clients/types';
import { Avatar, Button, Modal, SearchIcon } from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import { cleanIdentificacion, isValidIdentificacion } from '@/shared/utils/identification';
import { saleApi } from '../services/saleApi';
import type { SaleCustomer } from '../types';

interface Props {
  onClose: () => void;
  onSelect: (customer: SaleCustomer) => void;
}

/** Search a client by cédula / RUC (Enter), show its data and select it for the sale. */
export function CustomerLookupModal({ onClose, onSelect }: Props) {
  const inputId = useId();
  const [identificacion, setIdentificacion] = useState('');
  const [found, setFound] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    const value = cleanIdentificacion(identificacion);
    setFound(null);
    setError(null);
    if (!isValidIdentificacion(value)) {
      setError('Ingrese una cédula (10 dígitos) o un RUC (13 dígitos).');
      return;
    }
    setLoading(true);
    try {
      setFound(await saleApi.lookupCustomer(value));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const select = () => {
    if (!found) return;
    onSelect({ id: found.id, nombre: found.nombre, apellido: found.apellido, identificacion: found.identificacion });
  };

  return (
    <Modal
      open
      title="Buscar cliente"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={select} disabled={!found}>
            Seleccionar
          </Button>
        </>
      }
    >
      <form
        className="lookup-form"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void search();
        }}
      >
        <label className="field-label" htmlFor={inputId}>
          Cédula o RUC
        </label>
        <div className="input-group">
          <input
            id={inputId}
            className="input"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            maxLength={15}
            placeholder="Escriba la cédula o RUC y presione Enter"
            value={identificacion}
            onChange={(e) => setIdentificacion(e.target.value)}
          />
          <Button type="submit" variant="secondary" loading={loading} aria-label="Buscar" icon={<SearchIcon />} />
        </div>
      </form>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {found && (
        <div className="customer-card" aria-live="polite">
          <Avatar src={found.foto_url} alt={`${found.nombre} ${found.apellido}`} size="lg" />
          <dl className="detail-list">
            <dt>Nombre</dt>
            <dd>
              <strong>
                {found.nombre} {found.apellido}
              </strong>
            </dd>
            <dt>Cédula / RUC</dt>
            <dd>{found.identificacion}</dd>
            <dt>Email</dt>
            <dd>{found.email}</dd>
            <dt>Celular</dt>
            <dd>{found.celular ?? '—'}</dd>
            <dt>Ciudad</dt>
            <dd>{found.ciudad ?? '—'}</dd>
          </dl>
        </div>
      )}
    </Modal>
  );
}
