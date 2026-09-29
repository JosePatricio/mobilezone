/** Money values are sent by the API as decimal strings (e.g. "10.50") to keep precision. */
export type Money = string;

export type Id = number;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface Timestamps {
  created_at: string;
  updated_at: string;
}

export interface NamedRef {
  id: Id;
  nombre: string;
}

export interface UserRef {
  id: Id;
  nombre: string;
  apellido: string;
  email: string;
}
