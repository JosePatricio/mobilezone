import { QueryClient } from '@tanstack/react-query';
import type { ApiError } from './apiError';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const status = (error as ApiError)?.status ?? 0;
          // Never retry client errors (401/403/404/...).
          return status >= 500 && failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}
