import type { UseMutationResult } from '@tanstack/react-query';
import { useConfirm, useToast } from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import type { Id } from '@/shared/types/api';

/** Activate / deactivate with confirmation for critical (deactivation) actions. */
export function useStatusToggle<T>(
  mutation: UseMutationResult<T, unknown, { id: Id; estado: boolean }>,
  entityLabel: string,
) {
  const confirm = useConfirm();
  const toast = useToast();

  return async (id: Id, currentEstado: boolean, name?: string) => {
    const estado = !currentEstado;
    const target = name ? ` "${name}"` : '';
    const ok = await confirm({
      title: estado ? `Activar ${entityLabel}` : `Desactivar ${entityLabel}`,
      message: `¿Está seguro de que desea ${estado ? 'activar' : 'desactivar'} ${entityLabel}${target}?`,
      confirmLabel: estado ? 'Activar' : 'Desactivar',
      danger: !estado,
    });
    if (!ok) return;
    try {
      await mutation.mutateAsync({ id, estado });
      toast.success(estado ? 'Registro activado.' : 'Registro desactivado.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };
}
