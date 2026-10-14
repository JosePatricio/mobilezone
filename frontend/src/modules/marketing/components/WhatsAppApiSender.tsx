import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button, Card, ErrorState, Input, Loading, Select, useConfirm, useToast } from '@/shared/components';
import { getErrorMessage, toApiError } from '@/shared/services/apiError';
import { fullName } from '@/shared/utils/format';
import { MARKETING_KEY, marketingApi } from '../services/marketingApi';
import {
  PARAM_SOURCE_LABELS,
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

const HEADER_FILES: Record<string, { accept: string; label: string }> = {
  IMAGE: { accept: 'image/jpeg,image/png', label: 'Imagen del encabezado (JPG o PNG, máx. 5 MB)' },
  VIDEO: { accept: 'video/mp4', label: 'Video del encabezado (MP4, máx. 10 MB)' },
  DOCUMENT: { accept: 'application/pdf', label: 'PDF del encabezado (máx. 10 MB)' },
};

const SOURCE_OPTIONS = (Object.keys(PARAM_SOURCE_LABELS) as ParamSource[]).map((s) => ({
  value: s,
  label: PARAM_SOURCE_LABELS[s],
}));

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
}

/** "Enviar por WhatsApp Business": one approved template, sent by the server through Meta's Cloud API. */
export function WhatsAppApiSender({ recipients }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: [MARKETING_KEY, 'templates'], queryFn: marketingApi.templates, retry: false });
  const [selectedKey, setSelectedKey] = useState('');
  const [params, setParams] = useState<TemplateParam[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const template = useMemo(
    () => templates.data?.find((t) => keyOf(t) === selectedKey),
    [templates.data, selectedKey],
  );
  const headerFile = template?.header_format ? HEADER_FILES[template.header_format] : undefined;
  const price = template ? (PRICE_PER_MESSAGE[template.category] ?? PRICE_PER_MESSAGE.MARKETING) : 0;

  const choose = (key: string) => {
    const next = templates.data?.find((t) => keyOf(t) === key);
    setSelectedKey(key);
    setFile(null);
    setError(null);
    // Sensible start: {{1}} = name of the client, the rest = brand of the phone.
    setParams((next?.body_params ?? []).map((_, i) => ({ source: i === 0 ? 'NOMBRE' : 'MARCA' })));
  };
  const setParam = (index: number, value: TemplateParam) =>
    setParams((prev) => prev.map((p, i) => (i === index ? value : p)));

  const mutation = useMutation({
    mutationFn: () =>
      marketingApi.createCampaign(
        {
          plantilla: template!.name,
          idioma: template!.language,
          cliente_ids: recipients.map((c) => c.cliente_id),
          parametros: params,
        },
        file,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MARKETING_KEY, 'campaigns'] }),
  });

  const send = async () => {
    if (!template) return setError('Elija una plantilla.');
    if (params.some((p) => p.source === 'TEXTO' && !p.texto?.trim())) return setError('Escriba el texto fijo.');
    if (headerFile && !file) return setError('La plantilla necesita un archivo para el encabezado.');
    if (recipients.length === 0) return setError('Seleccione al menos un cliente con celular.');
    setError(null);
    const ok = await confirm({
      title: 'Enviar por WhatsApp',
      message: (
        <>
          Se enviará la plantilla <strong>{template.name}</strong> a {recipients.length} cliente(s).
          <br />
          Costo aproximado: <strong>{formatUsd(recipients.length * price)}</strong> (
          {formatUsd(price)} por mensaje de {template.category.toLowerCase()}; el número de prueba es gratis).
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
  const options = all.filter((t) => !t.unsupported_params).map((t) => ({ value: keyOf(t), label: `${t.name} (${t.language})` }));
  const unsupported = all.filter((t) => t.unsupported_params).map((t) => t.name);
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
            ? `No se pueden usar (tienen variables en el encabezado o botones): ${unsupported.join(', ')}.`
            : undefined
        }
      />

      {template && (
        <div className="wa-template">
          {template.body_params.map((name, i) => (
            <div key={name} className="wa-param">
              <Select
                label={`Variable {{${name}}}`}
                options={SOURCE_OPTIONS}
                value={params[i]?.source ?? 'NOMBRE'}
                onChange={(e) => setParam(i, { source: e.target.value as ParamSource })}
              />
              {params[i]?.source === 'TEXTO' && (
                <Input
                  aria-label={`Texto de {{${name}}}`}
                  value={params[i].texto ?? ''}
                  maxLength={500}
                  onChange={(e) => setParam(i, { source: 'TEXTO', texto: e.target.value })}
                />
              )}
            </div>
          ))}

          {headerFile && (
            <Input
              type="file"
              label={headerFile.label}
              accept={headerFile.accept}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          )}

          <div className="wa-bubble" aria-label="Vista previa de la plantilla">
            {template.header_format === 'TEXT' && template.header_text && <strong>{template.header_text}</strong>}
            {headerFile && <span className="muted">[{file ? file.name : 'archivo del encabezado'}]</span>}
            <p>{fillTemplate(template, params, sample)}</p>
            {template.footer && <small className="muted">{template.footer}</small>}
          </div>
          <p className="muted crm-count">
            {recipients.length} destinatario(s) · costo aprox. {formatUsd(recipients.length * price)}
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
