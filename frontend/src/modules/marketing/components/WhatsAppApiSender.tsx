import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, ErrorState, Loading, Select, useConfirm, useToast } from '@/shared/components';
import { getErrorMessage, toApiError } from '@/shared/services/apiError';
import { fullName } from '@/shared/utils/format';
import { MARKETING_KEY, marketingApi } from '../services/marketingApi';
import {
  PARAM_SOURCE_LABELS,
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

const MB = 1024 * 1024;

/** The header image is the one of step 1 ("¿Agregar imagen?"): JPG or PNG, up to 5 MB. */
const HEADER_IMAGE_TYPES = ['image/jpeg', 'image/png'];
const HEADER_IMAGE_MAX_MB = 5;

/** Video / PDF headers: the page has no way to attach them. */
const canUse = (t: WhatsAppTemplate) =>
  !t.unsupported_params && t.header_format !== 'VIDEO' && t.header_format !== 'DOCUMENT';

/** Template chosen when the list loads; Meta's sample template is not offered. */
const DEFAULT_TEMPLATE = 'mobilezone_promo_img';
const HIDDEN_TEMPLATES = new Set(['hello_world']);

/** Each placeholder in order takes the data of each client: {{1}} the name, the next ones the brand of the phone. */
const PARAM_SOURCES: ParamSource[] = ['NOMBRE', 'MARCA'];
const toParams = (names: string[]): TemplateParam[] => names.map((_, i) => ({ source: PARAM_SOURCES[i] ?? 'MARCA' }));

const keyOf = (t: WhatsAppTemplate) => `${t.name}|${t.language}`;

function sampleValue(param: TemplateParam, client: OrderClient | undefined): string {
  if (param.source === 'TEXTO') return param.texto?.trim() || '…';
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

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

interface Props {
  /** Selected clients with a mobile number. */
  recipients: OrderClient[];
  /** Image chosen in "1. ¿Agregar imagen?": the header of templates with media. */
  media?: MessageMedia | null;
}

/** "Enviar por WhatsApp Business": one approved template, sent by the server through Meta's Cloud API. */
export function WhatsAppApiSender({ recipients, media = null }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const templates = useQuery({ queryKey: [MARKETING_KEY, 'templates'], queryFn: marketingApi.templates, retry: false });
  const [selectedKey, setSelectedKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const total = recipients.length;

  const template = useMemo(() => templates.data?.find((t) => keyOf(t) === selectedKey), [templates.data, selectedKey]);
  const params = useMemo(() => toParams(template?.body_params ?? []), [template]);
  const needsImage = template?.header_format === 'IMAGE';
  const headerUpload = needsImage && media && HEADER_IMAGE_TYPES.includes(media.file.type) ? media.file : null;
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
        },
        headerUpload,
      ),
  });

  const send = async () => {
    if (!template) return setError('Elija una plantilla.');
    if (needsImage && !headerUpload)
      return setError('La plantilla lleva una imagen: agréguela en "1. ¿Agregar imagen?".');
    if (headerUpload && headerUpload.size > HEADER_IMAGE_MAX_MB * MB)
      return setError(`La imagen supera los ${HEADER_IMAGE_MAX_MB} MB que permite WhatsApp.`);
    if (total === 0) return setError('Seleccione al menos un cliente con celular.');
    setError(null);
    const ok = await confirm({
      title: 'Enviar por WhatsApp',
      message: (
        <>
          Se enviará la plantilla <strong>{template.name}</strong> a {recipients.length} cliente(s).
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

  return (
    <Card title="Enviar por WhatsApp Business">
      <p className="field-hint">
        WhatsApp solo permite iniciar conversaciones con plantillas aprobadas por Meta. Créelas en el administrador de
        WhatsApp y aparecerán aquí.
      </p>
      <Select
        label="Plantilla"
        placeholder={options.length ? 'Elija una plantilla' : 'No hay plantillas aprobadas'}
        options={options}
        value={selectedKey}
        onChange={(e) => choose(e.target.value)}
        hint={
          unsupported.length
            ? `No se pueden usar (llevan video, PDF o variables en el encabezado o botones): ${unsupported.join(', ')}.`
            : undefined
        }
      />

      {template && (
        <div className="wa-template">
          <div className="wa-bubble" aria-label="Vista previa de la plantilla">
            {template.header_format === 'TEXT' && template.header_text && <strong>{template.header_text}</strong>}
            {needsImage &&
              (headerUpload ? (
                <img src={media!.url} alt="Imagen del encabezado" className="message-media" />
              ) : (
                <span className="muted">[sin imagen: agréguela en el paso 1]</span>
              ))}
            <p>{fillTemplate(template, params, sample)}</p>
            {template.footer && <small className="muted">{template.footer}</small>}
          </div>
          <p className="muted crm-count">
            {total} destinatario(s) · costo aprox. {formatUsd(total * price)}
          </p>
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
