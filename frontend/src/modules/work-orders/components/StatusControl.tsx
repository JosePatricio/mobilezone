import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/store/AuthProvider';
import { useBranchOptions } from '@/modules/branches/services/branchApi';
import { PaymentDialog, type PaymentResult } from '@/modules/sales/components/PaymentDialog';
import { SALES_KEY } from '@/modules/sales/services/saleApi';
import { Button, Input, Modal, Select, StatusBadge, Textarea, useToast } from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import type { NamedRef } from '@/shared/types/api';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { formatOrderNumber, fromDateTimeLocal, toDateTimeLocal } from '@/shared/utils/format';
import { formatMoney } from '@/shared/utils/money';
import { statusTone, useWorkOrderStatuses } from '../hooks/useWorkOrderStatuses';
import { WORK_ORDERS_KEY, workOrderApi } from '../services/workOrderApi';
import { WORK_ORDER_STATUS, type WorkOrderListItem } from '../types';

type Order = Pick<
  WorkOrderListItem,
  'id' | 'num_orden' | 'estado' | 'estado_label' | 'presupuesto' | 'anticipo' | 'saldo' | 'fecha_entrega'
>;

interface Props {
  order: Order;
  /** Without permission (or once finalized) only the status badge is shown. */
  canUpdate: boolean;
}

/**
 * Status selector of an order (Recibido / En proceso / Finalizado):
 * - En proceso asks for the approximate delivery time and a note.
 * - Finalizado asks for confirmation (the order is closed) and the payment: it registers a sale.
 */
export function StatusControl({ order, canUpdate }: Props) {
  const { statuses } = useWorkOrderStatuses();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'process' | 'finalize' | null>(null);
  const finalized = order.estado === WORK_ORDER_STATUS.FINALIZADO;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] });
    void queryClient.invalidateQueries({ queryKey: [SALES_KEY] });
  };
  const setStatus = useMutation({
    mutationFn: (body: { estado: number; fecha_entrega?: string | null; observacion?: string | null }) =>
      workOrderApi.setStatus(order.id, body),
    onSuccess: refresh,
  });

  if (!canUpdate || finalized) {
    return <StatusBadge label={order.estado_label} tone={statusTone(order.estado)} />;
  }

  const onSelect = async (estado: number) => {
    if (estado === order.estado && estado !== WORK_ORDER_STATUS.EN_PROCESO) return;
    if (estado === WORK_ORDER_STATUS.EN_PROCESO) return setDialog('process');
    if (estado === WORK_ORDER_STATUS.FINALIZADO) return setDialog('finalize');
    try {
      await setStatus.mutateAsync({ estado });
      toast.success(`Orden #${formatOrderNumber(order.num_orden)}: ${statuses.find((s) => s.value === estado)?.label ?? ''}.`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <span className="status-control" onClick={(e) => e.stopPropagation()}>
      <select
        className={`input input-sm status-select status-${statusTone(order.estado)}`}
        aria-label={`Estado de la orden ${formatOrderNumber(order.num_orden)}`}
        value={order.estado}
        disabled={setStatus.isPending}
        onChange={(e) => void onSelect(Number(e.target.value))}
      >
        {statuses.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {dialog === 'process' && (
        <InProcessDialog
          order={order}
          onClose={() => setDialog(null)}
          onSubmit={async (values) => {
            await setStatus.mutateAsync({ estado: WORK_ORDER_STATUS.EN_PROCESO, ...values });
            toast.success(`Orden #${formatOrderNumber(order.num_orden)} en proceso.`);
            setDialog(null);
          }}
        />
      )}
      {dialog === 'finalize' && <FinalizeDialog order={order} onClose={() => setDialog(null)} onDone={refresh} />}
    </span>
  );
}

function InProcessDialog({
  order,
  onClose,
  onSubmit,
}: {
  order: Order;
  onClose: () => void;
  onSubmit: (values: { fecha_entrega: string; observacion: string | null }) => Promise<void>;
}) {
  const [entrega, setEntrega] = useState(toDateTimeLocal(order.fecha_entrega));
  const [observacion, setObservacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const fecha = fromDateTimeLocal(entrega);
    if (!fecha) return setError('Ingrese la hora aproximada de entrega.');
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ fecha_entrega: fecha, observacion: observacion.trim() || null });
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`Orden #${formatOrderNumber(order.num_orden)} · En proceso`}
      onClose={onClose}
      dismissible={!saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <Input
        label="Hora aproximada de entrega"
        type="datetime-local"
        required
        value={entrega}
        min={toDateTimeLocal(new Date().toISOString())}
        onChange={(e) => setEntrega(e.target.value)}
        error={error ?? undefined}
      />
      <Textarea
        label="Observación"
        rows={3}
        maxLength={1000}
        placeholder="Ej.: se cambia la pantalla, falta probar la cámara…"
        value={observacion}
        onChange={(e) => setObservacion(e.target.value)}
      />
    </Modal>
  );
}

function FinalizeDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const anyBranch = hasPermission(P.BRANCHES_ANY);
  const allBranches = useBranchOptions(anyBranch);
  const branches: NamedRef[] = anyBranch ? (allBranches.data ?? []) : (user?.branches ?? []);
  const [branchId, setBranchId] = useState<number | null>(null);
  const selectedBranch = branchId ?? branches[0]?.id ?? null;
  const [error, setError] = useState<string | null>(null);
  const finalize = useMutation({
    mutationFn: (payment: PaymentResult) =>
      workOrderApi.finalize(order.id, { ...payment, branch_id: selectedBranch as number }),
  });

  const confirm = async (payment: PaymentResult) => {
    setError(null);
    try {
      const saved = await finalize.mutateAsync(payment);
      onDone();
      onClose();
      toast.success(
        `Orden #${formatOrderNumber(order.num_orden)} finalizada. Venta #${saved.sale?.id ?? ''} registrada en Ventas.`,
      );
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <PaymentDialog
      total={order.saldo}
      title={`Finalizar orden #${formatOrderNumber(order.num_orden)}`}
      confirmLabel="Finalizar y registrar venta"
      totalLabel="Saldo a cobrar"
      loading={finalize.isPending}
      confirmDisabled={selectedBranch === null}
      onCancel={onClose}
      onConfirm={(payment) => void confirm(payment)}
      header={
        <>
          <div className="alert alert-warning" role="note">
            <strong>¿Finalizar la orden?</strong> Después ya no se podrá editar nada (datos, estado, repuestos ni
            fotos). Se registrará una venta por el costo de reparación.
          </div>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          {branches.length === 0 ? (
            <div className="alert alert-error" role="alert">
              No tiene sucursales asignadas para registrar la venta.
            </div>
          ) : (
            <Select
              label="Sucursal de la venta"
              value={selectedBranch ?? ''}
              onChange={(e) => setBranchId(Number(e.target.value))}
              options={branches.map((b) => ({ value: b.id, label: b.nombre }))}
              disabled={branches.length <= 1}
            />
          )}
        </>
      }
    >
      Venta por el costo de reparación {formatMoney(order.presupuesto)}
      {Number(order.anticipo) > 0 && <> (anticipo {formatMoney(order.anticipo)} ya pagado)</>}.
    </PaymentDialog>
  );
}
