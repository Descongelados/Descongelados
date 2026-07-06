import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

type StatCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'accent' | 'neutral';
  hint?: string;
  trend?: { value: string; direction: 'up' | 'down' };
};

const tones = {
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-600',
  danger: 'bg-danger-50 text-danger-600',
  accent: 'bg-accent-50 text-accent-600',
  neutral: 'bg-ink-100 text-ink-600',
};

export default function StatCard({ label, value, icon: Icon, tone = 'brand', hint, trend }: StatCardProps) {
  return (
    <div className="card p-5 hover:shadow-soft transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon size={20} />
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 text-xs font-semibold ${
              trend.direction === 'up' ? 'text-success-600' : 'text-danger-600'
            }`}
          >
            {trend.direction === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {trend.value}
          </div>
        )}
      </div>
      <p className="mt-4 text-2xl font-bold text-ink-900 tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-ink-500">{label}</p>
      {hint && <p className="mt-2 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}
