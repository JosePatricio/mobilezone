import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  EmptyState,
  ErrorState,
  Input,
  Loading,
  Modal,
  PageHeader,
  Pagination,
  StatusBadge,
  useConfirm,
  useToast,
} from '@/shared/components';
import { IMAGE_ACCEPT, MAX_IMAGE_BYTES } from '@/shared/components/Images';
import { getErrorMessage } from '@/shared/services/apiError';
import { formatDate, formatDateTime, todayIso } from '@/shared/utils/format';
import { RouletteWheel } from '../components/RouletteWheel';
import { ROULETTES_KEY, marketingApi } from '../services/marketingApi';
import type { Roulette, RouletteItemDraft } from '../types';
import { usePagedRows } from '../usePagedRows';

const MIN_ITEMS = 2;
const MAX_ITEMS = 24;

type Validity = { label: string; tone: 'success' | 'warning' | 'neutral' };

/** Vigente / Programada / Vencida, by the local day. */
export function validity(r: Pick<Roulette, 'fecha_inicio' | 'fecha_fin'>, today = todayIso()): Validity {
  if (r.fecha_fin < today) return { label: 'Vencida', tone: 'neutral' };
  if (r.fecha_inicio > today) return { label: 'Programada', tone: 'warning' };
  return { label: 'Vigente', tone: 'success' };
}

const emptyItem = (): RouletteItemDraft => ({ nombre: '', premio: true, file: null, url: null });

/** Propaganda › Ruleta: prize wheels whose links are sent in the WhatsApp campaigns. */
export function RoulettePage() {
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <>
      <PageHeader title="Ruleta" actions={<Button onClick={() => setCreating(true)}>Crear</Button>}>
        Ruletas de premios. Su enlace se envía en Campaña con «¿Incluir ruleta?»: cada cliente juega una sola vez.
      </PageHeader>
      <RouletteList onOpen={setOpenId} />
      {creating && <RouletteFormModal onClose={() => setCreating(false)} />}
      {openId !== null && <RouletteDetailModal id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function RouletteList({ onOpen }: { onOpen: (id: number) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ROULETTES_KEY, queryFn: marketingApi.roulettes });
  const roulettes = query.data ?? [];
  const paged = usePagedRows(roulettes);

  const remove = async (r: Roulette) => {
    const ok = await confirm({
      title: 'Eliminar ruleta',
      message: `¿Eliminar la ruleta «${r.nombre}»?`,
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await marketingApi.deleteRoulette(r.id);
      await queryClient.invalidateQueries({ queryKey: ROULETTES_KEY });
      toast.success('Ruleta eliminada.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (roulettes.length === 0) {
    return (
      <Card>
        <EmptyState title="Sin ruletas">Use «Crear» para armar la primera ruleta de premios.</EmptyState>
      </Card>
    );
  }

  return (
    <Card title="Ruletas">
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Vigencia</th>
              <th>Estado</th>
              <th className="text-right">Opciones</th>
              <th className="text-right">Enviados</th>
              <th className="text-right">Abiertos</th>
              <th className="text-right">Jugados</th>
              <th className="text-right">Ganadores</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((r) => {
              const v = validity(r);
              return (
                <tr key={r.id}>
                  <td>{r.nombre}</td>
                  <td>
                    {formatDate(r.fecha_inicio)} – {formatDate(r.fecha_fin)}
                  </td>
                  <td>
                    <StatusBadge label={v.label} tone={v.tone} />
                  </td>
                  <td className="text-right">{r.items}</td>
                  <td className="text-right">{r.enlaces}</td>
                  <td className="text-right">{r.abiertos}</td>
                  <td className="text-right">{r.jugados}</td>
                  <td className="text-right">{r.ganadores}</td>
                  <td className="text-right roulette-actions">
                    <Button variant="ghost" size="sm" onClick={() => onOpen(r.id)}>
                      Ver
                    </Button>
                    {r.enlaces === 0 && (
                      <Button variant="ghost" size="sm" onClick={() => remove(r)} aria-label={`Eliminar ${r.nombre}`}>
                        Eliminar
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={paged.page} pages={paged.pages} total={paged.total} onChange={paged.setPage} />
    </Card>
  );
}

/** "Crear": name, validity dates and N options (name, image, prize) with the preview of the wheel. */
function RouletteFormModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [fechaInicio, setFechaInicio] = useState(todayIso());
  const [fechaFin, setFechaFin] = useState('');
  const [items, setItems] = useState<RouletteItemDraft[]>([emptyItem(), emptyItem()]);
  const [error, setError] = useState<string | null>(null);

  // Frees the preview URLs of the images when the form closes.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(
    () => () => itemsRef.current.forEach((i) => i.url && URL.revokeObjectURL(i.url)),
    [],
  );

  const mutation = useMutation({
    mutationFn: () =>
      marketingApi.createRoulette({ nombre: nombre.trim(), fecha_inicio: fechaInicio, fecha_fin: fechaFin }, items),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROULETTES_KEY }),
  });

  const update = (index: number, change: Partial<RouletteItemDraft>) =>
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...change } : item)));

  const setImage = (index: number, file: File | null) => {
    if (file && !IMAGE_ACCEPT.split(',').includes(file.type)) return setError('Use imágenes JPG, PNG o WEBP.');
    if (file && file.size > MAX_IMAGE_BYTES) return setError('Cada imagen puede pesar hasta 2 MB.');
    setError(null);
    const old = items[index].url;
    if (old) URL.revokeObjectURL(old);
    update(index, { file, url: file ? URL.createObjectURL(file) : null });
  };

  const removeItem = (index: number) => {
    const old = items[index].url;
    if (old) URL.revokeObjectURL(old);
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    if (!nombre.trim()) return setError('Escriba el nombre de la ruleta.');
    if (!fechaInicio || !fechaFin) return setError('Elija la fecha de inicio y la fecha fin.');
    if (fechaFin < fechaInicio) return setError('La fecha fin no puede ser anterior a la fecha de inicio.');
    if (items.length < MIN_ITEMS) return setError(`La ruleta necesita al menos ${MIN_ITEMS} opciones.`);
    if (items.some((i) => !i.nombre.trim())) return setError('Escriba el nombre de cada opción.');
    if (!items.some((i) => i.premio)) return setError('Al menos una opción debe ser un premio.');
    setError(null);
    try {
      await mutation.mutateAsync();
      toast.success('Ruleta creada.');
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const preview = items.map((i) => ({ nombre: i.nombre.trim() || 'Opción', imagen_url: i.url }));

  return (
    <Modal
      open
      title="Crear ruleta"
      onClose={onClose}
      size="lg"
      dismissible={!mutation.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={save} loading={mutation.isPending}>
            Crear
          </Button>
        </>
      }
    >
      <div className="roulette-form">
        <div className="roulette-form-fields">
          <Input label="Nombre" required value={nombre} maxLength={100} onChange={(e) => setNombre(e.target.value)} />
          <div className="roulette-dates">
            <DatePicker
              label="Fecha inicio"
              required
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
            <DatePicker
              label="Fecha fin"
              required
              value={fechaFin}
              min={fechaInicio || undefined}
              onChange={(e) => setFechaFin(e.target.value)}
            />
          </div>

          <h3 className="roulette-subtitle">Opciones ({items.length})</h3>
          <ol className="roulette-items">
            {items.map((item, i) => (
              <li key={i} className="roulette-item">
                <span className="roulette-item-number">{i + 1}</span>
                <Input
                  aria-label={`Nombre de la opción ${i + 1}`}
                  placeholder="Ej. Mica gratis"
                  value={item.nombre}
                  maxLength={100}
                  onChange={(e) => update(i, { nombre: e.target.value })}
                />
                <label className="roulette-image-picker" title="Imagen de la opción">
                  {item.url ? (
                    <img src={item.url} alt={`Imagen de la opción ${i + 1}`} />
                  ) : (
                    <span aria-hidden>＋</span>
                  )}
                  <input
                    type="file"
                    accept={IMAGE_ACCEPT}
                    aria-label={`Imagen de la opción ${i + 1}`}
                    onChange={(e) => {
                      setImage(i, e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                </label>
                {item.url && (
                  <button type="button" className="link-button" onClick={() => setImage(i, null)}>
                    Quitar imagen
                  </button>
                )}
                <Checkbox
                  label="Premio"
                  checked={item.premio}
                  onChange={(e) => update(i, { premio: e.target.checked })}
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Quitar la opción ${i + 1}`}
                  disabled={items.length <= MIN_ITEMS}
                  onClick={() => removeItem(i)}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
          <Button
            variant="secondary"
            size="sm"
            disabled={items.length >= MAX_ITEMS}
            onClick={() => setItems((prev) => [...prev, emptyItem()])}
          >
            + Agregar opción
          </Button>
          <p className="field-hint">
            Desmarque «Premio» en opciones como «Sigue intentando». Todas las opciones tienen la misma probabilidad.
          </p>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="roulette-preview" aria-label="Vista previa de la ruleta">
          <RouletteWheel items={preview} size={300} label="Vista previa" />
        </div>
      </div>
    </Modal>
  );
}

function RouletteDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const query = useQuery({ queryKey: [...ROULETTES_KEY, id], queryFn: () => marketingApi.roulette(id) });
  const links = query.data?.links ?? [];
  const paged = usePagedRows(links);
  const r = query.data?.roulette;

  return (
    <Modal open title={r ? `Ruleta ${r.nombre}` : 'Ruleta'} onClose={onClose} size="lg">
      {query.isLoading ? (
        <Loading />
      ) : query.isError || !query.data || !r ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <div className="roulette-detail">
            <RouletteWheel items={query.data.items} size={240} />
            <dl className="detail-list">
              <dt>Vigencia</dt>
              <dd>
                {formatDate(r.fecha_inicio)} – {formatDate(r.fecha_fin)}{' '}
                <StatusBadge {...validity(r)} />
              </dd>
              <dt>Premios</dt>
              <dd>
                {query.data.items
                  .filter((i) => i.premio)
                  .map((i) => i.nombre)
                  .join(', ')}
              </dd>
              <dt>Creada por</dt>
              <dd>{r.creado_por ?? '—'}</dd>
              <dt>Enlaces</dt>
              <dd>
                {r.enlaces} enviados · {r.abiertos} abiertos · {r.jugados} jugados · {r.ganadores} ganadores
              </dd>
            </dl>
          </div>
          {links.length === 0 ? (
            <p className="muted">
              Aún no se envió. En Campaña marque «¿Incluir ruleta?» para mandar un enlace a cada cliente.
            </p>
          ) : (
            <>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Celular</th>
                      <th>Enviado</th>
                      <th>Abrió</th>
                      <th>Jugó</th>
                      <th>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.rows.map((l) => (
                      <tr key={l.id}>
                        <td>{l.cliente ?? <span className="muted">Número escrito a mano</span>}</td>
                        <td>{l.telefono}</td>
                        <td>{formatDateTime(l.created_at)}</td>
                        <td>{formatDateTime(l.abierto_at)}</td>
                        <td>{formatDateTime(l.jugado_at)}</td>
                        <td>
                          {!l.jugado_at ? (
                            <span className="muted">—</span>
                          ) : l.gano ? (
                            <StatusBadge label={`Ganó: ${l.resultado}`} tone="success" />
                          ) : (
                            <StatusBadge label={l.resultado ?? 'Sin premio'} tone="neutral" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={paged.page} pages={paged.pages} total={paged.total} onChange={paged.setPage} />
            </>
          )}
        </>
      )}
    </Modal>
  );
}
