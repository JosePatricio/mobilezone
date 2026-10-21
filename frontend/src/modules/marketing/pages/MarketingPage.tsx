import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  useToast,
  WhatsAppIcon,
} from '@/shared/components';
import { formatDate, fullName } from '@/shared/utils/format';
import { MediaPicker } from '../components/MediaPicker';
import { MessagePreview } from '../components/MessagePreview';
import { WhatsAppApiSender } from '../components/WhatsAppApiSender';
import { WhatsAppCampaigns } from '../components/WhatsAppCampaigns';
import { RichTextEditor } from '../components/RichTextEditor';
import {
  clientVariables,
  formatMessage,
  forChannel,
  isEmptyMessage,
  type Line,
  personalize,
  VARIABLES,
} from '../message';
import { MARKETING_KEY, marketingApi } from '../services/marketingApi';
import type { Channel, MessageMedia, OrderClient } from '../types';
import { usePagedRows } from '../usePagedRows';

/** Propaganda goes out by WhatsApp only. */
const CHANNEL: Channel = 'WHATSAPP';

interface PreparedMessage {
  client: OrderClient;
  text: string;
}

/** One row per mobile: the client of the latest order stands for every record with that number. */
interface NumberRow {
  client: OrderClient;
  records: OrderClient[];
}

/** Same number however it was typed: "099 111 1111" and "+593991111111" are one phone. */
function phoneKey(celular: string): string {
  const digits = celular.replace(/\D/g, '');
  return !celular.trim().startsWith('+') && digits.startsWith('0') ? `593${digits.slice(1)}` : digits;
}

/** Groups the clients by mobile, in the order of the list; clients without one stay on their own. */
function uniqueNumbers(clients: OrderClient[]): NumberRow[] {
  const groups = new Map<string, OrderClient[]>();
  for (const c of clients) {
    const key = c.celular ? phoneKey(c.celular) : `id:${c.cliente_id}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups.values()].map((records) => ({
    client: records.reduce((a, b) => (b.ultima_orden > a.ultima_orden ? b : a)),
    records,
  }));
}

/** Name, cédula / RUC or mobile; "0960911155", "960911155" and "+593960911155" find the same phone. */
function matches(c: OrderClient, term: string): boolean {
  if (fullName(c).toLowerCase().includes(term) || (c.identificacion ?? '').toLowerCase().includes(term)) return true;
  if (!c.celular) return false;
  const digits = term.replace(/\D/g, '');
  const number = (digits.startsWith('0') ? digits.slice(1) : digits).replace(/^593/, '');
  return c.celular.includes(term) || (number.length > 0 && phoneKey(c.celular).includes(number));
}

/** Propaganda: the CRM prepares a WhatsApp message for the clients that came through Órdenes. */
export function MarketingPage() {
  const [composing, setComposing] = useState(false);

  return (
    <>
      <PageHeader title="Propaganda">
        Mensajes de promoción para los clientes que hicieron una orden de trabajo.
      </PageHeader>

      {composing ? (
        <CrmComposer />
      ) : (
        <Card>
          <div className="crm-start">
            <Button
              className="btn-whatsapp"
              icon={<WhatsAppIcon fill="currentColor" />}
              onClick={() => setComposing(true)}
            >
              Enviar propaganda
            </Button>
          </div>
        </Card>
      )}

      <WhatsAppCampaigns />
    </>
  );
}

function RepeatedNumbersDialog({ repeated, onClose }: { repeated: NumberRow[]; onClose: () => void }) {
  const paged = usePagedRows(repeated);
  return (
    <Modal open title="Números repetidos" onClose={onClose}>
      <p className="muted">Cada número recibe un solo mensaje aunque lo tengan varios clientes.</p>
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Celular</th>
              <th className="text-right">Veces</th>
              <th>Clientes</th>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((r) => (
              <tr key={r.client.cliente_id}>
                <td>{r.client.celular}</td>
                <td className="text-right">{r.records.length}</td>
                <td>{r.records.map((c) => fullName(c)).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={paged.page} pages={paged.pages} total={paged.total} onChange={paged.setPage} />
    </Modal>
  );
}

/** "Historial": every record of the list with one mobile. */
function NumberHistoryDialog({ row, onClose }: { row: NumberRow; onClose: () => void }) {
  const paged = usePagedRows(row.records);
  return (
    <Modal open title={`Historial de ${row.client.celular}`} onClose={onClose} size="lg">
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Celular</th>
              <th>Teléfono</th>
              <th className="text-right">Órdenes</th>
              <th>Última orden</th>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((c) => (
              <tr key={c.cliente_id}>
                <td>{fullName(c)}</td>
                <td>{c.celular}</td>
                <td>
                  {c.marca} <span className="muted">{c.modelo}</span>
                </td>
                <td className="text-right">{c.ordenes}</td>
                <td>{formatDate(c.ultima_orden)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={paged.page} pages={paged.pages} total={paged.total} onChange={paged.setPage} />
    </Modal>
  );
}

function CrmComposer() {
  const toast = useToast();
  const query = useQuery({
    queryKey: [MARKETING_KEY, 'recipients'],
    queryFn: marketingApi.recipients,
  });
  const clients = useMemo(() => query.data ?? [], [query.data]);

  const [media, setMediaState] = useState<MessageMedia | null>(null);
  const [lines, setLines] = useState<Line[]>([[]]);
  const [search, setSearch] = useState('');
  const [showRepeated, setShowRepeated] = useState(false);
  const [history, setHistory] = useState<NumberRow | null>(null);
  // Nobody is checked at first: messages only go to the clients picked by hand.
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [prepared, setPrepared] = useState<PreparedMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Frees the preview URL of the replaced / removed file (and on leaving the page).
  const mediaRef = useRef<MessageMedia | null>(null);
  const setMedia = useCallback((next: MessageMedia | null) => {
    if (mediaRef.current && mediaRef.current.url !== next?.url) URL.revokeObjectURL(mediaRef.current.url);
    mediaRef.current = next;
    setMediaState(next);
  }, []);
  useEffect(
    () => () => {
      if (mediaRef.current) URL.revokeObjectURL(mediaRef.current.url);
    },
    [],
  );

  const onTextChange = useCallback((next: Line[]) => {
    setLines(next);
    setPrepared(null);
  }, []);

  const numbers = useMemo(() => uniqueNumbers(clients), [clients]);
  const repeated = useMemo(() => numbers.filter((r) => r.records.length > 1), [numbers]);
  // A number shows when any of its records matches the search.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? numbers.filter((r) => r.records.some((c) => matches(c, term))) : numbers;
  }, [numbers, search]);
  const paged = usePagedRows(visible);
  const selectable = visible.map((r) => r.client).filter((c) => c.celular);
  const selected = selectable.filter((c) => chosen.has(c.cliente_id));
  const allSelected = selectable.length > 0 && selected.length === selectable.length;

  const toggle = (id: number, on: boolean) => {
    setPrepared(null);
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  // Every number of the search, on all the pages.
  const toggleAll = (on: boolean) => {
    setPrepared(null);
    setChosen((prev) => {
      const next = new Set(prev);
      selectable.forEach((c) => (on ? next.add(c.cliente_id) : next.delete(c.cliente_id)));
      return next;
    });
  };

  const sample = selected[0] ?? clients[0];
  const sampleLines = forChannel(sample ? personalize(lines, clientVariables(sample)) : lines, CHANNEL);

  const prepare = () => {
    if (isEmptyMessage(lines)) return setError('Escriba el texto del mensaje.');
    if (selected.length === 0) return setError('Seleccione al menos un cliente con celular.');
    setError(null);
    setPrepared(
      selected.map((client) => ({
        client,
        text: formatMessage(personalize(lines, clientVariables(client)), CHANNEL),
      })),
    );
    toast.success(`${selected.length} mensaje(s) preparado(s) para copiar.`);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Mensaje copiado.');
    } catch {
      toast.error('No se pudo copiar el mensaje.');
    }
  };

  return (
    <div className="crm">
      <div className="crm-grid">
        <div className="crm-main">
          <Card title="1. ¿Agregar imagen?">
            <MediaPicker media={media} onChange={setMedia} />
          </Card>

          <Card title="2. Texto">
            <RichTextEditor
              label="Mensaje"
              onChange={onTextChange}
              placeholder="Hola @NOMBRE, tienes una promoción para comprar tu teléfono @TELEFONO a este precio 430$."
            />
            <p className="field-hint">
              Variables: {VARIABLES.map((v) => `${v.token} (${v.hint.toLowerCase()})`).join(', ')}. WhatsApp muestra
              negrita, cursiva y tachado; el tamaño de letra no se envía.
            </p>
          </Card>

          <Card title="3. Clientes de órdenes">
            {query.isLoading ? (
              <Loading />
            ) : query.isError ? (
              <ErrorState error={query.error} onRetry={() => query.refetch()} />
            ) : clients.length === 0 ? (
              <EmptyState title="Sin clientes">Aún no hay clientes con órdenes de trabajo.</EmptyState>
            ) : (
              <>
                <div className="toolbar">
                  <SearchInput
                    value={search}
                    onChange={(value) => {
                      setSearch(value);
                      paged.setPage(1);
                    }}
                    placeholder="Buscar por nombre, cédula o celular…"
                  />
                </div>
                {repeated.length > 0 && (
                  <button type="button" className="crm-repeated" onClick={() => setShowRepeated(true)}>
                    Hay {repeated.length} número(s) repetido(s). Ver cuáles
                  </button>
                )}
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="text-center">
                          <input
                            type="checkbox"
                            aria-label="Seleccionar todos"
                            checked={allSelected}
                            disabled={selectable.length === 0}
                            onChange={(e) => toggleAll(e.target.checked)}
                          />
                        </th>
                        <th>Cliente</th>
                        <th>Celular</th>
                        <th>Teléfono</th>
                        <th className="text-right">Órdenes</th>
                        <th>Última orden</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.rows.map(({ client: c, records }) => (
                        <tr key={c.cliente_id}>
                          <td className="text-center">
                            <input
                              type="checkbox"
                              aria-label={`Incluir a ${fullName(c)}`}
                              checked={!!c.celular && chosen.has(c.cliente_id)}
                              disabled={!c.celular}
                              onChange={(e) => toggle(c.cliente_id, e.target.checked)}
                            />
                          </td>
                          <td>{fullName(c)}</td>
                          <td>
                            {c.celular ?? <span className="badge badge-neutral">Sin celular</span>}
                            {records.length > 1 && (
                              <button
                                type="button"
                                className="link-button crm-history"
                                aria-label={`Historial de ${c.celular}`}
                                onClick={() => setHistory({ client: c, records })}
                              >
                                historial
                              </button>
                            )}
                          </td>
                          <td>
                            {c.marca} <span className="muted">{c.modelo}</span>
                          </td>
                          <td className="text-right">{c.ordenes}</td>
                          <td>{formatDate(c.ultima_orden)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={paged.page} pages={paged.pages} total={paged.total} onChange={paged.setPage} />
                <p className="muted crm-count">
                  {selected.length} de {numbers.length} número(s) seleccionado(s)
                </p>
                {showRepeated && <RepeatedNumbersDialog repeated={repeated} onClose={() => setShowRepeated(false)} />}
                {history && <NumberHistoryDialog row={history} onClose={() => setHistory(null)} />}
              </>
            )}
          </Card>
        </div>

        <aside className="crm-side">
          <Card title="Vista previa">
            {sample && (
              <p className="muted crm-sample">
                Así lo verá {fullName(sample)} ({sample.marca})
              </p>
            )}
            <MessagePreview lines={sampleLines} media={media} channel={CHANNEL} />
            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}
            <Button className="crm-prepare" onClick={prepare} disabled={query.isLoading}>
              Preparar mensajes
            </Button>
          </Card>
          <WhatsAppApiSender recipients={selected} media={media} />
        </aside>
      </div>

      {prepared && (
        <Card title={`Mensajes preparados (${prepared.length})`}>
          <div className="alert alert-info">
            Los mensajes están listos con el formato de WhatsApp
            {media ? ' y la imagen adjunta' : ''}. Cópielos y envíelos uno por uno.
          </div>
          <ul className="prepared-list">
            {prepared.map(({ client, text }) => (
              <li key={client.cliente_id} className="prepared-item">
                <div className="prepared-head">
                  <strong>{fullName(client)}</strong>
                  <span className="muted">{client.celular}</span>
                  <Button variant="ghost" size="sm" onClick={() => copy(text)}>
                    Copiar
                  </Button>
                </div>
                <pre className="prepared-text">{text}</pre>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
