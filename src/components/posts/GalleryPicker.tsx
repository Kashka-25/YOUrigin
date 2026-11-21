import { useState } from 'react';
import { Film, Play } from 'lucide-react';
import { Modal } from '../Modal';
import { AssetImage } from '../AssetImage';
import { useLibrary } from '../../hooks/useLibrary';
import { isArtwork } from '../art/art';
import { displayTitle } from '../../domain/text';
import { ideasFromGallery } from '../../db/gallery';

/**
 * Pull photos and videos from the Gallery into post Ideas. Each chosen piece becomes its own
 * idea pointing at the same picture or video, so nothing is copied.
 */
export function GalleryPicker({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (n: number) => void }) {
  const lib = useLibrary();
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const items = (lib?.items ?? []).filter((i) => isArtwork(i) && !i.archived).sort((a, b) => b.createdAt - a.createdAt);
  const close = () => {
    setChosen([]);
    onClose();
  };
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const add = async () => {
    setBusy(true);
    try {
      const n = await ideasFromGallery(chosen);
      onAdded(n);
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="From your Gallery">
      {items.length ? (
        <>
          <ol className="grid max-h-[60vh] grid-cols-3 gap-1 overflow-y-auto sm:grid-cols-4" aria-label="Gallery">
            {items.map((item) => {
              const n = chosen.indexOf(item.id);
              return (
                <li key={item.id} className="relative">
                  <button
                    type="button"
                    aria-pressed={n >= 0}
                    aria-label={`${n >= 0 ? 'Unselect' : 'Select'} ${displayTitle(item)}`}
                    onClick={() => toggle(item.id)}
                    className={`block aspect-square w-full overflow-hidden rounded-md bg-paper-2 ${n >= 0 ? 'ring-2 ring-accent ring-offset-2 ring-offset-card' : ''}`}
                  >
                    {item.assetId ? (
                      <AssetImage id={item.assetId} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-muted"><Film size={22} aria-hidden /></span>
                    )}
                  </button>
                  {item.clipId && (
                    <span className="pointer-events-none absolute right-1.5 bottom-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white" aria-hidden>
                      <Play size={10} fill="currentColor" />
                    </span>
                  )}
                  {n >= 0 && (
                    <span className="pointer-events-none absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-ink" aria-hidden>
                      {n + 1}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" className="btn" onClick={close}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!chosen.length || busy} onClick={() => void add()}>
              {busy ? 'Adding…' : chosen.length ? `Add ${chosen.length} as ${chosen.length === 1 ? 'an idea' : 'ideas'}` : 'Add as ideas'}
            </button>
          </div>
        </>
      ) : (
        <p className="py-6 text-sm text-ink-2">Your Gallery is empty. Share photos or videos to YOUrigin from your phone’s gallery and they’ll appear here.</p>
      )}
    </Modal>
  );
}
