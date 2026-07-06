import { ReactNode } from 'react';

type Variant = 'neutral' | 'success' | 'warning' | 'danger' | 'brand' | 'accent';

const variants: Record<Variant, string> = {
  neutral: 'bg-ink-100 text-ink-600',
  success: 'bg-success-100 text-success-700',
  warning: 'bg-warning-100 text-warning-700',
  danger: 'bg-danger-100 text-danger-700',
  brand: 'bg-brand-100 text-brand-700',
  accent: 'bg-accent-100 text-accent-700',
};

export default function Badge({ variant = 'neutral', children }: { variant?: Variant; children: ReactNode }) {
  return <span className={`badge ${variants[variant]}`}>{children}</span>;
}
