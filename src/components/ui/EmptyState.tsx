import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
};

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400 mb-4">
        <Icon size={26} />
      </div>
      <h3 className="text-base font-semibold text-ink-800">{title}</h3>
      {description && <p className="mt-1 text-sm text-ink-500 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
