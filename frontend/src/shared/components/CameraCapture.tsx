import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { MAX_IMAGE_BYTES } from './Images';

/** Longest side of a captured photo (keeps it well under the 2 MB limit). */
const MAX_SIDE = 1600;

/** The camera can be used (secure context: https or localhost). */
export const cameraSupported = () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

/** Current frame of the video as a JPEG file (lower quality if it would exceed the size limit). */
async function captureFrame(video: HTMLVideoElement): Promise<File> {
  const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth || 1, video.videoHeight || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((video.videoWidth || 640) * scale);
  canvas.height = Math.round((video.videoHeight || 480) * scale);
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.7, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && (blob.size <= MAX_IMAGE_BYTES || quality === 0.5)) {
      return new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
    }
  }
  throw new Error('No se pudo tomar la foto.');
}

interface Props {
  /** Photos that can still be taken (the parent closes the camera when none is left); omitted for a single photo. */
  remaining?: number;
  onCapture: (file: File) => void;
  onClose: () => void;
  /** The camera is not available (permission denied, no camera, ...). */
  onUnavailable: (message: string) => void;
}

/** Live camera (rear one on phones): each photo taken is handed to `onCapture`. */
export function CameraCapture({ remaining, onCapture, onClose, onUnavailable }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(async (media) => {
        if (cancelled) return media.getTracks().forEach((t) => t.stop());
        stream = media;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = media;
        await video.play().catch(() => undefined);
        setReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const denied = err instanceof DOMException && err.name === 'NotAllowedError';
        onUnavailable(denied ? 'Permiso de cámara denegado. Puede elegir una imagen.' : 'No se pudo abrir la cámara. Puede elegir una imagen.');
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const take = async () => {
    if (!videoRef.current) return;
    setTaking(true);
    try {
      onCapture(await captureFrame(videoRef.current));
    } catch {
      onUnavailable('No se pudo tomar la foto. Puede elegir una imagen.');
    } finally {
      setTaking(false);
    }
  };

  return (
    <div className="camera-capture" role="group" aria-label="Cámara">
      <video ref={videoRef} className="camera-video" playsInline muted autoPlay />
      {!ready && <p className="muted camera-status">Abriendo la cámara…</p>}
      <div className="camera-actions">
        <Button onClick={() => void take()} disabled={!ready} loading={taking}>
          {remaining === undefined
            ? 'Tomar foto'
            : `Tomar foto (${remaining} ${remaining === 1 ? 'restante' : 'restantes'})`}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {remaining === undefined ? 'Cancelar' : 'Listo'}
        </Button>
      </div>
    </div>
  );
}
