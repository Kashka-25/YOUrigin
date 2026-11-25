import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Hammer, RefreshCw } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { useOnline } from '../hooks/useOnline';
import { useSettings } from '../db/settings';
import { BuildNoteComposer } from '../components/build/BuildNoteComposer';
import { lastScreen } from '../components/build/screen';
import { isEditNote, lastSent, needsSending, resolveEditCategory, sendWaitingNotes } from '../sync/buildNotes';
import { Spinner } from '../components/ui';

/**
 * Build notes: changes to make to YOUrigin itself, written as you use it. They live with
 * your edit notes and go to Build Notes in Notion (project YOUrigin) for Claude to pick up.
 */
export function BuildNotes() {
  const lib = useLibrary();
  const settings = useSettings();
  const online = useOnline();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [seenOn] = useState(lastScreen);

  const notes = useMemo(() => {
    if (!lib || !settings) return null;
    const cat = resolveEditCategory(settings.editNotesCategory === 'off' ? '' : settings.editNotesCategory, lib.tags, lib.collections);
    return { cat, items: lib.items.filter((i) => isEditNote(i, cat, lib.collections)).sort((a, b) => b.createdAt - a.createdAt) };
  }, [lib, settings]);
  const off = settings?.editNotesCategory === 'off';
  const waiting = notes?.items.filter((i) => needsSending(i)) ?? [];

  const sendAll = async (quiet: boolean) => {
    if (!notes || off || sending) return;
    setSending(true);
    const r = await sendWaitingNotes(notes.items);
    setSending(false);
    if (!quiet || r.sent) setMessage(r.error ? (r.sent ? `Sent ${r.sent}. ${r.error}` : r.error) : r.sent ? `Sent ${r.sent} to Notion.` : 'Everything is in Notion.');
  };
  // Anything written offline or signed out goes as soon as it can.
  useEffect(() => {
    if (online && waiting.length) void sendAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, waiting.length]);

  if (!notes) return <Spinner />;
  return (
    <div className="page-frame max-w-2xl pb-10">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 font-serif text-3xl text-ink">
          <Hammer size={24} className="text-accent" aria-hidden /> Build notes
        </h1>
        <p className="mt-1 text-sm text-ink-2">
          Changes you want made to YOUrigin. Each goes to <span className="font-medium text-ink">Build Notes</span> in Notion under YOUrigin, with the screen you saw it on, for Claude to pick up.
        </p>
      </header>

      <section className="panel mb-6 p-4">
        <BuildNoteComposer seenOn={seenOn} />
        {off && (
          <p className="mt-2 text-xs text-seed">
            Sending to Notion is off in{' '}
            <Link to="/settings" className="underline">
              Settings → Edit notes
            </Link>
            , so notes are kept here only.
          </p>
        )}
      </section>

      <div className="mb-2 flex items-center gap-2">
        <h2 className="label mb-0 flex-1">
          {notes.items.length} note{notes.items.length === 1 ? '' : 's'}
          {notes.cat ? ` in ${notes.cat.name}` : ''}
        </h2>
        {!off && waiting.length > 0 && (
          <button type="button" className="btn min-h-9 px-3 text-sm" disabled={sending} onClick={() => void sendAll(false)}>
            <RefreshCw size={14} className={sending ? 'animate-spin' : ''} /> Send {waiting.length} waiting
          </button>
        )}
      </div>
      {message && <p className="mb-3 text-xs text-ink-2">{message}</p>}

      {notes.items.length ? (
        <ol className="space-y-2" aria-label="Build notes">
          {notes.items.map((item) => {
            const sent = lastSent(item.id);
            const pending = needsSending(item);
            return (
              <li key={item.id} className="rounded-xl border border-line bg-card p-3">
                <Link to={`/item/${item.id}`} className="block">
                  <span className="block font-medium text-ink">{item.title || item.body.split('\n')[0] || 'Untitled'}</span>
                  {item.body && <span className="mt-0.5 line-clamp-3 block whitespace-pre-wrap text-sm text-ink-2">{item.body}</span>}
                  {item.notes.startsWith('Seen on:') && <span className="mt-1 block truncate text-xs text-muted">{item.notes.split('\n')[0]}</span>}
                </Link>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                  <span>{new Date(item.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                  <span aria-hidden>·</span>
                  <span className={pending && !off ? 'text-developing' : 'text-ink-2'}>
                    {off ? 'Kept here' : pending ? (sent ? 'Changed since sent' : 'Waiting to send') : sent ? 'In Notion' : 'Kept here'}
                  </span>
                  {!pending && sent?.url && (
                    <a href={sent.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 hover:text-ink">
                      <ExternalLink size={12} /> Open in Notion
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">No build notes yet. Write the first one above.</p>
      )}
    </div>
  );
}
