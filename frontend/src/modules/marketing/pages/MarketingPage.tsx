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
  Select,
  WhatsAppIcon,
} from '@/shared/components';
import { formatDate, fullName } from '@/shared/utils/format';
import { MediaPicker } from '../components/MediaPicker';
import { WhatsAppApiSender } from '../components/WhatsAppApiSender';
import { WhatsAppCampaigns } from '../components/WhatsAppCampaigns';
import { RichTextEditor } from '../components/RichTextEditor';
import { hasRouletteTag, type Line, ROULETTE_VARIABLE, VARIABLES } from '../message';
import { MARKETING_KEY, marketingApi } from '../services/marketingApi';
import type { MessageMedia, OrderClient } from '../types';
import { usePagedRows } from '../usePagedRows';

/** Text of the approved promo template, with its {{1}} / {{2}} as the variables of the editor. */
const DEFAULT_TEXT =
  '¡Hola @NOMBRE! 📱 llegaron MICAS con DISEÑO para tu @TELEFONO, reservalo antes que se agoten.\n' +
  'Responde STOP para no recibir más mensajes';

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

/** Propaganda › Campaña: WhatsApp messages for the clients that came through Órdenes. */
export function MarketingPage() {
  const [composing, setComposing] = useState(false);

  return (
    <>
      <PageHeader
        title="Campaña"
        actions={
          composing && (
            <Button variant="secondary" onClick={() => setComposing(false)}>
              ← Volver
            </Button>
          )
        }
      >
        Mensajes de propaganda para los clientes que hicieron una orden de trabajo.
      </PageHeader>

      {composing ? (
        <CrmComposer />
      ) : (
        <>
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
          <WhatsAppCampaigns />
        </>
      )}
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
  const query = useQuery({
    queryKey: [MARKETING_KEY, 'recipients'],
    queryFn: marketingApi.recipients,
  });
  const clients = useMemo(() => query.data ?? [], [query.data]);

  const [media, setMediaState] = useState<MessageMedia | null>(null);
  // "¿Incluir ruleta?" of the sender enables the internal @RULETA tag of the text.
  const [includeRoulette, setIncludeRoulette] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const variables = includeRoulette ? [...VARIABLES, ROULETTE_VARIABLE] : VARIABLES;
  const [search, setSearch] = useState('');
  const [marca, setMarca] = useState('');
  const [showRepeated, setShowRepeated] = useState(false);
  const [history, setHistory] = useState<NumberRow | null>(null);
  // Nobody is checked at first: messages only go to the clients picked by hand.
  const [chosen, setChosen] = useState<Set<number>>(new Set());

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

  const numbers = useMemo(() => uniqueNumbers(clients), [clients]);
  const repeated = useMemo(() => numbers.filter((r) => r.records.length > 1), [numbers]);
  // A number shows when any of its records matches the search.
  // The brand is the one shown on the row (phone of the latest order of the number).
  const brands = useMemo(
    () =>
      [...new Set(numbers.map((r) => r.client.marca))]
        .sort((a, b) => a.localeCompare(b))
        .map((m) => ({ value: m, label: m })),
    [numbers],
  );
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return numbers.filter(
      (r) => (!marca || r.client.marca === marca) && (!term || r.records.some((c) => matches(c, term))),
    );
  }, [numbers, search, marca]);
  const paged = usePagedRows(visible);
  const selectable = visible.map((r) => r.client).filter((c) => c.celular);
  const selected = selectable.filter((c) => chosen.has(c.cliente_id));
  const allSelected = selectable.length > 0 && selected.length === selectable.length;

  const toggle = (id: number, on: boolean) => {
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  // Every number of the search, on all the pages.
  const toggleAll = (on: boolean) => {
    setChosen((prev) => {
      const next = new Set(prev);
      selectable.forEach((c) => (on ? next.add(c.cliente_id) : next.delete(c.cliente_id)));
      return next;
    });
  };

  return (
    <div className="crm">
      <div className="crm-grid">
        <div className="crm-main">
          <Card title="1. ¿Agregar imagen o video?">
            <MediaPicker media={media} onChange={setMedia} />
          </Card>

          <Card title="2. Texto">
            <RichTextEditor
              label="Mensaje"
              onChange={setLines}
              variables={variables}
              optionToken={includeRoulette ? ROULETTE_VARIABLE.token : undefined}
              defaultText={DEFAULT_TEXT}
              placeholder="Hola @NOMBRE, tienes una promoción para comprar tu teléfono @TELEFONO a este precio 430$."
            />
            <p className="field-hint">
              Variables: {variables.map((v) => `${v.token} (${v.hint.toLowerCase()})`).join(', ')}. WhatsApp muestra
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
                  <Select
                    aria-label="Marca del teléfono"
                    placeholder="Todas las marcas"
                    options={brands}
                    value={marca}
                    onChange={(e) => {
                      setMarca(e.target.value);
                      paged.setPage(1);
                    }}
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
          <WhatsAppApiSender
            recipients={selected}
            media={media}
            includeRoulette={includeRoulette}
            onIncludeRouletteChange={setIncludeRoulette}
            hasRouletteTag={hasRouletteTag(lines)}
            lines={lines}
          />
        </aside>
      </div>
    </div>
  );
}
