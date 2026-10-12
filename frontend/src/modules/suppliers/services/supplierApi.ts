import { createCrudApi } from '@/shared/services/crudApi';
import type { Supplier, SupplierRequest } from '../types';

export const SUPPLIERS_KEY = 'suppliers';
export const supplierApi = createCrudApi<Supplier, SupplierRequest>('/suppliers');
