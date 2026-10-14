import type { CSSProperties } from 'react';
import type { Line, Run } from '../message';
import type { Channel, MessageMedia } from '../types';

const SIZE: Record<NonNullable<Run['size']>, string> = { small: '0.8em', normal: '1em', large: '1.35em' };

function runStyle(run: Run): CSSProperties {
  return {
    fontWeight: run.bold ? 700 : undefined,
    fontStyle: run.italic ? 'italic' : undefined,
    textDecoration: run.strike ? 'line-through' : undefined,
    fontSize: run.size ? SIZE[run.size] : undefined,
  };
}

/** The message as the client would see it (chat bubble), with the image / video on top. */
export function MessagePreview({ lines, media, channel }: { lines: Line[]; media: MessageMedia | null; channel: Channel }) {
  return (
    <div className={`message-bubble message-bubble-${channel.toLowerCase()}`} aria-label="Vista previa del mensaje">
      {media &&
        (media.kind === 'image' ? (
          <img src={media.url} alt="Imagen del mensaje" className="message-media" />
        ) : (
          <video src={media.url} className="message-media" controls aria-label="Video del mensaje" />
        ))}
      {lines.map((line, i) => (
        <p key={i} className="message-line">
          {line.length === 0
            ? ' '
            : line.map((run, j) => (
                <span key={j} style={runStyle(run)}>
                  {run.text}
                </span>
              ))}
        </p>
      ))}
    </div>
  );
}
