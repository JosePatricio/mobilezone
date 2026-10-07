import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/app/store/AuthProvider';
import {
  Button,
  Checkbox,
  DataList,
  ImageField,
  MoneyInput,
  Modal,
  NO_IMAGE_CHANGE,
  PageHeader,
  ProductThumb,
  SearchInput,
  Select,
  StatusBadge,
  Textarea,
  useConfirm,
  useToast,
  type Column,
  type ImageSelection,
} from '@/shared/components';
import { useListParams } from '@/shared/hooks/useListParams';
import { getErrorMessage } from '@/shared/services/apiError';
import { applyImageSelection } from '@/shared/services/uploads';
import type { Id } from '@/shared/types/api';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { formatDate, fullName } from '@/shared/utils/format';
import { formatMoney, isValidMoney, normalizeMoney } from '@/shared/utils/money';
import { type FormShape, applyServerErrors, zOptionalText, zodForm } from '@/shared/utils/validation';
import { partStatusTone, useAffiliatePartCatalogs, yesNo } from '../hooks/useAffiliatePartCatalogs';
import { PUBLIC_CATALOG_PATH, publicPartPath } from '../paths';
import { AFFILIATE_PARTS_KEY, affiliatePartApi } from '../services/affiliatePartApi';
import type { AffiliatePart, AffiliatePartRequest, AffiliatePartStatus, AffiliatePartType, PartCondition } from '../types';

const publicPartUrl = (id: Id) => `${window.location.origin}${publicPartPath(id)}`;

const schema = z.object({
  tipo: z.string().min(1, 'Seleccione el tipo de repuesto'),
  condicion: z.string().min(1, 'Seleccione el estado'),
  garantia: z.boolean(),
  estado: z.string().min(1, 'Seleccione la disponibilidad'),
  descripcion: zOptionalText(500),
  precio: z
    .string()
    .trim()
    .refine((v) => !v || isValidMoney(v), 'Monto inválido (use hasta 2 decimales)')
    .transform((v) => (v ? normalizeMoney(v) : null)),
});
type FormInput = FormShape<typeof schema>;
type FormOutput = z.output<typeof schema>;

/** Module of the affiliates (role TECNICO): they publish and see the spare parts they upload. */
export function AffiliatePartsPage() {
  const { user, hasPermission } = useAuth();
  const managesAll = hasPermission(P.AFFILIATE_PARTS_ANY);
  const catalogs = useAffiliatePartCatalogs();
  const list = useListParams<{ tipo: string; condicion: string; estado: string }>({
    tipo: '',
    condicion: '',
    estado: '',
  });
  const query = useQuery({
    queryKey: [AFFILIATE_PARTS_KEY, 'list', list.params],
    queryFn: () => affiliatePartApi.list(list.params),
    placeholderData: keepPreviousData,
  });
  // The visit counter and the public catalog link are only for the administrator.
  const visits = useQuery({
    queryKey: [AFFILIATE_PARTS_KEY, 'visits'],
    queryFn: affiliatePartApi.visits,
    enabled: managesAll,
  });
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [AFFILIATE_PARTS_KEY] });
  const save = useMutation({
    mutationFn: ({ id, body }: { id?: Id; body: AffiliatePartRequest }) =>
      id ? affiliatePartApi.update(id, body) : affiliatePartApi.create(body),
    onSuccess: invalidate,
  });
  const setStatus = useMutation({
    mutationFn: ({ id, estado }: { id: Id; estado: AffiliatePartStatus }) => affiliatePartApi.setStatus(id, estado),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: affiliatePartApi.remove, onSuccess: invalidate });
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState<AffiliatePart | null | undefined>(undefined);

  const toggleSold = async (part: AffiliatePart) => {
    const estado: AffiliatePartStatus = part.estado === 'DISPONIBLE' ? 'VENDIDO' : 'DISPONIBLE';
    try {
      await setStatus.mutateAsync({ id: part.id, estado });
      toast.success(estado === 'VENDIDO' ? 'Repuesto marcado como vendido.' : 'Repuesto disponible otra vez.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const copyLink = async (part: AffiliatePart) => {
    try {
      await navigator.clipboard.writeText(publicPartUrl(part.id));
      toast.success('Enlace copiado.');
    } catch {
      toast.error(`No se pudo copiar. Enlace: ${publicPartUrl(part.id)}`);
    }
  };

  const onDelete = async (part: AffiliatePart) => {
    const ok = await confirm({
      title: 'Eliminar repuesto',
      message: `¿Está seguro de que desea eliminar "${part.tipo_label}"?`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(part.id);
      toast.success('Repuesto eliminado.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const columns: Column<AffiliatePart>[] = [
    {
      key: 'tipo',
      header: 'Tipo',
      render: (r) => (
        <div className="cell-with-image">
          <ProductThumb src={r.imagen_url} alt={r.tipo_label} size="sm" />
          <span>{r.tipo_label}</span>
        </div>
      ),
      sortValue: (r) => r.tipo_label,
    },
    { key: 'descripcion', header: 'Descripción', render: (r) => r.descripcion ?? '—' },
    { key: 'condicion', header: 'Estado', render: (r) => r.condicion_label },
    { key: 'garantia', header: 'Garantía', render: (r) => yesNo(r.garantia) },
    { key: 'precio', header: 'Precio', align: 'right', render: (r) => (r.precio ? formatMoney(r.precio) : '—') },
    {
      key: 'disponibilidad',
      header: 'Disponibilidad',
      render: (r) => <StatusBadge label={r.estado_label} tone={partStatusTone(r.estado)} />,
    },
    ...(managesAll
      ? [{ key: 'afiliado', header: 'Afiliado', render: (r: AffiliatePart) => fullName(r.afiliado) }]
      : []),
    { key: 'fecha', header: 'Publicado', render: (r) => formatDate(r.created_at), sortValue: (r) => r.created_at },
    {
      key: 'detalle',
      header: 'Detalle público',
      render: (r) => (
        <div className="row-actions">
          <a className="btn btn-ghost btn-sm" href={publicPartPath(r.id)} target="_blank" rel="noreferrer">
            Ver
          </a>
          <Button size="sm" variant="ghost" onClick={() => void copyLink(r)}>
            Copiar enlace
          </Button>
        </div>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      render: (r) => (
        <div className="row-actions">
          <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
            Editar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void toggleSold(r)}>
            {r.estado === 'DISPONIBLE' ? 'Marcar vendido' : 'Marcar disponible'}
          </Button>
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => void onDelete(r)}>
            Eliminar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={managesAll ? 'Repuestos de afiliados' : 'Mis repuestos'}
        actions={
          <>
            {managesAll && (
              <a className="btn btn-secondary btn-md" href={PUBLIC_CATALOG_PATH} target="_blank" rel="noreferrer">
                Ver catálogo público
              </a>
            )}
            <Button onClick={() => setEditing(null)}>Nuevo repuesto</Button>
          </>
        }
      >
        Los repuestos que publica son públicos: todos pueden verlos en el catálogo.
      </PageHeader>

      <div className="stat-grid">
        {managesAll && (
          <div className="stat-card stat-info">
            <span className="stat-label">Visitas al catálogo público</span>
            <span className="stat-value">{visits.data ?? '—'}</span>
          </div>
        )}
        <div className="stat-card stat-success">
          <span className="stat-label">Dirección publicada</span>
          <span>{user?.direccion ?? 'Sin dirección: pida al administrador que la registre en su usuario.'}</span>
        </div>
      </div>

      <div className="toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Buscar por descripción…" />
        <Select
          aria-label="Filtrar por tipo"
          value={list.filters.tipo}
          onChange={(e) => list.setFilter('tipo', e.target.value)}
          options={catalogs.tipos}
          placeholder="Todos los tipos"
        />
        <Select
          aria-label="Filtrar por estado"
          value={list.filters.condicion}
          onChange={(e) => list.setFilter('condicion', e.target.value)}
          options={catalogs.condiciones}
          placeholder="Nuevo y usado"
        />
        <Select
          aria-label="Filtrar por disponibilidad"
          value={list.filters.estado}
          onChange={(e) => list.setFilter('estado', e.target.value)}
          options={catalogs.estados}
          placeholder="Disponibles y vendidos"
        />
      </div>
      <DataList
        query={query}
        columns={columns}
        rowKey={(r) => r.id}
        onPageChange={list.setPage}
        emptyMessage="Aún no ha publicado repuestos."
      />

      {editing !== undefined && (
        <AffiliatePartFormModal
          part={editing}
          onClose={() => setEditing(undefined)}
          onSubmit={async (body, image) => {
            const saved = await save.mutateAsync({ id: editing?.id, body });
            await applyImageSelection(
              image,
              (file) => affiliatePartApi.uploadImage(saved.id, file),
              () => affiliatePartApi.removeImage(saved.id),
            );
            await invalidate();
            toast.success(editing ? 'Cambios guardados.' : 'Repuesto publicado.');
            setEditing(undefined);
          }}
        />
      )}
    </>
  );
}

function AffiliatePartFormModal({
  part,
  onClose,
  onSubmit,
}: {
  part: AffiliatePart | null;
  onClose: () => void;
  onSubmit: (body: AffiliatePartRequest, image: ImageSelection) => Promise<void>;
}) {
  const catalogs = useAffiliatePartCatalogs();
  const [image, setImage] = useState<ImageSelection>(NO_IMAGE_CHANGE);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodForm(schema),
    defaultValues: {
      tipo: part?.tipo ?? '',
      condicion: part?.condicion ?? 'NUEVO',
      garantia: part?.garantia ?? false,
      estado: part?.estado ?? 'DISPONIBLE',
      descripcion: part?.descripcion ?? '',
      precio: part?.precio ?? '',
    },
  });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await onSubmit(
        {
          ...values,
          tipo: values.tipo as AffiliatePartType,
          condicion: values.condicion as PartCondition,
          estado: values.estado as AffiliatePartStatus,
        },
        image,
      );
    } catch (err) {
      if (!applyServerErrors(err, setError)) setServerError(getErrorMessage(err));
    }
  });

  return (
    <Modal
      open
      title={part ? 'Editar repuesto' : 'Nuevo repuesto'}
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="affiliate-part-form" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="affiliate-part-form" onSubmit={submit} noValidate className="form-grid">
        {serverError && (
          <div className="alert alert-error full" role="alert">
            {serverError}
          </div>
        )}
        <div className="full">
          <ImageField label="Imagen" variant="product" currentUrl={part?.imagen_url} value={image} onChange={setImage} />
        </div>
        <Select
          label="Tipo de repuesto"
          required
          options={catalogs.tipos}
          placeholder="Seleccione…"
          error={errors.tipo?.message}
          {...register('tipo')}
        />
        <Select label="Estado" required options={catalogs.condiciones} error={errors.condicion?.message} {...register('condicion')} />
        <Select
          label="Disponibilidad"
          required
          options={catalogs.estados}
          error={errors.estado?.message}
          {...register('estado')}
        />
        <MoneyInput label="Precio" hint="Opcional" error={errors.precio?.message} {...register('precio')} />
        <Textarea
          label="Descripción"
          className="full"
          placeholder="Ej.: modelo de teléfono compatible"
          error={errors.descripcion?.message}
          {...register('descripcion')}
        />
        <Checkbox label="Garantía" toggle {...register('garantia')} />
      </form>
    </Modal>
  );
}
