import type { CatalogItem, CatalogRequest } from '@/shared/components/CatalogPage';

export interface Brand extends CatalogItem {
  /** Number of models assigned to the brand. */
  modelos_count: number;
}
export type BrandRequest = CatalogRequest;
