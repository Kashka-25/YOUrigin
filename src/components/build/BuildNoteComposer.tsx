import { useState, type FormEvent } from 'react';
import { MapPin, X } from 'lucide-react';
import { AutoTextarea } from '../AutoTextarea';
import { useToast } from '../Toast';
import { db } from '../../db/db';
import { addBuildNote } from '../../db/buildNotes';
import { isSignedIn, sendEditNote } from '../../sync/buildNotes';

/**
 * Write a change to make to YOUrigin. It is saved here first (works offline), then sent
 * to Build Notes in Notion straight away when signed in and online.
 */
export function BuildNoteComposer({ seenOn, onAdded, autoFocus }: { seenOn: string; onAdded?: () => void; autoFocus?: boolean }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [where, setWhere] = useState(seenOn);
  const [busy, setBusy] = useState(false);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const id = await addBuildNote(text, where);
      if (!id) return;
      setText('');
      onAdded?.();
      const item = await db.content.get(id);
      if (item && navigator.onLine && (await isSignedIn())) {
        try {
          await sendEditNote(item);
          toast('Noted, and sent to Build Notes in Notion.');
        } catch (err) {
          toast(`Noted here. ${err instanceof Error ? err.message : 'It will send later.'}`);
        }
      } else {
        toast(navigator.onLine ? 'Noted here. It goes to Notion once you sign in under Settings → Sync.' : 'Noted here. It goes to Notion when you’re back online.');
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => void add(e)} className="space-y-2">
      <span ref={(el) => void (autoFocus && el?.querySelector('textarea')?.focus())}>
        <AutoTextarea
          id="build-note-text"
          minHeight={88}
          className="input"
          ariaLabel="A change to make to YOUrigin"
          placeholder="What should change in YOUrigin? The first line becomes the title in Notion."
          value={text}
          onChange={setText}
        />
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {where ? (
          <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-ink-2">
            <MapPin size={12} className="shrink-0" aria-hidden />
            <span className="truncate">Seen on {where}</span>
            <button type="button" className="shrink-0 text-muted hover:text-ink" aria-label="Don’t include the screen" onClick={() => setWhere('')}>
              <X size={12} />
            </button>
          </span>
        ) : (
          <span className="text-xs text-muted">No screen attached.</span>
        )}
        <button type="submit" className="btn-primary ml-auto min-h-9 px-3 text-sm" disabled={!text.trim() || busy}>
          {busy ? 'Saving…' : 'Add build note'}
        </button>
      </div>
    </form>
  );
}
