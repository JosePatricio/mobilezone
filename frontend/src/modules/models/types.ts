import type { Id, NamedRef, Timestamps } from '@/shared/types/api';

export interface DeviceModel extends Timestamps {
  id: Id;
  brand_id: Id;
  brand: NamedRef;
  nombre: string;
  descripcion: string | null;
  estado: boolean;
}

export interface DeviceModelRequest {
  brand_id: Id;
  nombre: string;
  descripcion: string | null;
  estado: boolean;
}
