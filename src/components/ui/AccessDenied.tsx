import { LucideIcon, ShieldOff } from 'lucide-react';

type Props = {
  icon?: LucideIcon;
  action?: string;
};

export default function AccessDenied({ action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-50 text-danger-400 mb-4">
        <ShieldOff size={28} />
      </div>
      <p className="text-base font-semibold text-ink-800">Acceso restringido</p>
      <p className="mt-1 text-sm text-ink-500 max-w-xs">
        {action
          ? `No tienes permiso para ${action}.`
          : 'No tienes permiso para realizar esta acción.'}
      </p>
    </div>
  );
}
