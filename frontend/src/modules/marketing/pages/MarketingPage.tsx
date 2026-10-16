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
  SearchInput,
  Select,
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
import { CHANNEL_LABELS, type Channel, type MessageMedia, type OrderClient } from '../types';

interface PreparedMessage {
  client: OrderClient;
  text: string;
}

/** Propaganda: the CRM prepares a WhatsApp / SMS message for the clients that came through Órdenes. */
export function MarketingPage() {
  const [choosing, setChoosing] = useState(false);
  const [channel, setChannel] = useState<Channel | null>(null);

  return (
    <>
      <PageHeader title="Propaganda" actions={<Button onClick={() => setChoosing(true)}>CRM</Button>}>
        Mensajes de promoción para los clientes que hicieron una orden de trabajo.
      </PageHeader>

      <ChannelDialog
        open={choosing}
        onClose={() => setChoosing(false)}
        onChoose={(c) => {
          setChannel(c);
          setChoosing(false);
        }}
      />

      {channel ? (
        <CrmComposer channel={channel} onChangeChannel={() => setChoosing(true)} />
      ) : (
        <Card>
          <EmptyState title="Prepare un mensaje">
            Pulse <strong>CRM</strong> y elija si el mensaje irá por WhatsApp o por SMS.
          </EmptyState>
        </Card>
      )}

      <WhatsAppCampaigns />
    </>
  );
}

function ChannelDialog({
  open,
  onClose,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (channel: Channel) => void;
}) {
  return (
    <Modal open={open} title="CRM" onClose={onClose} size="sm">
      <p>¿Por dónde enviará el mensaje?</p>
      <div className="channel-options">
        <button type="button" className="channel-option" onClick={() => onChoose('WHATSAPP')}>
          <WhatsAppIcon />
          <span>WhatsApp</span>
        </button>
        <button type="button" className="channel-option" onClick={() => onChoose('SMS')}>
          <span className="channel-sms" aria-hidden>
            SMS
          </span>
          <span>SMS</span>
        </button>
      </div>
    </Modal>
  );
}

function CrmComposer({ channel, onChangeChannel }: { channel: Channel; onChangeChannel: () => void }) {
  const toast = useToast();
  const query = useQuery({ queryKey: [MARKETING_KEY, 'recipients'], queryFn: marketingApi.recipients });
  const clients = useMemo(() => query.data ?? [], [query.data]);

  const [media, setMediaState] = useState<MessageMedia | null>(null);
  const [lines, setLines] = useState<Line[]>([[]]);
  const [search, setSearch] = useState('');
  const [marca, setMarca] = useState('');
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

  const brands = useMemo(
    () => [...new Set(clients.map((c) => c.marca))].sort((a, b) => a.localeCompare(b)).map((m) => ({ value: m, label: m })),
    [clients],
  );
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clients.filter(
      (c) =>
        (!marca || c.marca === marca) &&
        (!term || fullName(c).toLowerCase().includes(term) || (c.celular ?? '').includes(term)),
    );
  }, [clients, search, marca]);
  const selectable = visible.filter((c) => c.celular);
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
  const toggleAll = (on: boolean) => {
    setPrepared(null);
    setChosen((prev) => {
      const next = new Set(prev);
      selectable.forEach((c) => (on ? next.add(c.cliente_id) : next.delete(c.cliente_id)));
      return next;
    });
  };

  const sample = selected[0] ?? clients[0];
  const sampleLines = forChannel(sample ? personalize(lines, clientVariables(sample)) : lines, channel);

  const prepare = () => {
    if (isEmptyMessage(lines)) return setError('Escriba el texto del mensaje.');
    if (selected.length === 0) return setError('Seleccione al menos un cliente con celular.');
    setError(null);
    setPrepared(selected.map((client) => ({ client, text: formatMessage(personalize(lines, clientVariables(client)), channel) })));
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
      <div className="crm-channel">
        <span>
          Canal: <strong>{CHANNEL_LABELS[channel]}</strong>
        </span>
        <Button variant="ghost" size="sm" onClick={onChangeChannel}>
          Cambiar
        </Button>
      </div>

      <div className="crm-grid">
        <div className="crm-main">
          <Card title="1. ¿Agregar video o imagen?">
            <MediaPicker media={media} onChange={setMedia} />
            {channel === 'SMS' && media && (
              <p className="field-hint">Por SMS la imagen o el video se envían como MMS (según el operador).</p>
            )}
          </Card>

          <Card title="2. Texto">
            <RichTextEditor
              label="Mensaje"
              onChange={onTextChange}
              placeholder="Hola @NOMBRE, tienes una promoción para comprar tu teléfono @TELEFONO a este precio 430$."
            />
            <p className="field-hint">
              Variables: {VARIABLES.map((v) => `${v.token} (${v.hint.toLowerCase()})`).join(', ')}.{' '}
              {channel === 'WHATSAPP'
                ? 'WhatsApp muestra negrita, cursiva y tachado; el tamaño de letra no se envía.'
                : 'El SMS se envía como texto simple, sin formato.'}
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
                  <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o celular…" />
                  <Select
                    aria-label="Marca del teléfono"
                    placeholder="Todas las marcas"
                    options={brands}
                    value={marca}
                    onChange={(e) => setMarca(e.target.value)}
                  />
                </div>
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
                      {visible.map((c) => (
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
                          <td>{c.celular ?? <span className="badge badge-neutral">Sin celular</span>}</td>
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
                <p className="muted crm-count">
                  {selected.length} de {clients.length} cliente(s) seleccionado(s)
                </p>
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
            <MessagePreview lines={sampleLines} media={media} channel={channel} />
            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}
            <Button className="crm-prepare" onClick={prepare} disabled={query.isLoading}>
              Preparar mensajes
            </Button>
          </Card>
          {channel === 'WHATSAPP' && <WhatsAppApiSender recipients={selected} />}
        </aside>
      </div>

      {prepared && (
        <Card title={`Mensajes preparados (${prepared.length})`}>
          <div className="alert alert-info">
            Los mensajes están listos con el formato de {CHANNEL_LABELS[channel]}
            {media ? ` y ${media.kind === 'image' ? 'la imagen' : 'el video'} adjunto` : ''}. Cópielos y envíelos uno por uno.
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
