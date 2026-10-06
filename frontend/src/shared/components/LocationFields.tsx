import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';
import { http } from '@/shared/services/httpClient';
import { Select } from './Select';

export interface Province {
  nombre: string;
  ciudades: string[];
}

/** Provinces of Ecuador with their cities, served by the API (single source). */
export function useProvinces() {
  return useQuery({
    queryKey: ['locations', 'provinces'],
    queryFn: () => http.get<Province[]>('/locations/provinces').then((r) => r.data),
    staleTime: Infinity,
  });
}

interface Props {
  // Loosely typed so it can be reused by any form with `provincia` and `ciudad` fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: UseFormSetValue<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>;
  provincia: string | null | undefined;
  /** Current city: re-applied once the options load, so a preselected value is shown. */
  ciudad?: string | null;
}

/** Provincia select + Ciudad select filtered by the selected province (e.g. Pichincha → Quito). */
export function LocationFields({ register, setValue, errors, provincia, ciudad }: Props) {
  const provinces = useProvinces();
  const loaded = Boolean(provinces.data);

  // A <select> cannot show a value before its <option> exists: re-apply the values once loaded.
  useEffect(() => {
    if (!loaded) return;
    if (provincia) setValue('provincia', provincia);
    if (ciudad) setValue('ciudad', ciudad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const cities = provinces.data?.find((p) => p.nombre === provincia)?.ciudades ?? [];
  const message = (field: string) => errors[field]?.message as string | undefined;

  return (
    <>
      <Select
        label="Provincia"
        options={(provinces.data ?? []).map((p) => ({ value: p.nombre, label: p.nombre }))}
        placeholder={provinces.isLoading ? 'Cargando…' : 'Seleccione…'}
        error={message('provincia')}
        {...register('provincia', { onChange: () => setValue('ciudad', '') })}
      />
      <Select
        label="Ciudad"
        options={cities.map((c) => ({ value: c, label: c }))}
        placeholder={provincia ? 'Seleccione…' : 'Seleccione primero la provincia'}
        disabled={!provincia}
        error={message('ciudad')}
        {...register('ciudad')}
      />
    </>
  );
}
