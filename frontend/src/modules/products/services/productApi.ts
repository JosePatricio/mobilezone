import { createCrudApi } from '@/shared/services/crudApi';
import { http } from '@/shared/services/httpClient';
import { deleteImage, uploadImage } from '@/shared/services/uploads';
import type { Id, Page } from '@/shared/types/api';
import type { Product, ProductRequest, ProductStock, StockAdjustmentRequest, StockMovement } from '../types';

export const PRODUCTS_KEY = 'products';

export const productApi = {
  ...createCrudApi<Product, ProductRequest>('/products'),
  uploadImage: (id: Id, file: File) => uploadImage<Product>(`/products/${id}/image`, file),
  removeImage: (id: Id) => deleteImage<Product>(`/products/${id}/image`),
  getStock: (id: Id) => http.get<ProductStock>(`/products/${id}/stock`).then((r) => r.data),
  adjustStock: (id: Id, body: StockAdjustmentRequest) =>
    http.patch<ProductStock>(`/products/${id}/stock`, body).then((r) => r.data),
  stockMovements: (id: Id, page = 1) =>
    http.get<Page<StockMovement>>(`/products/${id}/stock-movements`, { params: { page, size: 10 } }).then((r) => r.data),
};
