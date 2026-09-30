import { http } from './httpClient';

/** Uploads an image as multipart/form-data (field "file") with PUT. */
export function uploadImage<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  // Explicit multipart header: with the default JSON header axios would serialize the FormData as JSON.
  return http.put<T>(url, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
}

export function deleteImage<T>(url: string): Promise<T> {
  return http.delete<T>(url).then((r) => r.data);
}

/** Applies the image chosen in an ImageField after the entity was saved. */
export async function applyImageSelection(
  selection: { file: File | null; remove: boolean },
  upload: (file: File) => Promise<unknown>,
  remove: () => Promise<unknown>,
): Promise<void> {
  if (selection.file) await upload(selection.file);
  else if (selection.remove) await remove();
}
