import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Button, Card, Input, Modal, PageHeader, useToast } from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import { settingsApi } from '../services/settingsApi';

/** Word the administrator types to confirm (checked again by the backend). */
export const RESET_CONFIRMATION = 'VACIAR';

const DELETED = 'Órdenes de trabajo, ventas, productos, inventario y movimientos de stock, categorías, marcas, modelos, repuestos y clientes.';
const KEPT = 'Usuarios del sistema, roles, permisos y sucursales.';

export function SettingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmacion, setConfirmacion] = useState('');
  const [resetting, setResetting] = useState(false);
  const confirmed = confirmacion.trim().toUpperCase() === RESET_CONFIRMATION;

  // Stable: the modal refocuses itself whenever onClose changes, which would interrupt typing.
  const close = useCallback(() => {
    setOpen(false);
    setConfirmacion('');
  }, []);

  const reset = async () => {
    setResetting(true);
    try {
      const { eliminados } = await settingsApi.resetData(confirmacion);
      const total = Object.values(eliminados).reduce((sum, n) => sum + n, 0);
      await queryClient.invalidateQueries();
      toast.success(`Datos vaciados: ${total} registros eliminados.`);
      close();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <PageHeader title="Configuración">Opciones generales del sistema.</PageHeader>
      <Card title="Vaciar datos">
        <p>
          Elimina <strong>todos</strong> los datos del negocio para empezar de cero. Esta acción no se puede deshacer.
        </p>
        <p>
          <strong>Se eliminan:</strong> {DELETED}
        </p>
        <p>
          <strong>Se conservan:</strong> {KEPT}
        </p>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Vaciar todos los datos
        </Button>
      </Card>

      <Modal
        open={open}
        title="¿Vaciar todos los datos?"
        role="alertdialog"
        onClose={close}
        dismissible={!resetting}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={resetting}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void reset()} disabled={!confirmed} loading={resetting}>
              Vaciar datos
            </Button>
          </>
        }
      >
        <div className="alert alert-error" role="alert">
          Se eliminarán definitivamente: {DELETED}
        </div>
        <Input
          label={`Escriba ${RESET_CONFIRMATION} para confirmar`}
          value={confirmacion}
          autoComplete="off"
          onChange={(e) => setConfirmacion(e.target.value)}
        />
      </Modal>
    </>
  );
}
