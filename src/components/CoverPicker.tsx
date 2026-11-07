import { useId, useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { AssetImage } from './AssetImage';
import { IMAGE_ACCEPT, saveImage } from '../db/assets';

/**
 * Add, replace or remove a cover image. The picture is shrunk and kept in the
 * private library on this device; `onChange` gets the new asset id (or
 * undefined). Removing an old picture from storage is the caller's job, once
 * nothing uses it.
 */
export function CoverPicker({ value, onChange, label = 'Cover image', alt = '' }: { value?: string; onChange: (assetId: string | undefined) => void | Promise<void>; label?: string; alt?: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const { asset } = await saveImage(file);
      await onChange(asset.id);
    } catch {
      setError('That picture couldn’t be added. Try another image file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cover-picker">
      <label className="label" htmlFor={id}>{label}</label>
      <input
        ref={input}
        id={id}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void pick(file);
        }}
      />
      {value ? (
        <div className="overflow-hidden rounded-xl border border-line bg-paper-2">
          <AssetImage id={value} alt={alt} className="aspect-[16/9] w-full object-cover" />
          <div className="flex flex-wrap gap-1 p-1.5">
            <button type="button" className="btn-ghost text-sm" disabled={busy} onClick={() => input.current?.click()}><RefreshCw size={15} /> Replace</button>
            <button type="button" className="btn-ghost text-sm" disabled={busy} onClick={() => void onChange(undefined)}><Trash2 size={15} /> Remove</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm text-ink-2 transition-colors hover:bg-paper-2"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={20} aria-hidden="true" />
          {busy ? 'Preparing picture…' : 'Add a cover image'}
        </button>
      )}
      {error && <p className="mt-1 text-xs text-seed" role="alert">{error}</p>}
    </div>
  );
}
