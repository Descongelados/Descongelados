import { Loader2 } from 'lucide-react';

export default function Spinner({ size = 18, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />;
}

export function FullPageLoader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-ink-400">
      <Spinner size={28} className="text-brand-500" />
      <p className="mt-3 text-sm">{label}</p>
    </div>
  );
}
