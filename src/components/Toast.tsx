import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  message: string;
  undo?: () => void | Promise<void>;
}

type ToastFn = (message: string, opts?: { undo?: () => void | Promise<void> }) => void;

const ToastCtx = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  const toast = useCallback<ToastFn>((message, opts) => {
    const id = next.current++;
    setToasts((t) => [...t.slice(-2), { id, message, undo: opts?.undo }]);
    setTimeout(() => dismiss(id), opts?.undo ? 8000 : 3500);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div
        className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-md items-center gap-4 rounded-full bg-ink px-5 py-2.5 text-sm text-paper shadow-lg"
          >
            <span>{t.message}</span>
            {t.undo && (
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={async () => {
                  dismiss(t.id);
                  await t.undo!();
                }}
              >
                Undo
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
