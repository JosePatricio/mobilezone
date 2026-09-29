import { createCrudApi } from '@/shared/services/crudApi';
import { http } from '@/shared/services/httpClient';
import type { Id, Page } from '@/shared/types/api';
import type {
  CreateProductRequest,
  Product,
  ProductStock,
  StockAdjustmentRequest,
  StockMovement,
  UpdateProductRequest,
} from '../types';

export const PRODUCTS_KEY = 'products';

const crud = createCrudApi<Product, CreateProductRequest | UpdateProductRequest>('/products');

export const productApi = {
  ...crud,
  getStock: (id: Id) => http.get<ProductStock>(`/products/${id}/stock`).then((r) => r.data),
  adjustStock: (id: Id, body: StockAdjustmentRequest) =>
    http.patch<ProductStock>(`/products/${id}/stock`, body).then((r) => r.data),
  stockMovements: (id: Id, page = 1) =>
    http.get<Page<StockMovement>>(`/products/${id}/stock-movements`, { params: { page, size: 10 } }).then((r) => r.data),
};
