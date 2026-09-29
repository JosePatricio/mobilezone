import type { Id, Money, Timestamps } from '@/shared/types/api';

export interface SparePart extends Timestamps {
  id: Id;
  tipo: string;
  ubicacion: boolean;
  precio: Money;
  garantia: boolean;
  estado: boolean;
}

export interface SparePartRequest {
  tipo: string;
  ubicacion: boolean;
  precio: Money;
  garantia: boolean;
  estado: boolean;
}
