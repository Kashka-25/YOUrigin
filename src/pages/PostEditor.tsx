import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ExternalLink, ImagePlus, Link2, Plus, Quote, Search, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { EmptyState, SaveIndicator, Spinner } from '../components/ui';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import { AutoTextarea } from '../components/AutoTextarea';
import { MediaThumb, PostPreview } from '../components/posts/PostMedia';
import { FORMAT_ICON, PostStatusPill, WorldDot } from '../components/posts/PostBits';
import { useAutosave } from '../hooks/useAutosave';
import { DEMO } from '../demo/mode';
import { useLibrary } from '../hooks/useLibrary';
import { deletePost, linkPiece, restorePost, setPostStatus, unlinkPiece, updatePost, usePost, type PostPatch } from '../db/posts';
import { mediaFromFile, removeMediaIfUnused } from '../db/postMedia';
import { POST_MEDIA_ACCEPT, collectImportFiles } from '../io/postMedia';
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

function Editor({ post }: { post: Post }) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const lib = useLibrary();
  const [fields, setFields] = useState<Fields>(() => fieldsOf(post));
  const [picking, setPicking] = useState(false);
  const [fileName, setFileName] = useState('');
  const imageInput = useRef<HTMLInputElement>(null);
  const { state, schedule, flush } = useAutosave<Fields>((f) => updatePost(post.id, patchOf(f)));

  const set = (patch: Partial<Fields>) => {
    const next = { ...fields, ...patch };
    setFields(next);
    schedule(next);
  };

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
      set({ media: [...fields.media, ...added] });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const removeMedia = async (index: number) => {
    const m = fields.media[index];
    set({ media: fields.media.filter((_, i) => i !== index) });
    await flush();
    await removeMediaIfUnused(m);
  };

  const moveMedia = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= fields.media.length) return;
    const media = [...fields.media];
    [media[index], media[to]] = [media[to], media[index]];
    set({ media });
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

  return (
    <div className="page-frame pb-8">
      <div className="mb-4 flex items-center gap-2">
        <Link to="/posts" className="btn-ghost -ml-3">
          <ArrowLeft size={16} /> Posts
        </Link>
        <span className="ml-auto">
          <SaveIndicator state={state} />
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

      <ol className="mb-5 grid grid-cols-4 gap-1 rounded-xl border border-line p-1" aria-label="Status">
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
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-gold/40 p-3 text-sm text-ink-2">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-gold" aria-hidden />
          Drafted by Claude ({post.origin.fileName}, {new Date(post.origin.importedAt).toLocaleDateString()}). It’s a suggestion: change anything, then approve it when it feels like yours.
        </p>
      )}

      <div className="mx-auto max-w-2xl space-y-5">
        <section aria-label="Preview">
          <PostPreview post={{ ...fields, hashtags: tags }} />
          <p className="mt-2 text-center text-xs text-muted">How it will look. It updates as you edit.</p>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">Date</span>
            <input type="date" className="input" value={fields.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
          <label>
            <span className="label">Time</span>
            <input type="time" className="input" value={fields.time} onChange={(e) => set({ time: e.target.value })} disabled={!fields.date} />
          </label>
          {fields.date && (
            <p className="col-span-2 -mt-1 text-xs text-muted">
              {WEEK_PLAN[new Date(`${fields.date}T12:00`).getDay()].label} day.{' '}
              <button type="button" className="underline" onClick={() => set({ date: '', time: '' })}>
                Clear the date
              </button>
            </p>
          )}
        </section>

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

        <fieldset>
          <legend className="label">Content world</legend>
          <div className="flex flex-wrap gap-2">
            {WORLD_ORDER.map((w) => (
              <button key={w} type="button" aria-pressed={fields.world === w} className={`btn min-h-10 ${fields.world === w ? 'border-accent bg-accent/10 text-ink' : ''}`} onClick={() => set({ world: w })}>
                <WorldDot world={w} /> {WORLD_LABEL[w]}
              </button>
            ))}
          </div>
        </fieldset>

        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label mb-0">Linked pieces</span>
            <button type="button" className="btn-ghost min-h-9 px-2" onClick={() => setPicking(true)}>
              <Link2 size={15} /> Link a piece
            </button>
          </div>
          {pieces.length ? (
            <ul className="space-y-2">
              {pieces.map(({ id, piece }) => (
                <LinkedPiece key={id} id={id} piece={piece} onUnlink={() => void unlinkPiece(post.id, id)} onUseLine={(line) => set({ hook: line })} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Link the poem, fragment or lyric this post draws on. It stays in your library; the post only points to it.</p>
          )}
        </section>

        <label className="block">
          <span className="label">On-image hook</span>
          <AutoTextarea id="post-hook" minHeight={56} className="input font-serif text-lg" value={fields.hook} onChange={(hook) => set({ hook })} />
          {quoteDrifted && <span className="mt-1 block text-xs text-muted">This line is no longer word for word in the linked piece.</span>}
        </label>

        <label className="block">
          <span className="label flex justify-between">
            Caption
            <span className={`font-normal normal-case tracking-normal ${fields.caption.length > CAPTION_LIMIT ? 'text-seed' : ''}`}>
              {fields.caption.length.toLocaleString()} / {CAPTION_LIMIT.toLocaleString()}
            </span>
          </span>
          <AutoTextarea id="post-caption" minHeight={160} className="input writing text-[15px] leading-relaxed" value={fields.caption} onChange={(caption) => set({ caption })} />
        </label>

        <label className="block">
          <span className="label">Call to action</span>
          <input className="input" value={fields.cta} onChange={(e) => set({ cta: e.target.value })} placeholder="Save this for a hard day 💛" />
        </label>

        <label className="block">
          <span className="label flex justify-between">
            Hashtags
            <span className={`font-normal normal-case tracking-normal ${tags.length > HASHTAG_LIMIT ? 'text-seed' : ''}`}>
              {tags.length} / {HASHTAG_LIMIT}
            </span>
          </span>
          <AutoTextarea id="post-hashtags" minHeight={48} className="input" value={fields.hashtags} onChange={(hashtags) => set({ hashtags })} onBlur={() => setFields((f) => ({ ...f, hashtags: normaliseHashtags(f.hashtags).join(' ') }))} />
        </label>

        <label className="block">
          <span className="label">Alt text</span>
          <AutoTextarea id="post-alt" minHeight={72} className="input" value={fields.altText} onChange={(altText) => set({ altText })} />
        </label>

        <section>
          <span className="label flex justify-between">
            Images and videos
            <span className="font-normal normal-case tracking-normal">{fields.media.length ? `${fields.media.length} in order` : ''}</span>
          </span>
          {fields.media.length > 0 && (
            <ul className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {fields.media.map((m, i) => (
                <li key={m.kind === 'asset' ? `${m.assetId}-${i}` : m.kind === 'clip' ? `${m.clipId}-${i}` : `${m.name}-${i}`} className="relative">
                  <MediaThumb media={m} className="aspect-[4/5] w-full rounded-lg" />
                  <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 text-[11px] font-semibold text-white tabular-nums">{i + 1}</span>
                  <button type="button" className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white" onClick={() => void removeMedia(i)} aria-label={`Remove ${m.kind === 'asset' ? 'image' : m.name} (${i + 1})`}>
                    <X size={14} />
                  </button>
                  <span className="absolute inset-x-1 bottom-1 flex justify-between">
                    <button type="button" className="rounded-full bg-black/60 p-1 text-white disabled:opacity-0" disabled={i === 0} onClick={() => moveMedia(i, -1)} aria-label={`Move ${i + 1} earlier`}>
                      <ArrowLeft size={14} />
                    </button>
                    <button type="button" className="rounded-full bg-black/60 p-1 text-white disabled:opacity-0" disabled={i === fields.media.length - 1} onClick={() => moveMedia(i, 1)} aria-label={`Move ${i + 1} later`}>
                      <ArrowRight size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={adding} onClick={() => imageInput.current?.click()}>
              <ImagePlus size={16} /> {adding ? 'Adding…' : 'Add images or videos'}
            </button>
            <form
              className="flex min-w-0 flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!fileName.trim()) return;
                set({ media: [...fields.media, { kind: 'file', name: fileName.trim() }] });
                setFileName('');
              }}
            >
              <input className="input min-w-0" value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="Or a file name in Drive" aria-label="File name in Drive" />
              <button type="submit" className="btn shrink-0" disabled={!fileName.trim()} aria-label="Add file name">
                <Plus size={16} />
              </button>
            </form>
          </div>
          <p className="mt-1.5 text-xs text-muted">Pictures sync to all your devices. Videos stay on the device you add them on; the others show a still frame.</p>
          <input
            ref={imageInput}
            type="file"
            accept={POST_MEDIA_ACCEPT}
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-label="Images and videos for this post"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) void addMedia(files);
            }}
          />
        </section>

        {post.status === 'posted' && (
          <label className="block">
            <span className="label">Link to the live post</span>
            <input className="input" type="url" value={fields.postedUrl} onChange={(e) => set({ postedUrl: e.target.value })} placeholder="https://www.instagram.com/p/…" />
          </label>
        )}

        <label className="block">
          <span className="label">Notes to self</span>
          <AutoTextarea id="post-notes" minHeight={72} className="input" value={fields.notes} onChange={(notes) => set({ notes })} />
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

        <button type="button" className="btn-ghost text-seed" onClick={() => void remove()}>
          <Trash2 size={16} /> Set this post aside
        </button>
      </div>

      <div className={`no-print sticky ${DEMO ? 'bottom-[calc(124px+env(safe-area-inset-bottom))] md:bottom-0' : 'bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-0'} z-20 -mx-4 mt-6 flex items-center gap-2 border-t border-line bg-card/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-xl md:border`}>
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
