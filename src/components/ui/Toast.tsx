import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';
type Toast = { id: number; type: ToastType; message: string };

type ToastContextValue = {
  push: (type: ToastType, message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((type: ToastType, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, message }]);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const config = {
    success: { icon: CheckCircle2, color: 'text-success-600', bg: 'bg-white', border: 'border-success-200' },
    error: { icon: AlertTriangle, color: 'text-danger-600', bg: 'bg-white', border: 'border-danger-200' },
    info: { icon: Info, color: 'text-brand-600', bg: 'bg-white', border: 'border-brand-200' },
  }[toast.type];

  const Icon = config.icon;

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border ${config.border} ${config.bg} shadow-soft p-3.5 animate-slide-in`}
    >
      <Icon size={18} className={`${config.color} mt-0.5 shrink-0`} />
      <p className="text-sm text-ink-700 flex-1">{toast.message}</p>
      <button onClick={onClose} className="text-ink-400 hover:text-ink-600 transition" aria-label="Cerrar">
        <X size={16} />
      </button>
    </div>
  );
}
