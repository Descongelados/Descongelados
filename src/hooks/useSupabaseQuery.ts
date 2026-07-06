import { useEffect, useState } from 'react';
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
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, JSON.stringify(options)]);

  return { data, error, loading, refetch };
}
