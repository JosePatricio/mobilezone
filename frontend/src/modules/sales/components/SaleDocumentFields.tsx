import { useId, useState } from 'react';
import { SearchIcon } from '@/shared/components';
import { customerLabel, type SaleCustomer } from '../types';
import { CustomerLookupModal } from './CustomerLookupModal';

interface Props {
  factura: boolean;
  onFacturaChange: (factura: boolean) => void;
  customer: SaleCustomer | null;
  onCustomerChange: (customer: SaleCustomer | null) => void;
}

/**
 * Comprobante / Factura switch and customer field. "Consumidor final" is the default;
 * the search icon finds (or registers) a client by cédula / RUC.
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
          <div className="input-with-clear">
            <input id={customerId} className="input" readOnly value={customerLabel(customer)} />
            {customer && (
              <button
                type="button"
                className="clear-button"
                aria-label="Quitar cliente (Consumidor final)"
                title="Quitar cliente (Consumidor final)"
                onClick={() => onCustomerChange(null)}
              >
                ×
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-md icon-button"
            aria-label="Buscar cliente por cédula o RUC"
            title="Buscar cliente por cédula o RUC"
            onClick={() => setLookupOpen(true)}
          >
            <SearchIcon />
          </button>
        </div>
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
