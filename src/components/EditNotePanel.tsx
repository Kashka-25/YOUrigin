import { useEffect, useState } from 'react';
import { ExternalLink, Send } from 'lucide-react';
import type { ContentItem } from '../domain/types';
import { isSignedIn, lastSent, needsSending, sendEditNote } from '../sync/buildNotes';

/**
 * Shown on pieces in the edit-notes category. Sends the piece to Build Notes
 * in Notion a few seconds after you stop typing (when signed in), and offers
 * a button to send it straight away.
 */
export function EditNotePanel({ item, categoryName, saved }: { item: ContentItem; categoryName: string; saved: boolean }) {
  const [sent, setSent] = useState(() => lastSent(item.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = needsSending(item);

  const send = async (quiet: boolean) => {
    setBusy(true);
    try {
      await sendEditNote(item);
      setSent(lastSent(item.id));
      setError(null);
    } catch (e) {
      if (!quiet || navigator.onLine) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Auto-send once the piece is saved and has changed since the last send.
  useEffect(() => {
    if (!saved || !pending || busy) return;
    const t = setTimeout(async () => {
      if (navigator.onLine && (await isSignedIn())) void send(true);
    }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, pending, item.updatedAt]);

  return (
    <section className="rounded-xl border border-line p-3">
      <h2 className="label">Edit note → Notion</h2>
      <p className="text-sm text-ink-2">
        In <span className="font-medium text-ink">{categoryName}</span>, so it goes to Build Notes (YOUrigin) for Claude to pick up.
      </p>
      <p className="mt-1 text-xs text-muted">
        {busy
          ? 'Sending…'
          : pending
            ? sent
              ? 'Changed since it was last sent.'
              : 'Not sent yet.'
            : sent
              ? `Sent ${new Date(sent.at).toLocaleString()}.`
              : ''}
      </p>
      {error && <p className="mt-1 text-xs text-seed">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn text-xs" disabled={busy || !pending} onClick={() => void send(false)}>
          <Send size={14} /> {sent ? 'Send update' : 'Send to Notion'}
        </button>
        {sent?.url && (
          <a href={sent.url} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs">
            <ExternalLink size={14} /> Open in Notion
          </a>
        )}
      </div>
    </section>
  );
}
