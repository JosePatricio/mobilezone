import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, ErrorState, Loading, Logo } from '@/shared/components';
import { getErrorMessage, toApiError } from '@/shared/services/apiError';
import { formatDate } from '@/shared/utils/format';
import { RouletteWheel, SPIN_MS, rotationFor } from '../components/RouletteWheel';
import { publicRouletteApi } from '../services/marketingApi';
import type { PublicRoulette } from '../types';

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The wheel of one client, opened from the link of the WhatsApp message (no login). One spin per link. */
export function PublicRoulettePage() {
  const token = useParams().token ?? '';
  // Opening the page records the visit: only once, never refetched.
  const query = useQuery({
    queryKey: ['public-roulette', token],
    queryFn: () => publicRouletteApi.get(token),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<PublicRoulette | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const play = useMutation({ mutationFn: () => publicRouletteApi.play(token) });

  const spin = async () => {
    setError(null);
    try {
      const played = await play.mutateAsync();
      const duration = reducedMotion() ? 0 : SPIN_MS;
      setSpinning(duration > 0);
      setRotation(rotationFor(played.resultado ?? 0, played.items.length, 6, Math.random() - 0.5));
      timer.current = window.setTimeout(() => {
        setSpinning(false);
        setResult(played);
      }, duration);
    } catch (err) {
      setError(getErrorMessage(err));
      query.refetch();
    }
  };

  const notFound = query.isError && toApiError(query.error).status === 404;
  const roulette = result ?? query.data;
  // Already played before opening the page: the wheel shows where it stopped.
  const stopped = !result && roulette?.estado === 'JUGADO' && roulette.resultado !== null;
  const shownRotation = stopped ? rotationFor(roulette!.resultado!, roulette!.items.length, 0) : rotation;

  return (
    <div className="public-page">
      <div className="public-card roulette-public">
        <div className="app-brand">
          <Logo />
        </div>
        {query.isLoading ? (
          <Loading />
        ) : notFound ? (
          <Card title="Enlace no válido">
            <p className="muted">El enlace no corresponde a ninguna ruleta.</p>
          </Card>
        ) : query.isError || !roulette ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <Card title={roulette.nombre}>
            <p className="muted roulette-validity">
              Válida del {formatDate(roulette.fecha_inicio)} al {formatDate(roulette.fecha_fin)}
            </p>
            <div className="roulette-stage">
              <RouletteWheel items={roulette.items} rotation={shownRotation} spinning={spinning} size={320} />
            </div>

            {roulette.estado === 'DISPONIBLE' && !spinning && !result && (
              <Button className="roulette-spin" onClick={spin} loading={play.isPending}>
                ¡Girar la ruleta!
              </Button>
            )}
            {spinning && <p className="roulette-message">Girando…</p>}
            {roulette.estado === 'NO_INICIADA' && (
              <p className="roulette-message">La ruleta estará disponible desde el {formatDate(roulette.fecha_inicio)}.</p>
            )}
            {roulette.estado === 'VENCIDA' && <p className="roulette-message">Esta ruleta ya no está vigente.</p>}
            {roulette.estado === 'JUGADO' && !spinning && <Outcome roulette={roulette} justPlayed={Boolean(result)} />}
            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

function Outcome({ roulette, justPlayed }: { roulette: PublicRoulette; justPlayed: boolean }) {
  const item = roulette.resultado !== null ? roulette.items[roulette.resultado] : undefined;
  return (
    <div className={`roulette-outcome ${roulette.gano ? 'roulette-won' : ''}`} role="status">
      {item?.imagen_url && <img src={item.imagen_url} alt={item.nombre} />}
      {roulette.gano ? (
        <>
          <strong>{justPlayed ? '¡Felicidades! Ganaste' : 'Ganaste'}: {item?.nombre}</strong>
          <span>Muestra este mensaje en el local para reclamar tu premio.</span>
        </>
      ) : (
        <>
          <strong>{item?.nombre ?? 'Sin premio'}</strong>
          <span>Esta vez no hubo premio. ¡Gracias por participar!</span>
        </>
      )}
      {!justPlayed && <small className="muted">Este enlace ya se usó.</small>}
    </div>
  );
}
