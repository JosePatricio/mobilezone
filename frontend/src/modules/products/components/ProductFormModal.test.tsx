import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import type { Product } from '../types';
import { ProductFormModal } from './ProductFormModal';

const product = {
  id: 7,
  category_id: 1,
  category: { id: 1, nombre: 'Fundas' },
  supplier_id: null,
  supplier: null,
  sku: 'FUN-1',
  nombre: 'Funda',
  descripcion: null,
  precio_venta: '5.00',
  precio_costo: '2.00',
  precio_mayor: '4.00',
  minimo_recomendado: 3,
  stock: 1,
  imagen_url: null,
  estado: true,
} as Product;

function renderForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  renderWithProviders(
    <ProductFormModal
      product={product}
      categoryOptions={[{ value: 1, label: 'Fundas' }]}
      supplierOptions={[]}
      onClose={() => undefined}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

describe('ProductFormModal', () => {
  it('edits the recommended minimum (cantidad) and sends it as a number', async () => {
    const onSubmit = renderForm();
    const minimum = screen.getByLabelText(/Mínimo recomendado \(cantidad\)/);
    expect(minimum).toHaveValue(3);
    await userEvent.clear(minimum);
    await userEvent.type(minimum, '8');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ sku: 'FUN-1', minimo_recomendado: 8 });
  });

  it('rejects a negative or decimal minimum', async () => {
    const onSubmit = renderForm();
    const minimum = screen.getByLabelText(/Mínimo recomendado \(cantidad\)/);
    await userEvent.clear(minimum);
    await userEvent.type(minimum, '-2');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Mínimo 0')).toBeInTheDocument();
    await userEvent.clear(minimum);
    await userEvent.type(minimum, '1.5');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Debe ser entero')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  describe('Imagen: tomar foto', () => {
    const stop = vi.fn();

    beforeAll(() => {
      // jsdom has no camera, media playback, canvas nor object URLs.
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback) {
        callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
      });
      URL.createObjectURL = vi.fn(() => 'blob:foto');
      URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    });

    it('takes the product photo with the camera and sends it as the image', async () => {
      const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
      Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
      const onSubmit = renderForm();

      await userEvent.click(screen.getByRole('button', { name: 'Tomar foto' }));
      expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      const camera = screen.getByRole('group', { name: 'Cámara' });
      const take = within(camera).getByRole('button', { name: 'Tomar foto' });
      await vi.waitFor(() => expect(take).toBeEnabled());
      await userEvent.click(take);

      // The camera closes (stopping the stream) and the photo is the preview.
      await vi.waitFor(() => expect(screen.queryByRole('group', { name: 'Cámara' })).not.toBeInTheDocument());
      expect(stop).toHaveBeenCalled();
      expect(screen.getByRole('img', { name: 'Imagen' })).toHaveAttribute('src', 'blob:foto');

      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
      const image = onSubmit.mock.calls[0][1];
      expect(image.remove).toBe(false);
      expect(image.file.type).toBe('image/jpeg');
    });

    it('without camera access the phone camera opens through the file input, and a file can still be uploaded', async () => {
      renderForm();
      const capture = screen.getByLabelText('Tomar foto: Imagen');
      expect(capture).toHaveAttribute('capture', 'environment');
      const click = vi.spyOn(capture, 'click');
      await userEvent.click(screen.getByRole('button', { name: 'Tomar foto' }));
      expect(click).toHaveBeenCalled();
      expect(screen.queryByRole('group', { name: 'Cámara' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Subir imagen' })).toBeInTheDocument();
    });

    it('shows why when the camera permission is denied', async () => {
      const getUserMedia = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
      Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
      renderForm();
      await userEvent.click(screen.getByRole('button', { name: 'Tomar foto' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Permiso de cámara denegado');
    });
  });
});
