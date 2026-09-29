import { createCrudApi } from '@/shared/services/crudApi';
import type { Brand, BrandRequest } from '../types';

export const BRANDS_KEY = 'brands';
export const brandApi = createCrudApi<Brand, BrandRequest>('/brands');
