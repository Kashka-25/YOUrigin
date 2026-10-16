import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, X } from 'lucide-react';
import { setSetting, useSettings } from '../db/settings';
import { PACKS, installPack, removePack, wordsDb, type PackInfo } from '../words/store';
import { useToast } from './Toast';

/** Settings: download or remove dictionary, thesaurus and spelling packs, and the writer's own words. */
export function WordPacks() {
  const installed = useLiveQuery(() => wordsDb.packs.toArray(), []);
  const [busy, setBusy] = useState<Record<string, number>>({});
  const toast = useToast();
  const own = useSettings()?.spellingWords ?? [];

  const get = async (p: PackInfo) => {
    setBusy((b) => ({ ...b, [p.id]: 0 }));
    try {
      await installPack(p, (f) => setBusy((b) => ({ ...b, [p.id]: f })));
      toast(`${p.name} ready offline`);
    } catch (e) {
      toast(navigator.onLine ? (e instanceof Error ? e.message : 'Download failed') : 'Connect to the internet to download');
    } finally {
      setBusy((b) => {
        const rest = { ...b };
        delete rest[p.id];
        return rest;
      });
    }
  };

  return (
    <>
      <ul className="space-y-3">
        {PACKS.map((p) => {
          const have = installed?.find((i) => i.id === p.id);
          const progress = busy[p.id];
          return (
            <li key={p.id} className="panel flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium text-ink">
                  {p.name} <span className="font-normal text-muted">· {p.language}</span>
                </p>
                <p className="text-xs text-muted">
                  {p.mb} MB ·{' '}
                  <a href={p.creditUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                    {p.credit}
                  </a>
                </p>
              </div>
              {progress !== undefined ? (
                <span className="text-sm text-ink-2" role="status">
                  {Math.round(progress * 100)}%
                </span>
              ) : have && have.version >= p.version ? (
                <button type="button" className="btn-ghost text-xs" onClick={() => void removePack(p.id)}>
                  Remove
                </button>
              ) : (
                <button type="button" className="btn" disabled={installed === undefined} onClick={() => void get(p)}>
                  <Download size={15} /> {have ? 'Update' : 'Download'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {own.length > 0 && (
        <div>
          <h3 className="label">Your words</h3>
          <ul className="flex flex-wrap gap-1.5">
            {own.map((w) => (
              <li key={w} className="flex items-center gap-1 rounded-full border border-line py-0.5 pr-1 pl-2.5 text-sm">
                {w}
                <button type="button" className="btn-ghost p-0.5" aria-label={`Remove ${w}`} onClick={() => void setSetting('spellingWords', own.filter((x) => x !== w))}>
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
