import { createCrudApi } from '@/shared/services/crudApi';
import type { Category, CategoryRequest } from '../types';

export const CATEGORIES_KEY = 'categories';
export const categoryApi = createCrudApi<Category, CategoryRequest>('/categories');
