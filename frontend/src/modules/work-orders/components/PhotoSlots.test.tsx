import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { photoChanges, PhotoSlots, type PhotoChanges } from './PhotoSlots';

function Harness({ onValue }: { onValue?: (v: PhotoChanges) => void }) {
  const [value, setValue] = useState(photoChanges());
  return (
    <PhotoSlots
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
    />
  );
}

const stop = vi.fn();
const getUserMedia = vi.fn();

beforeAll(() => {
  // jsdom has no camera, media playback, canvas nor object URLs.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback) {
    callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
  });
  URL.createObjectURL = vi.fn((file: Blob) => `blob:${(file as File).name}-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  stop.mockClear();
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop }] });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
});

afterAll(() => {
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
});

describe('PhotoSlots', () => {
  it('Agregar opens the camera and each photo taken fills the next slot as a preview', async () => {
    const values: PhotoChanges[] = [];
    render(<Harness onValue={(v) => values.push(v)} />);
    expect(screen.getAllByRole('button', { name: '+ Agregar foto' })).toHaveLength(3);

    await userEvent.click(screen.getAllByRole('button', { name: '+ Agregar foto' })[0]);
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    const take = await screen.findByRole('button', { name: /Tomar foto \(3 restantes\)/ });
    await vi.waitFor(() => expect(take).toBeEnabled());

    await userEvent.click(take);
    expect(await screen.findByRole('img', { name: 'Foto nueva 1' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '+ Agregar foto' })).toHaveLength(2);
    expect(values[values.length - 1].added[0].type).toBe('image/jpeg');

    // The camera stays open for the next ones and closes when the 3 slots are full.
    await userEvent.click(screen.getByRole('button', { name: /Tomar foto \(2 restantes\)/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Tomar foto \(1 restante\)/ }));
    expect(await screen.findByRole('img', { name: 'Foto nueva 3' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Cámara' })).not.toBeInTheDocument();
    expect(stop).toHaveBeenCalled();
  });

  it('Listo closes the camera', async () => {
    render(<Harness />);
    await userEvent.click(screen.getAllByRole('button', { name: '+ Agregar foto' })[0]);
    await userEvent.click(await screen.findByRole('button', { name: 'Listo' }));
    expect(screen.queryByRole('group', { name: 'Cámara' })).not.toBeInTheDocument();
    await vi.waitFor(() => expect(stop).toHaveBeenCalled());
  });

  it('without camera permission it explains and offers choosing an image', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    render(<Harness />);
    await userEvent.click(screen.getAllByRole('button', { name: '+ Agregar foto' })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Permiso de cámara denegado');
    expect(screen.getByRole('button', { name: 'o elegir una imagen' })).toBeInTheDocument();
  });
});
