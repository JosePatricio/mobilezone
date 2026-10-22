import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Checkbox, ErrorState, Loading, Select, useConfirm, useToast } from '@/shared/components';
import { getErrorMessage, toApiError } from '@/shared/services/apiError';
import { fullName, todayIso } from '@/shared/utils/format';
import { applyVariables, formatMessage, isEmptyMessage, type Line } from '../message';
import { publicBaseUrl } from '../paths';
import { MARKETING_KEY, ROULETTES_KEY, marketingApi } from '../services/marketingApi';
import { MEDIA_MAX_MB } from './MediaPicker';
import {
  PARAM_SOURCE_LABELS,
  type MediaKind,
  type MessageMedia,
  type OrderClient,
  type ParamSource,
  type TemplateParam,
  type WhatsAppTemplate,
} from '../types';

/**
 * Approximate price of each message in Ecuador (Meta rate card "Rest of Latin America", USD, Oct 2026).
 * Only an estimate: Meta changes it every few months and the test number is free.
 */
const PRICE_PER_MESSAGE: Record<string, number> = { MARKETING: 0.074, UTILITY: 0.0113, AUTHENTICATION: 0.0113 };

/** The header file is the one of step 1 ("¿Agregar imagen o video?"), checked there against WhatsApp's limits. */
const HEADER_KINDS: Partial<Record<NonNullable<WhatsAppTemplate['header_format']>, MediaKind>> = {
  IMAGE: 'image',
  VIDEO: 'video',
};
const KIND_LABELS: Record<MediaKind, { name: string; missing: string }> = {
  image: { name: 'una imagen', missing: 'sin imagen' },
  video: { name: 'un video', missing: 'sin video' },
};

/** PDF headers: the page has no way to attach them. */
const canUse = (t: WhatsAppTemplate) => !t.unsupported_params && t.header_format !== 'DOCUMENT';

/** Template chosen when the list loads; Meta's sample template is not offered. */
const DEFAULT_TEMPLATE = 'mobilezone_promo_img';
const HIDDEN_TEMPLATES = new Set(['hello_world']);

/** Each placeholder in order takes the data of each client: {{1}} the name, the next ones the brand of the phone. */
const PARAM_SOURCES: ParamSource[] = ['NOMBRE', 'MARCA'];
const toParams = (names: string[]): TemplateParam[] => names.map((_, i) => ({ source: PARAM_SOURCES[i] ?? 'MARCA' }));

/** "¿Incluir ruleta?": the placeholder of @RULETA takes the link of the wheel, different for each client. */
const withLink = (params: TemplateParam[], index: number | null): TemplateParam[] =>
  index === null ? params : params.map((p, i) => (i === index ? { source: 'RULETA' } : p));

const keyOf = (t: WhatsAppTemplate) => `${t.name}|${t.language}`;

function sampleValue(param: TemplateParam, client: OrderClient | undefined): string {
  if (param.source === 'TEXTO') return param.texto?.trim() || '…';
  if (param.source === 'RULETA') return `${publicBaseUrl()}/ruleta/…`;
  if (!client) return `[${PARAM_SOURCE_LABELS[param.source]}]`;
  return {
    NOMBRE: client.nombre,
    APELLIDO: client.apellido,
    NOMBRE_COMPLETO: fullName(client),
    MARCA: client.marca,
    MODELO: client.modelo,
  }[param.source];
}

/** Text of the template with its placeholders filled for one client. */
function fillTemplate(template: WhatsAppTemplate, params: TemplateParam[], client: OrderClient | undefined): string {
  return template.body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => {
    const index = template.body_params.indexOf(name);
    return index >= 0 && params[index] ? sampleValue(params[index], client) : match;
  });
}

/** Variable of "2. Texto" that stands for each kind of placeholder. */
const TOKEN_OF: Partial<Record<ParamSource, string>> = { NOMBRE: '@NOMBRE', MARCA: '@TELEFONO', RULETA: '@RULETA' };

/** The template written with the variables of the editor ({{1}} → @NOMBRE, …), to compare both texts. */
function templateAsText(template: WhatsAppTemplate, params: TemplateParam[]): string {
  return template.body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => {
    const index = template.body_params.indexOf(name);
    return (index >= 0 && params[index] && TOKEN_OF[params[index].source]) || match;
  });
}

const comparable = (text: string) =>
  text
    .replace(/@(NOMBRE|TELEFONO|RULETA)\b/gi, (token) => token.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();

/** The text of the editor with the variables filled for one client (sample of the preview). */
function personalizeText(lines: Line[], client: OrderClient | undefined): Line[] {
  const vars = client
    ? { nombre: client.nombre, telefono: client.marca }
    : { nombre: `[${PARAM_SOURCE_LABELS.NOMBRE}]`, telefono: `[${PARAM_SOURCE_LABELS.MARCA}]` };
  const link = `${publicBaseUrl()}/ruleta/…`;
  return lines.map((line) =>
    line.map((run) => ({ ...run, text: applyVariables(run.text, vars).replace(/@RULETA\b/gi, () => link) })),
  );
}

/** Lines with bold / italic / strikethrough, as WhatsApp shows them (no text sizes). */
function TextLines({ lines }: { lines: Line[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <p key={i}>
          {line.length === 0
            ? '\u00a0'
            : line.map((run, j) => (
                <span
                  key={j}
                  style={{
                    fontWeight: run.bold ? 700 : undefined,
                    fontStyle: run.italic ? 'italic' : undefined,
                    textDecoration: run.strike ? 'line-through' : undefined,
                  }}
                >
                  {run.text}
                </span>
              ))}
        </p>
      ))}
    </>
  );
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

interface Props {
  /** Selected clients with a mobile number. */
  recipients: OrderClient[];
  /** Image / video chosen in "1. ¿Agregar imagen o video?": the header of templates with media. */
  media?: MessageMedia | null;
  /** "¿Incluir ruleta?" (it also adds @RULETA to "2. Texto"). */
  includeRoulette?: boolean;
  onIncludeRouletteChange?: (on: boolean) => void;
  /** Placeholder of @RULETA: its position among the variables of "2. Texto" (null = not in the text). */
  linkIndex?: number | null;
  /** Text of "2. Texto": the preview follows it while it is typed. */
  lines?: Line[];
}

/** "Enviar por WhatsApp Business": one approved template, sent by the server through Meta's Cloud API. */
export function WhatsAppApiSender({
  recipients,
  media = null,
  includeRoulette = false,
  onIncludeRouletteChange,
  linkIndex = null,
  lines = [],
}: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: [MARKETING_KEY, 'templates'], queryFn: marketingApi.templates, retry: false });
  const [selectedKey, setSelectedKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rouletteId, setRouletteId] = useState('');
  const roulettes = useQuery({ queryKey: ROULETTES_KEY, queryFn: marketingApi.roulettes, enabled: includeRoulette });
  const today = todayIso();
  const activeRoulettes = (roulettes.data ?? []).filter((r) => r.fecha_fin >= today);
  const total = recipients.length;

  const template = useMemo(() => templates.data?.find((t) => keyOf(t) === selectedKey), [templates.data, selectedKey]);
  const bodyParams = template?.body_params ?? [];
  const link = includeRoulette ? linkIndex : null;
  const params = useMemo(() => withLink(toParams(template?.body_params ?? []), link), [template, link]);
  const headerKind = template?.header_format ? HEADER_KINDS[template.header_format] : undefined;
  const headerUpload = headerKind && media?.kind === headerKind ? media.file : null;
  const price = template ? (PRICE_PER_MESSAGE[template.category] ?? PRICE_PER_MESSAGE.MARKETING) : 0;

  const choose = (key: string) => {
    setSelectedKey(key);
    setError(null);
  };

  useEffect(() => {
    const preferred = templates.data?.find((t) => t.name === DEFAULT_TEMPLATE && canUse(t));
    if (!selectedKey && preferred) choose(keyOf(preferred));
  }, [templates.data]); // only when the templates arrive

  const mutation = useMutation({
    mutationFn: () =>
      marketingApi.createCampaign(
        {
          plantilla: template!.name,
          idioma: template!.language,
          cliente_ids: recipients.map((c) => c.cliente_id),
          parametros: params,
          ...(includeRoulette ? { ruleta_id: Number(rouletteId), enlace_base: publicBaseUrl() } : {}),
        },
        headerUpload,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MARKETING_KEY, 'campaigns'] }),
  });

  const send = async () => {
    if (!template) return setError('Elija una plantilla.');
    if (headerKind && !headerUpload)
      return setError(
        `La plantilla lleva ${KIND_LABELS[headerKind].name} (hasta ${MEDIA_MAX_MB[headerKind]} MB): agréguelo en "1. ¿Agregar imagen o video?".`,
      );
    if (total === 0) return setError('Seleccione al menos un cliente con celular.');
    if (includeRoulette && !rouletteId) return setError('Elija la ruleta que se envía.');
    if (includeRoulette && link === null) return setError('Agregue @RULETA en "2. Texto".');
    if (includeRoulette && link !== null && link >= bodyParams.length)
      return setError(
        `@RULETA es la variable ${link + 1} del texto y la plantilla tiene ${bodyParams.length}: use una plantilla con una variable para el enlace.`,
      );
    setError(null);
    const ok = await confirm({
      title: 'Enviar por WhatsApp',
      message: (
        <>
          Se enviará la plantilla <strong>{template.name}</strong> a {recipients.length} cliente(s).
          {includeRoulette && <> Cada uno recibe su propio enlace de la ruleta (un solo uso).</>}
          <br />
          Costo aproximado: <strong>{formatUsd(total * price)}</strong> ({formatUsd(price)} por mensaje de{' '}
          {template.category.toLowerCase()}).
        </>
      ),
      confirmLabel: 'Enviar',
    });
    if (!ok) return;
    try {
      const created = await mutation.mutateAsync();
      const skipped = [
        created.sin_numero ? `${created.sin_numero} sin celular válido` : '',
        created.dados_de_baja ? `${created.dados_de_baja} dados de baja` : '',
      ].filter(Boolean);
      toast.success(
        `Enviando ${created.encolados} mensaje(s).${skipped.length ? ` Omitidos: ${skipped.join(', ')}.` : ''}`,
      );
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (templates.isLoading) {
    return (
      <Card title="Enviar por WhatsApp Business">
        <Loading label="Cargando plantillas…" />
      </Card>
    );
  }
  if (templates.isError) {
    const notConfigured = toApiError(templates.error).code === 'WHATSAPP_NOT_CONFIGURED';
    return (
      <Card title="Enviar por WhatsApp Business">
        {notConfigured ? (
          <p className="muted">
            El envío automático no está activado. Configure las variables <code>WHATSAPP_*</code> del servidor.
          </p>
        ) : (
          <ErrorState error={templates.error} onRetry={() => templates.refetch()} />
        )}
      </Card>
    );
  }

  const all = templates.data ?? [];
  const options = all
    .filter((t) => canUse(t) && !HIDDEN_TEMPLATES.has(t.name))
    .map((t) => ({ value: keyOf(t), label: `${t.name} (${t.language})` }));
  const unsupported = all.filter((t) => !canUse(t)).map((t) => t.name);
  const sample = recipients[0];
  // The preview shows the text being edited; WhatsApp only delivers the approved text of the template.
  const edited = !isEmptyMessage(lines);
  const differs =
    !!template && edited && comparable(formatMessage(lines, 'WHATSAPP')) !== comparable(templateAsText(template, params));

  return (
    <Card title="Enviar por WhatsApp Business">
      <Select
        label="Plantilla"
        placeholder={options.length ? 'Elija una plantilla' : 'No hay plantillas aprobadas'}
        options={options}
        value={selectedKey}
        onChange={(e) => choose(e.target.value)}
        hint={
          unsupported.length
            ? `No se pueden usar (llevan PDF o variables en el encabezado o botones): ${unsupported.join(', ')}.`
            : undefined
        }
      />

      <Checkbox
        label="¿Incluir ruleta?"
        description="Agrega al mensaje un enlace único por cliente para jugar la ruleta una vez."
        checked={includeRoulette}
        onChange={(e) => {
          onIncludeRouletteChange?.(e.target.checked);
          setError(null);
        }}
      />
      {includeRoulette && (
        <div className="wa-roulette">
          <Select
            label="Ruleta"
            placeholder={
              roulettes.isLoading ? 'Cargando…' : activeRoulettes.length ? 'Elija una ruleta' : 'No hay ruletas vigentes'
            }
            options={activeRoulettes.map((r) => ({ value: String(r.id), label: r.nombre }))}
            value={rouletteId}
            onChange={(e) => setRouletteId(e.target.value)}
          />
          <p className="field-hint">El enlace va donde está @RULETA en "2. Texto".</p>
        </div>
      )}

      {template && (
        <div className="wa-template">
          <div className="wa-bubble" aria-label="Vista previa de la plantilla">
            {template.header_format === 'TEXT' && template.header_text && <strong>{template.header_text}</strong>}
            {headerKind &&
              (!headerUpload ? (
                <span className="muted">[{KIND_LABELS[headerKind].missing}: agréguelo en el paso 1]</span>
              ) : headerKind === 'image' ? (
                <img src={media!.url} alt="Imagen del encabezado" className="message-media" />
              ) : (
                <video src={media!.url} className="message-media" controls aria-label="Video del encabezado" />
              ))}
            {edited ? <TextLines lines={personalizeText(lines, sample)} /> : <p>{fillTemplate(template, params, sample)}</p>}
            {template.footer && <small className="muted">{template.footer}</small>}
          </div>
          {differs && (
            <div className="alert alert-warning wa-template-differs" role="note">
              El texto editado no es el de la plantilla aprobada <strong>{template.name}</strong>. WhatsApp solo
              envía el texto aprobado por Meta:
              <p className="wa-template-sent">{fillTemplate(template, params, sample)}</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <Button className="crm-prepare" onClick={send} loading={mutation.isPending} disabled={!template}>
        Enviar por WhatsApp
      </Button>
    </Card>
  );
}
