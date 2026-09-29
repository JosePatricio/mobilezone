import { createCrudApi } from '@/shared/services/crudApi';
import type { SparePart, SparePartRequest } from '../types';

export const SPARE_PARTS_KEY = 'spare-parts';
export const sparePartApi = createCrudApi<SparePart, SparePartRequest>('/spare-parts');
