import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Modal, MoneyInput, Select, useToast } from '@/shared/components';
import { getErrorMessage, toApiError } from '@/shared/services/apiError';
import { formatMoney, isValidMoney, normalizeMoney } from '@/shared/utils/money';
import { CASH_OPENING_KEY, useSellableBranches, useTodayCashOpening } from '../hooks/useCashOpening';
import { saleApi } from '../services/saleApi';
import type { CashOpeningRequest } from '../types';

// Stable: Modal refocuses its panel whenever onClose changes. The modal cannot be closed.
const keepOpen = () => undefined;
/** Name of the main branch, preselected in the modal. */
const DEFAULT_BRANCH = 'matriz';

/**
 * Apertura de caja: the first time each day a seller enters Ventas, asks in which branch they
 * are and how much cash (USD) they have in the register to give change. It cannot be skipped.
 */
export function CashOpeningModal() {
  const opening = useTodayCashOpening();
  const pending = opening.data === null;
  const branches = useSellableBranches(pending);
  const [branchId, setBranchId] = useState('');
  const [monto, setMonto] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  // Default branch: Matriz (or the only one the user has).
  useEffect(() => {
    if (branchId !== '') return;
    const preferred = branches.find((b) => b.nombre.trim().toLowerCase() === DEFAULT_BRANCH) ?? (branches.length === 1 ? branches[0] : undefined);
    if (preferred) setBranchId(String(preferred.id));
  }, [branchId, branches]);

  const mutation = useMutation({
    mutationFn: (body: CashOpeningRequest) => saleApi.openCash(body),
    onSuccess: (saved) => {
      queryClient.setQueryData(CASH_OPENING_KEY, saved);
      toast.success(`Caja abierta en ${saved.branch.nombre} con ${formatMoney(saved.monto_inicial)}.`);
    },
    onError: (err) => {
      // Opened meanwhile in another tab: load that opening (the modal closes).
      if (toApiError(err).code === 'CASH_ALREADY_OPENED') void queryClient.invalidateQueries({ queryKey: CASH_OPENING_KEY });
      else setError(getErrorMessage(err));
    },
  });

  // Without branches the sale screen already explains that one must be assigned.
  if (!pending || branches.length === 0) return null;

  const branchError = submitted && branchId === '' ? 'Seleccione la sucursal.' : undefined;
  const montoError =
    submitted && !isValidMoney(monto) ? 'Ingrese el efectivo en caja (0 si no tiene), máximo 2 decimales.' : undefined;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    if (branchId === '' || !isValidMoney(monto)) return;
    mutation.mutate({ branch_id: Number(branchId), monto_inicial: normalizeMoney(monto) });
  };

  return (
    <Modal
      open
      size="sm"
      title="Apertura de caja"
      onClose={keepOpen}
      dismissible={false}
      footer={
        <Button type="submit" form="cash-opening-form" loading={mutation.isPending}>
          Abrir caja
        </Button>
      }
    >
      <form id="cash-opening-form" onSubmit={onSubmit} noValidate className="form-grid">
        {error && (
          <div className="alert alert-error full" role="alert">
            {error}
          </div>
        )}
        <Select
          label="¿En qué sucursal estás?"
          required
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          options={branches.map((b) => ({ value: b.id, label: b.nombre }))}
          placeholder="Seleccione la sucursal"
          error={branchError}
          className="full"
        />
        <MoneyInput
          label="¿Cuánto tienes en caja? (USD)"
          required
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          hint="Efectivo para dar vuelto o cambio durante el día."
          error={montoError}
          className="full"
        />
      </form>
    </Modal>
  );
}
