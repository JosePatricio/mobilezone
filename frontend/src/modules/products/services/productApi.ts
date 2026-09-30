import { createCrudApi } from '@/shared/services/crudApi';
import { deleteImage, uploadImage } from '@/shared/services/uploads';
import type { Id } from '@/shared/types/api';
import type { Product, ProductRequest } from '../types';

export const PRODUCTS_KEY = 'products';

/** Stock is managed per branch in the Inventario module (inventoryApi). */
export const productApi = {
  ...createCrudApi<Product, ProductRequest>('/products'),
  uploadImage: (id: Id, file: File) => uploadImage<Product>(`/products/${id}/image`, file),
  removeImage: (id: Id) => deleteImage<Product>(`/products/${id}/image`),
};
