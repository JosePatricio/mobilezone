import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/store/AuthProvider';
import { useBranchOptions } from '@/modules/branches/services/branchApi';
import { PaymentDialog, type PaymentResult } from '@/modules/sales/components/PaymentDialog';
import { SALES_KEY } from '@/modules/sales/services/saleApi';
import { Button, Input, Modal, MoneyInput, Select, StatusBadge, Textarea, useToast } from '@/shared/components';
import { Combobox } from '@/shared/components/Combobox';
import { getErrorMessage } from '@/shared/services/apiError';
import type { NamedRef } from '@/shared/types/api';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { formatOrderNumber, fromDateTimeLocal, toDateTimeLocal } from '@/shared/utils/format';
import { formatMoney, fromCents, isValidMoney, toCents } from '@/shared/utils/money';
import { statusTone, useWorkOrderStatuses } from '../hooks/useWorkOrderStatuses';
import { WORK_ORDERS_KEY, workOrderApi } from '../services/workOrderApi';
import { WORK_ORDER_STATUS, type WorkOrderListItem } from '../types';

type Order = Pick<
  WorkOrderListItem,
  | 'id'
  | 'num_orden'
  | 'estado'
  | 'estado_label'
  | 'presupuesto'
  | 'anticipo'
  | 'saldo'
  | 'fecha_entrega'
  | 'supplier_id'
  | 'supplier'
>;

interface Props {
  order: Order;
  /** Without permission (or once finalized) only the status badge is shown. */
  canUpdate: boolean;
}

/**
 * Status selector of an order (Recibido / En proceso / Finalizado):
 * - En proceso asks for the approximate delivery time and a note.
 * - Finalizado asks for confirmation (the order is closed), the supplier, the spare part cost (optional)
 *   and the payment: it registers a sale whose profit is the repair cost minus the spare part cost.
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
  // Read from the database every time the dialog opens: suppliers added in another tab show up without reloading.
  const suppliers = useQuery({
    queryKey: [WORK_ORDERS_KEY, 'suppliers'],
    queryFn: workOrderApi.suppliers,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  // Preselected: the supplier chosen in the order form.
  const [supplierId, setSupplierId] = useState<number | null>(order.supplier_id ?? null);
  const supplierOptions = (suppliers.data ?? []).map((s) => ({ value: s.id, label: s.nombre }));
  if (order.supplier && !supplierOptions.some((o) => o.value === order.supplier?.id)) {
    supplierOptions.push({ value: order.supplier.id, label: order.supplier.nombre }); // kept even if inactive
  }
  const [supplierError, setSupplierError] = useState<string | null>(null);
  // Optional: the profit of the sale is the repair cost minus the spare part cost.
  const [costo, setCosto] = useState('');
  const [costoError, setCostoError] = useState<string | null>(null);
  const costoValid = costo.trim() !== '' && isValidMoney(costo);
  const costoRepuesto = costoValid ? fromCents(toCents(costo)) : null;
  const [error, setError] = useState<string | null>(null);
  const finalize = useMutation({
    mutationFn: (payment: PaymentResult) =>
      workOrderApi.finalize(order.id, {
        ...payment,
        branch_id: selectedBranch as number,
        supplier_id: supplierId,
        costo_repuesto: costoRepuesto,
      }),
  });

  const confirm = async (payment: PaymentResult) => {
    setError(null);
    const badCosto = costo.trim() !== '' && !costoValid;
    if (badCosto) setCostoError('Ingrese un valor válido, por ejemplo 12.50.');
    if (supplierId === null) setSupplierError('Seleccione el proveedor.');
    if (badCosto || supplierId === null) return;
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
      confirmDisabled={selectedBranch === null || suppliers.isPending || (suppliers.isSuccess && supplierOptions.length === 0)}
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
          {suppliers.isError ? (
            <div className="alert alert-error" role="alert">
              {getErrorMessage(suppliers.error)}
            </div>
          ) : suppliers.isSuccess && supplierOptions.length === 0 ? (
            <div className="alert alert-error" role="alert">
              No hay proveedores activos. Agréguelos en Proveedores.
            </div>
          ) : (
            <Combobox
              label="Proveedor"
              required
              placeholder={suppliers.isPending ? 'Cargando…' : 'Seleccione el proveedor…'}
              disabled={suppliers.isPending}
              options={supplierOptions}
              value={supplierId}
              onChange={(value) => {
                setSupplierId(Number(value));
                setSupplierError(null);
              }}
              error={supplierError ?? undefined}
            />
          )}
          <MoneyInput
            label="Costo de repuesto $"
            hint={
              costoRepuesto !== null
                ? `Ganancia de la venta: ${formatMoney((toCents(order.presupuesto) - toCents(costoRepuesto)) / 100)}`
                : 'Opcional. La ganancia de la venta será el costo de reparación menos este valor.'
            }
            value={costo}
            onChange={(e) => {
              setCosto(e.target.value);
              setCostoError(null);
            }}
            error={costoError ?? undefined}
          />
        </>
      }
    >
      Venta por el costo de reparación {formatMoney(order.presupuesto)}
      {Number(order.anticipo) > 0 && <> (anticipo {formatMoney(order.anticipo)} ya pagado)</>}.
    </PaymentDialog>
  );
}
