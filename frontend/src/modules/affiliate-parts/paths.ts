import type { Id } from '@/shared/types/api';

/** Public catalog of the affiliate spare parts (no login). */
export const PUBLIC_CATALOG_PATH = '/repuestos';

/** Public page of one part: anyone can open it (shareable link). */
export const publicPartPath = (id: Id | string) => `${PUBLIC_CATALOG_PATH}/${id}`;
