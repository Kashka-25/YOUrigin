import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100%-1.5rem)] ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-2xl border border-line bg-card p-0 text-ink shadow-xl backdrop:bg-black/30`}
      aria-label={title}
    >
      {open && (
        <div className="max-h-[85dvh] overflow-y-auto p-5 md:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="font-serif text-2xl">{title}</h2>
            <button type="button" className="btn-ghost -mr-2 -mt-1" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

// ---- confirm dialogs -------------------------------------------------------

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })),
    [],
  );
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title ?? ''}>
        <div className="text-sm leading-relaxed text-ink-2">{state?.message}</div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn" onClick={() => close(false)}>
            Cancel
          </button>
          <button type="button" className={state?.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)} data-autofocus>
            {state?.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmCtx);
}
