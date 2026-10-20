import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, ErrorState, Input, Loading, Select, useConfirm, useToast } from '@/shared/components';
import { getErrorMessage, toApiError } from '@/shared/services/apiError';
import { fullName } from '@/shared/utils/format';
import { MARKETING_KEY, marketingApi } from '../services/marketingApi';
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

const MB = 1024 * 1024;

/** File of each media header: the image / video of step 1 is used when its kind and type fit. */
const HEADER_FILES: Record<string, { accept: string; label: string; maxMb: number; kind?: MediaKind }> = {
  IMAGE: { accept: 'image/jpeg,image/png', label: 'Imagen del encabezado (JPG o PNG, máx. 5 MB)', maxMb: 5, kind: 'image' },
  VIDEO: { accept: 'video/mp4', label: 'Video del encabezado (MP4, máx. 10 MB)', maxMb: 10, kind: 'video' },
  DOCUMENT: { accept: 'application/pdf', label: 'PDF del encabezado (máx. 10 MB)', maxMb: 10 },
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

/** Same rule as the server (whatsapp_number): "0991234567" → 593991234567; 10 to 15 digits. */
function validNumber(value: string): boolean {
  let digits = value.replace(/\D/g, '');
  if (!value.trim().startsWith('+') && digits.startsWith('0')) digits = `593${digits.slice(1)}`;
  if (digits.length < 10 || digits.length > 15) return false;
  return !digits.startsWith('5939') || digits.length === 12;
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

interface Props {
  /** Selected clients with a mobile number. */
  recipients: OrderClient[];
  /** Image / video chosen in "1. ¿Agregar video o imagen?": the header of templates with media. */
  media?: MessageMedia | null;
}

/** "Enviar por WhatsApp Business": one approved template, sent by the server through Meta's Cloud API. */
export function WhatsAppApiSender({ recipients, media = null }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: [MARKETING_KEY, 'templates'], queryFn: marketingApi.templates, retry: false });
  const [selectedKey, setSelectedKey] = useState('');
  const [params, setParams] = useState<TemplateParam[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Numbers typed by hand (e.g. your own phone to test a template before sending it to clients).
  const [numbers, setNumbers] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const total = recipients.length + numbers.length;

  const addNumber = () => {
    const value = draft.trim();
    if (!value) return;
    if (!validNumber(value)) return setError(`"${value}" no es un celular válido (ej. 0991234567 o +593991234567).`);
    if (numbers.includes(value)) return setError('Ese número ya está en la lista.');
    setError(null);
    setNumbers((prev) => [...prev, value]);
    setDraft('');
  };

  const template = useMemo(
    () => templates.data?.find((t) => keyOf(t) === selectedKey),
    [templates.data, selectedKey],
  );
  const headerFile = template?.header_format ? HEADER_FILES[template.header_format] : undefined;
  // A file chosen here wins over the one of step 1.
  const stepMedia =
    headerFile?.kind && media?.kind === headerFile.kind && headerFile.accept.split(',').includes(media.file.type)
      ? media
      : null;
  const headerUpload = file ?? stepMedia?.file ?? null;
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (fileUrl && URL.revokeObjectURL(fileUrl)), [fileUrl]);
  const headerUrl = fileUrl ?? stepMedia?.url;
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
          numeros: numbers,
          parametros: params,
        },
        headerUpload,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MARKETING_KEY, 'campaigns'] }),
  });

  const send = async () => {
    if (!template) return setError('Elija una plantilla.');
    if (params.some((p) => p.source === 'TEXTO' && !p.texto?.trim())) return setError('Escriba el texto fijo.');
    if (headerFile && !headerUpload) return setError('La plantilla necesita un archivo para el encabezado.');
    if (headerFile && headerUpload && headerUpload.size > headerFile.maxMb * MB)
      return setError(`El archivo del encabezado supera los ${headerFile.maxMb} MB que permite WhatsApp.`);
    if (total === 0) return setError('Seleccione al menos un cliente con celular o escriba un número de prueba.');
    setError(null);
    const ok = await confirm({
      title: 'Enviar por WhatsApp',
      message: (
        <>
          Se enviará la plantilla <strong>{template.name}</strong> a {recipients.length} cliente(s)
          {numbers.length > 0 && ` y ${numbers.length} número(s) de prueba`}.
          <br />
          Costo aproximado: <strong>{formatUsd(total * price)}</strong> (
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
      <div className="wa-numbers">
        <div className="wa-numbers-add">
          <Input
            label="Números de prueba"
            placeholder="0991234567"
            inputMode="tel"
            value={draft}
            maxLength={20}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addNumber();
              }
            }}
          />
          <Button variant="secondary" onClick={addNumber}>
            Agregar
          </Button>
        </div>
        {numbers.length > 0 && (
          <ul className="wa-number-list">
            {numbers.map((n) => (
              <li key={n}>
                {n}
                <button type="button" aria-label={`Quitar ${n}`} onClick={() => setNumbers((prev) => prev.filter((x) => x !== n))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
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
              hint={
                file
                  ? undefined
                  : stepMedia
                    ? `Se usará "${stepMedia.file.name}" del paso 1; elija otro archivo para cambiarlo.`
                    : media && headerFile.kind
                      ? `El archivo del paso 1 no sirve para esta plantilla: elija ${headerFile.label.toLowerCase()}.`
                      : undefined
              }
            />
          )}

          <div className="wa-bubble" aria-label="Vista previa de la plantilla">
            {template.header_format === 'TEXT' && template.header_text && <strong>{template.header_text}</strong>}
            {headerFile &&
              (headerUrl && headerFile.kind === 'image' ? (
                <img src={headerUrl} alt="Imagen del encabezado" className="message-media" />
              ) : headerUrl && headerFile.kind === 'video' ? (
                <video src={headerUrl} className="message-media" controls aria-label="Video del encabezado" />
              ) : (
                <span className="muted">[{headerUpload ? headerUpload.name : 'archivo del encabezado'}]</span>
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
