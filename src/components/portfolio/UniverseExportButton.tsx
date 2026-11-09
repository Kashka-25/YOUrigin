import { useState } from 'react';
import { Globe2 } from 'lucide-react';
import { db } from '../../db/db';
import type { Portfolio } from '../../portfolio/model';
import { buildUniversePack, universeFileName } from '../../portfolio/universe';
import { useToast } from '../Toast';

type SavePicker = (opts: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
}>;

/**
 * Saves this portfolio as the starter pack Creative Universe reads at build time.
 * On a laptop browser that can, it asks where to save (so it can go straight over
 * starters/cassidy-ventures.json); elsewhere it downloads the file.
 */
export function UniverseExportButton({ portfolio, flush }: { portfolio: Portfolio; flush: () => Promise<void> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await flush();
      const projects = new Map((await db.projects.toArray()).map((p) => [p.id, p]));
      const coverIds = [...projects.values()].map((p) => p.coverAssetId).filter((id): id is string => !!id);
      const covers = new Map((await db.assets.bulkGet(coverIds)).filter((a) => !!a).map((a) => [a!.id, a!.dataUrl]));
      const { pack, skipped, missing } = buildUniversePack(portfolio, projects, (p) => (p.coverAssetId ? covers.get(p.coverAssetId) : undefined));
      const count = pack.sections.reduce((n, s) => n + s.projects.length, 0);
      if (!count) {
        toast('This portfolio has no Project cards to export yet');
        return;
      }
      const blob = new Blob([JSON.stringify(pack, null, 2) + '\n'], { type: 'application/json' });
      const name = universeFileName(pack);
      const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
      if (picker) {
        try {
          const handle = await picker({ suggestedName: name, types: [{ description: 'Creative Universe starter pack', accept: { 'application/json': ['.json'] } }] });
          const w = await handle.createWritable();
          await w.write(blob);
          await w.close();
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return; // chose not to save
          throw e;
        }
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
      const notes = [skipped ? `${skipped} non-Project ${skipped === 1 ? 'item' : 'items'} left out` : '', missing ? `${missing} deleted ${missing === 1 ? 'Project' : 'Projects'} skipped` : '']
        .filter(Boolean)
        .join(' · ');
      toast(`Saved ${count} ${count === 1 ? 'Project' : 'Projects'} for Creative Universe${notes ? ` (${notes})` : ''}`);
    } catch (e) {
      toast(e instanceof Error ? `Couldn’t save: ${e.message}` : 'Couldn’t save the file');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className="btn" onClick={() => void run()} disabled={busy} title="Save this portfolio as the starter pack Creative Universe reads">
      <Globe2 size={16} /> Export for Creative Universe
    </button>
  );
}
