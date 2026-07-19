export const formatCurrency = (value: number): string => {
  const n = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
};

export const formatNumber = (value: number, decimals = 2): string => {
  const n = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
};

// Parse a date string safely: plain YYYY-MM-DD is anchored to noon local time
// to avoid UTC midnight rolling back one day in negative-offset timezones (e.g. CDT UTC-6).
function parseDateSafe(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(value + 'T12:00:00')
    : new Date(value);
}

export const formatDate = (value: string | Date | null): string => {
  if (!value) return '—';
  const d = typeof value === 'string' ? parseDateSafe(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
};

export const formatDateTime = (value: string | Date | null): string => {
  if (!value) return '—';
  const d = typeof value === 'string' ? parseDateSafe(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

export const toDateInputValue = (value: string | Date | null): string => {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
};

export const fromDateInputValue = (value: string): string => {
  if (!value) return new Date().toISOString();
  const d = new Date(value + 'T12:00:00');
  return d.toISOString();
};
