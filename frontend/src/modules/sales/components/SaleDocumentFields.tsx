import { useId, useState } from 'react';
import { SearchIcon, UserIcon } from '@/shared/components';
import { customerLabel, type SaleCustomer } from '../types';
import { CustomerLookupModal } from './CustomerLookupModal';

interface Props {
  factura: boolean;
  onFacturaChange: (factura: boolean) => void;
  customer: SaleCustomer | null;
  onCustomerChange: (customer: SaleCustomer | null) => void;
}

/**
 * Comprobante / Factura switch, customer field with a search icon (lookup by cédula / RUC)
 * and a user icon that sets "Consumidor final".
 */
export function SaleDocumentFields({ factura, onFacturaChange, customer, onCustomerChange }: Props) {
  const switchId = useId();
  const customerId = useId();
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <div className="sale-document">
      <div className="field">
        <span className="field-label" id={`${switchId}-label`}>
          Tipo de documento
        </span>
        <div className="doc-switch">
          <span className={!factura ? 'active' : undefined}>Comprobante</span>
          <input
            id={switchId}
            type="checkbox"
            role="switch"
            className="switch"
            aria-labelledby={`${switchId}-label`}
            aria-checked={factura}
            checked={factura}
            onChange={(e) => onFacturaChange(e.target.checked)}
          />
          <span className={factura ? 'active' : undefined}>Factura</span>
        </div>
      </div>

      <div className="field sale-customer">
        <label className="field-label" htmlFor={customerId}>
          Cliente
        </label>
        <div className="input-group">
          <input
            id={customerId}
            className="input"
            readOnly
            value={customerLabel(customer)}
            title={customer?.identificacion ? `Cédula / RUC: ${customer.identificacion}` : undefined}
          />
          <button
            type="button"
            className="btn btn-secondary btn-md icon-button"
            aria-label="Buscar cliente por cédula o RUC"
            title="Buscar cliente por cédula o RUC"
            onClick={() => setLookupOpen(true)}
          >
            <SearchIcon />
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-md icon-button"
            aria-label="Consumidor final"
            title="Consumidor final"
            onClick={() => onCustomerChange(null)}
          >
            <UserIcon />
          </button>
        </div>
        {customer?.identificacion && <small className="muted">Cédula / RUC: {customer.identificacion}</small>}
      </div>

      {lookupOpen && (
        <CustomerLookupModal
          onClose={() => setLookupOpen(false)}
          onSelect={(selected) => {
            onCustomerChange(selected);
            setLookupOpen(false);
          }}
        />
      )}
    </div>
  );
}
