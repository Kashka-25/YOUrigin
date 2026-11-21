import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Accessibility, AlertTriangle, ArrowLeft, CalendarClock, Check, ChevronDown, ExternalLink, Eye, FolderOpen, Hash, Link2, ListChecks, Megaphone, Plus, Quote, Search, Shapes, Sparkles, StickyNote, Trash2, Type, Undo2, X } from 'lucide-react';
import { EmptyState, SaveIndicator, Spinner } from '../components/ui';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import { AutoTextarea } from '../components/AutoTextarea';
import { PostPreview } from '../components/posts/PostMedia';
import { MediaComposer } from '../components/posts/MediaComposer';
import { FORMAT_ICON, PostStatusPill, WorldDot } from '../components/posts/PostBits';
import { useAutosave } from '../hooks/useAutosave';
import { DEMO } from '../demo/mode';
import { useLibrary } from '../hooks/useLibrary';
import { deletePost, linkPiece, restorePost, setPostStatus, unlinkPiece, updatePost, usePost, type PostPatch } from '../db/posts';
import { mediaFromFile, removeMediaIfUnused, withCover } from '../db/postMedia';
import { removeAssetIfUnused, saveImage } from '../db/assets';
import { collectImportFiles } from '../io/postMedia';
import { TYPE_LABEL } from '../domain/constants';
import { displayTitle, excerpt } from '../domain/text';
import type { ContentItem } from '../domain/types';
import {
  CAPTION_LIMIT,
  FORMAT_LABEL,
  FORMAT_ORDER,
  HASHTAG_LIMIT,
  STATUS_LABEL,
  STATUS_ORDER,
  WEEK_PLAN,
  WORLD_LABEL,
  WORLD_ORDER,
  dateKey,
  formatForMedia,
  fromDateTime,
  hookInPieces,
  nextStatus,
  normaliseHashtags,
  postChecks,
  previousStatus,
  timeKey,
  type Post,
  type PostMedia,
} from '../posts/model';

/** What the editor's text fields hold; status and links are saved straight away instead. */
interface Fields {
  date: string;
  time: string;
  format: Post['format'];
  world: Post['world'];
  hook: string;
  caption: string;
  hashtags: string;
  altText: string;
  cta: string;
  media: PostMedia[];
  notes: string;
  postedUrl: string;
}

function fieldsOf(p: Post): Fields {
  const at = p.scheduledAt !== null ? new Date(p.scheduledAt) : null;
  return {
    date: at ? dateKey(at) : '',
    time: at ? timeKey(at) : '',
    format: p.format,
    world: p.world,
    hook: p.hook,
    caption: p.caption,
    hashtags: p.hashtags.join(' '),
    altText: p.altText,
    cta: p.cta,
    media: p.media,
    notes: p.notes,
    postedUrl: p.postedUrl,
  };
}

function patchOf(f: Fields): PostPatch {
  return {
    scheduledAt: f.date ? fromDateTime(f.date, f.time || WEEK_PLAN[new Date(`${f.date}T12:00`).getDay()]?.time || '12:00') : null,
    format: f.format,
    world: f.world,
    hook: f.hook,
    caption: f.caption,
    hashtags: normaliseHashtags(f.hashtags),
    altText: f.altText,
    cta: f.cta,
    media: f.media,
    notes: f.notes,
    postedUrl: f.postedUrl,
  };
}

const PIECE_TYPES_FIRST: ContentItem['type'][] = ['poem', 'fragment', 'song', 'quote', 'reflection'];

function PiecePicker({ open, onClose, onPick, linked }: { open: boolean; onClose: () => void; onPick: (id: string) => void; linked: string[] }) {
  const lib = useLibrary();
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    const items = (lib?.items ?? []).filter((i) => !i.deletedAt && !i.archived && i.type !== 'image' && !linked.includes(i.id));
    const hits = needle ? items.filter((i) => `${i.title}\n${i.body}`.toLocaleLowerCase().includes(needle)) : items;
    const rank = (i: ContentItem) => (PIECE_TYPES_FIRST.includes(i.type) ? 0 : 1);
    return [...hits].sort((a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt).slice(0, 40);
  }, [lib, q, linked]);
  return (
    <Modal open={open} onClose={onClose} title="Link a piece">
      <label className="relative mb-3 block">
        <span className="sr-only">Search your pieces</span>
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input data-autofocus className="input pl-9" placeholder="Search poems, fragments, lyrics…" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <ul className="space-y-2">
        {results.map((i) => (
          <li key={i.id}>
            <button type="button" className="panel block w-full p-3 text-left hover:border-accent/60" onClick={() => onPick(i.id)}>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{TYPE_LABEL[i.type]}</span>
              <span className="block font-serif text-lg leading-snug">{displayTitle(i)}</span>
              <span className="line-clamp-2 block text-sm text-ink-2">{excerpt(i.body, 140)}</span>
            </button>
          </li>
        ))}
        {!results.length && <li className="p-4 text-center text-sm text-muted">No pieces match.</li>}
      </ul>
    </Modal>
  );
}

function LinkedPiece({ piece, onUnlink, onUseLine }: { piece: ContentItem | undefined; id: string; onUnlink: () => void; onUseLine: (line: string) => void }) {
  const lines = piece ? piece.body.split('\n').map((l) => l.trim()).filter(Boolean) : [];
  return (
    <li className="panel p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {piece ? (
            <>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{TYPE_LABEL[piece.type]}</span>
              <Link to={`/item/${piece.id}`} className="block font-serif text-lg leading-snug hover:underline">
                {displayTitle(piece)} <ExternalLink size={13} className="inline opacity-60" aria-hidden />
              </Link>
            </>
          ) : (
            <span className="text-sm text-muted">This piece is no longer in your library.</span>
          )}
        </div>
        <button type="button" className="btn-ghost min-h-9 px-2" onClick={onUnlink} aria-label={`Unlink ${piece ? displayTitle(piece) : 'piece'}`}>
          <X size={16} />
        </button>
      </div>
      {lines.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-ink-2">Use a line as the hook</summary>
          <ul className="mt-2 space-y-1">
            {lines.slice(0, 40).map((l, i) => (
              <li key={`${i}-${l}`}>
                <button type="button" className="w-full rounded-lg px-2 py-1.5 text-left font-serif text-[15px] hover:bg-paper-2" onClick={() => onUseLine(l)}>
                  <Quote size={12} className="mr-1 inline opacity-50" aria-hidden />
                  {l}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

/** One tap-to-open row, like Instagram's settings rows under the caption. */
function Row({ icon: Icon, label, summary, open, children }: { icon: typeof Eye; label: string; summary?: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="group border-b border-line last:border-b-0" open={open}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
        <Icon size={18} className="shrink-0 text-ink-2" aria-hidden />
        <span className="shrink-0 whitespace-nowrap font-medium text-ink">{label}</span>
        {summary && <span className="ml-auto min-w-0 flex-1 truncate text-right text-sm text-muted">{summary}</span>}
        <ChevronDown size={16} className={`shrink-0 text-muted transition-transform group-open:rotate-180 ${summary ? '' : 'ml-auto'}`} aria-hidden />
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

const short = (s: string, n = 34) => {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function Editor({ post }: { post: Post }) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const lib = useLibrary();
  const [fields, setFields] = useState<Fields>(() => fieldsOf(post));
  const [picking, setPicking] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [fileName, setFileName] = useState('');
  const { state, schedule, flush } = useAutosave<Fields>((f) => updatePost(post.id, patchOf(f)));

  const set = (patch: Partial<Fields>) => {
    const next = { ...fields, ...patch };
    setFields(next);
    schedule(next);
  };
  /** New media also sets the format the way Instagram would (video → Reel, several → carousel). */
  const setMedia = (media: PostMedia[]) => set({ media, format: formatForMedia(media, fields.format) });

  const pieces = post.pieceIds.map((id) => ({ id, piece: lib?.contentById.get(id) }));
  const tags = normaliseHashtags(fields.hashtags);
  const checks = postChecks({ ...post, caption: fields.caption, hook: fields.hook, altText: fields.altText, hashtags: tags, format: fields.format });
  const quoteDrifted = fields.format === 'quote-card' && fields.hook.trim() && pieces.some((p) => p.piece) && !hookInPieces(fields.hook, pieces.flatMap((p) => (p.piece ? [p.piece.body] : [])));

  const move = async (status: Post['status']) => {
    await flush();
    await setPostStatus(post.id, status);
    toast(status === 'approved' ? 'Approved. It’s ready to export for scheduling.' : status === 'posted' ? 'Marked as posted.' : `Moved to ${STATUS_LABEL[status]}.`);
  };

  const [adding, setAdding] = useState(false);
  const addMedia = async (picked: File[]) => {
    setAdding(true);
    try {
      // A .zip is opened; images and videos are added in the order picked.
      const { media } = await collectImportFiles(picked);
      const added: PostMedia[] = [];
      for (const f of media.values()) {
        const m = await mediaFromFile(f);
        if (m) added.push(m);
      }
      if (!added.length) toast('Those files aren’t images or videos.');
      else setMedia([...fields.media, ...added]);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const removeMedia = async (index: number) => {
    const m = fields.media[index];
    setMedia(fields.media.filter((_, i) => i !== index));
    await flush();
    await removeMediaIfUnused(m);
  };

  const setCover = async (index: number, picture: File) => {
    try {
      const { asset } = await saveImage(picture);
      const { media, replaced } = withCover(fields.media, index, asset.id);
      set({ media });
      await flush();
      if (replaced) await removeAssetIfUnused(replaced);
      toast('Cover updated.');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: 'Set this post aside?', message: 'It leaves the calendar, grid and board. Linked pieces are not touched.', confirmLabel: 'Set aside', danger: true });
    if (!ok) return;
    await flush();
    await deletePost(post.id);
    navigate('/posts');
    toast('Post set aside.');
  };

  const next = nextStatus(post.status);
  const back = previousStatus(post.status);
  const nextLabel = next === 'draft' ? 'Make it a draft' : next === 'approved' ? 'Approve' : next === 'posted' ? 'Mark posted' : '';
  const when = fields.date ? new Date(`${fields.date}T${fields.time || '12:00'}`) : null;
  const driveNames = fields.media.filter((m) => m.kind === 'file');

  return (
    <div className="page-frame pb-8">
      <div className="mb-4 flex items-center gap-2">
        <Link to="/posts" className="btn-ghost -ml-3">
          <ArrowLeft size={16} /> Posts
        </Link>
        <span className="ml-auto flex items-center gap-2">
          <SaveIndicator state={state} />
          <button type="button" className="btn min-h-9 px-3" onClick={() => setPreviewing(true)}>
            <Eye size={16} /> Preview
          </button>
        </span>
      </div>

      {post.deletedAt && (
        <div className="panel mb-4 flex items-center gap-3 p-3 text-sm">
          This post is set aside.
          <button type="button" className="btn ml-auto" onClick={() => void restorePost(post.id)}>
            <Undo2 size={16} /> Bring it back
          </button>
        </div>
      )}

      <div className="mx-auto max-w-2xl space-y-4">
        <MediaComposer
          media={fields.media}
          format={fields.format}
          altText={fields.altText}
          busy={adding}
          onAdd={(f) => void addMedia(f)}
          onRemove={(i) => void removeMedia(i)}
          onReorder={(media) => set({ media })}
          onCover={(i, f) => void setCover(i, f)}
        />

        {post.origin.kind === 'claude' && (
          <p className="flex items-center gap-2 text-xs text-ink-2">
            <Sparkles size={14} className="shrink-0 text-gold" aria-hidden />
            Drafted by Claude. Change anything, then approve it when it feels like yours.
          </p>
        )}

        <label className="block">
          <span className="sr-only">Caption</span>
          <AutoTextarea
            id="post-caption"
            minHeight={120}
            className="input writing text-[15px] leading-relaxed"
            placeholder="Write a caption…"
            ariaLabel="Caption"
            value={fields.caption}
            onChange={(caption) => set({ caption })}
          />
          <span className={`mt-1 block text-right text-xs ${fields.caption.length > CAPTION_LIMIT ? 'text-seed' : 'text-muted'}`}>
            {fields.caption.length.toLocaleString()} / {CAPTION_LIMIT.toLocaleString()}
          </span>
        </label>

        {checks.length > 0 && (
          <ul className="space-y-1.5" aria-label="Gentle checks">
            {checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2 rounded-xl border border-seed/30 p-2.5 text-sm text-ink-2">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-seed" aria-hidden /> {c.message}
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-2xl border border-line bg-card px-4">
          <Row icon={CalendarClock} label="Schedule" summary={when ? `${when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fields.time || '—'}` : 'Not placed yet'}>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="label">Date</span>
                <input type="date" className="input" value={fields.date} onChange={(e) => set({ date: e.target.value })} />
              </label>
              <label>
                <span className="label">Time</span>
                <input type="time" className="input" value={fields.time} onChange={(e) => set({ time: e.target.value })} disabled={!fields.date} />
              </label>
            </div>
            {fields.date && (
              <p className="mt-2 text-xs text-muted">
                {WEEK_PLAN[new Date(`${fields.date}T12:00`).getDay()].label} day.{' '}
                <button type="button" className="underline" onClick={() => set({ date: '', time: '' })}>
                  Clear the date
                </button>
              </p>
            )}
          </Row>

          <Row icon={Shapes} label="Format and world" summary={`${FORMAT_LABEL[fields.format]} · ${WORLD_LABEL[fields.world]}`}>
            <fieldset>
              <legend className="label">Format</legend>
              <div className="flex flex-wrap gap-2">
                {FORMAT_ORDER.map((f) => {
                  const Icon = FORMAT_ICON[f];
                  return (
                    <button key={f} type="button" aria-pressed={fields.format === f} className={`btn min-h-10 ${fields.format === f ? 'border-accent bg-accent/10 text-ink' : ''}`} onClick={() => set({ format: f })}>
                      <Icon size={15} aria-hidden /> {FORMAT_LABEL[f]}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <fieldset className="mt-4">
              <legend className="label">Content world</legend>
              <div className="flex flex-wrap gap-2">
                {WORLD_ORDER.map((w) => (
                  <button key={w} type="button" aria-pressed={fields.world === w} className={`btn min-h-10 ${fields.world === w ? 'border-accent bg-accent/10 text-ink' : ''}`} onClick={() => set({ world: w })}>
                    <WorldDot world={w} /> {WORLD_LABEL[w]}
                  </button>
                ))}
              </div>
            </fieldset>
          </Row>

          <Row icon={Type} label="On-image hook" summary={short(fields.hook) || 'None'}>
            <AutoTextarea id="post-hook" minHeight={56} className="input font-serif text-lg" ariaLabel="On-image hook" value={fields.hook} onChange={(hook) => set({ hook })} />
            {quoteDrifted && <span className="mt-1 block text-xs text-muted">This line is no longer word for word in the linked piece.</span>}
          </Row>

          <Row icon={Megaphone} label="Call to action" summary={short(fields.cta) || 'None'}>
            <input className="input" aria-label="Call to action" value={fields.cta} onChange={(e) => set({ cta: e.target.value })} placeholder="Save this for a hard day 💛" />
          </Row>

          <Row icon={Hash} label="Hashtags" summary={`${tags.length} / ${HASHTAG_LIMIT}`}>
            <AutoTextarea
              id="post-hashtags"
              minHeight={48}
              className="input"
              ariaLabel="Hashtags"
              value={fields.hashtags}
              onChange={(hashtags) => set({ hashtags })}
              onBlur={() => setFields((f) => ({ ...f, hashtags: normaliseHashtags(f.hashtags).join(' ') }))}
            />
          </Row>

          <Row icon={Accessibility} label="Alt text" summary={fields.altText.trim() ? 'Written' : 'Missing'}>
            <AutoTextarea id="post-alt" minHeight={72} className="input" ariaLabel="Alt text" value={fields.altText} onChange={(altText) => set({ altText })} />
            <p className="mt-1 text-xs text-muted">Describes the pictures for people who use screen readers.</p>
          </Row>

          <Row icon={Link2} label="Linked pieces" summary={post.pieceIds.length ? `${post.pieceIds.length} linked` : 'None'}>
            {pieces.length ? (
              <ul className="mb-2 space-y-2">
                {pieces.map(({ id, piece }) => (
                  <LinkedPiece key={id} id={id} piece={piece} onUnlink={() => void unlinkPiece(post.id, id)} onUseLine={(line) => set({ hook: line })} />
                ))}
              </ul>
            ) : (
              <p className="mb-2 text-sm text-muted">Link the poem, fragment or lyric this post draws on. It stays in your library; the post only points to it.</p>
            )}
            <button type="button" className="btn" onClick={() => setPicking(true)}>
              <Link2 size={15} /> Link a piece
            </button>
          </Row>

          <Row icon={FolderOpen} label="Files in Drive" summary={driveNames.length ? `${driveNames.length} not added yet` : 'None'}>
            <p className="mb-2 text-sm text-muted">Name a file that’s still in Google Drive. Add the file itself later with + above, or with “Add media” on the Posts page.</p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!fileName.trim()) return;
                set({ media: [...fields.media, { kind: 'file', name: fileName.trim() }] });
                setFileName('');
              }}
            >
              <input className="input min-w-0" value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="slide-01.jpg" aria-label="File name in Drive" />
              <button type="submit" className="btn shrink-0" disabled={!fileName.trim()} aria-label="Add file name">
                <Plus size={16} />
              </button>
            </form>
          </Row>

          {post.status === 'posted' && (
            <Row icon={ExternalLink} label="Live post" summary={fields.postedUrl ? 'Linked' : 'Add the link'} open={!fields.postedUrl}>
              <input className="input" type="url" aria-label="Link to the live post" value={fields.postedUrl} onChange={(e) => set({ postedUrl: e.target.value })} placeholder="https://www.instagram.com/p/…" />
            </Row>
          )}

          <Row icon={StickyNote} label="Notes to self" summary={short(fields.notes) || 'None'}>
            <AutoTextarea id="post-notes" minHeight={72} className="input" ariaLabel="Notes to self" value={fields.notes} onChange={(notes) => set({ notes })} />
          </Row>

          <Row icon={ListChecks} label="Status" summary={STATUS_LABEL[post.status]}>
            <ol className="grid grid-cols-4 gap-1 rounded-xl border border-line p-1" aria-label="Status">
              {STATUS_ORDER.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    aria-current={post.status === s ? 'step' : undefined}
                    className={`w-full rounded-lg px-1 py-2 text-xs font-semibold ${post.status === s ? 'bg-accent text-accent-ink' : STATUS_ORDER.indexOf(s) < STATUS_ORDER.indexOf(post.status) ? 'text-ink' : 'text-muted'}`}
                    onClick={() => void move(s)}
                  >
                    {STATUS_ORDER.indexOf(s) < STATUS_ORDER.indexOf(post.status) && <Check size={12} className="mr-0.5 inline" aria-hidden />}
                    {STATUS_LABEL[s]}
                  </button>
                </li>
              ))}
            </ol>
            {post.origin.kind === 'claude' && (
              <p className="mt-2 text-xs text-muted">
                Drafted by Claude from {post.origin.fileName}, {new Date(post.origin.importedAt).toLocaleDateString()}.
              </p>
            )}
          </Row>
        </div>

        <button type="button" className="btn-ghost text-seed" onClick={() => void remove()}>
          <Trash2 size={16} /> Set this post aside
        </button>
      </div>

      <div
        className={`no-print sticky ${DEMO ? 'bottom-[calc(124px+env(safe-area-inset-bottom))] md:bottom-0' : 'bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-0'} z-20 mt-6 flex items-center gap-2 border-t border-line bg-card/95 px-4 py-3 backdrop-blur md:rounded-xl md:border`}
      >
        <PostStatusPill status={post.status} />
        {back && (
          <button type="button" className="btn-ghost ml-auto min-h-10 px-3" onClick={() => void move(back)}>
            <ArrowLeft size={15} /> {STATUS_LABEL[back]}
          </button>
        )}
        {next && (
          <button type="button" className={`btn-primary ${back ? '' : 'ml-auto'}`} onClick={() => void move(next)}>
            {nextLabel}
          </button>
        )}
      </div>

      <Modal open={previewing} onClose={() => setPreviewing(false)} title="Preview">
        <PostPreview post={{ ...fields, hashtags: tags }} />
        <p className="mt-2 text-center text-xs text-muted">How it will look on Instagram.</p>
      </Modal>

      <PiecePicker
        open={picking}
        onClose={() => setPicking(false)}
        linked={post.pieceIds}
        onPick={(id) => {
          void linkPiece(post.id, id);
          setPicking(false);
        }}
      />
    </div>
  );
}

export function PostEditor() {
  const { id } = useParams();
  const post = usePost(id);
  if (post === undefined) return <Spinner />;
  if (post === null) return <EmptyState title="This post isn’t here">It may have been removed on another device.</EmptyState>;
  return <Editor key={post.id} post={post} />;
}
