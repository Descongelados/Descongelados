import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type QueryOptions = {
  select?: string;
  eq?: { column: string; value: unknown };
  order?: { column: string; ascending?: boolean };
  limit?: number;
};

export function useSupabaseQuery<T>(table: string, options: QueryOptions = {}) {
  const [data, setData] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Serializar las opciones una sola vez por render y guardarlo en un ref.
  // El useEffect solo se re-ejecuta cuando la cadena serializada cambia,
  // pero sin poner JSON.stringify() directamente en el array de dependencias
  // (lo que forzaría una nueva string en cada render aunque el valor sea igual).
  const serialized = JSON.stringify({ table, ...options });
  const prevRef = useRef<string>(serialized);

  const refetch = async () => {
    setLoading(true);
    setError(null);
    let query = supabase.from(table).select(options.select ?? '*');
    if (options.eq) query = query.eq(options.eq.column, options.eq.value);
    if (options.order) query = query.order(options.order.column, { ascending: options.order.ascending ?? false });
    if (options.limit) query = query.limit(options.limit);
    const { data: rows, error: err } = await query;
    if (err) setError(err.message);
    setData((rows as T[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (prevRef.current === serialized && data !== null) return;
    prevRef.current = serialized;
    refetch();
    // refetch se estabiliza con el closure correcto en cada render;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);

  return { data, error, loading, refetch };
}
