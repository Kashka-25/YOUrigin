import { useRef, useState, type DragEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Download, FolderOpen, ImagePlus, Lightbulb, Move, Plus, Upload } from 'lucide-react';
import { EmptyState, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';
import { combinePosts, createPost, deletePost, movePostInFeed, setPostStatus, usePosts } from '../db/posts';
import { POST_IMPORT_ACCEPT, POST_MEDIA_ACCEPT, collectImportFiles } from '../io/postMedia';
import { addIdeas, attachMediaToPosts } from '../db/postMedia';
import { ImportPostDraftsDialog, readPostDraftsFiles, type DraftsReview } from '../components/posts/ImportPostDrafts';
import { ExportPostsDialog } from '../components/posts/ExportPosts';
import { FeedTileFace, PostChip, WorldDot, postTitle } from '../components/posts/PostBits';
import {
  STATUS_LABEL,
  STATUS_ORDER,
  WEEK_PLAN,
  addDays,
  dateKey,
  feedOrder,
  monthGrid,
  nextStatus,
  postForDay,
  postsByDay,
  previousStatus,
  sameDay,
  startOfWeek,
  type Post,
  type PostStatus,
} from '../posts/model';

type View = 'week' | 'month' | 'grid' | 'board' | 'ideas';
const VIEWS: { id: View; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'grid', label: 'Grid' },
  { id: 'board', label: 'Board' },
  { id: 'ideas', label: 'Ideas' },
];
const VIEW_KEY = 'yourigin.posts.view';

function rememberedView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v && VIEWS.some((x) => x.id === v)) return v as View;
  } catch {
    /* private mode */
  }
  return 'week';
}

function parseDay(v: string | null): Date | null {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function useNewPostForDay() {
  const navigate = useNavigate();
  return async (day: Date) => {
    const p = postForDay(day);
    const id = await createPost({ scheduledAt: p.scheduledAt, world: p.world, format: p.format });
    navigate(`/posts/${id}`);
  };
}

function Unplaced({ posts }: { posts: Post[] }) {
  const unplaced = posts.filter((p) => p.scheduledAt === null);
  if (!unplaced.length) return null;
  return (
    <section className="mt-8" aria-labelledby="unplaced-heading">
      <h2 id="unplaced-heading" className="section-heading mb-3 font-serif text-xl">
        Not placed yet
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {unplaced.map((p) => (
          <li key={p.id}>
            <PostChip post={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function WeekView({ posts, at, setAt }: { posts: Post[]; at: Date; setAt: (d: Date) => void }) {
  const monday = startOfWeek(at);
  const byDay = postsByDay(posts);
  const today = new Date();
  const add = useNewPostForDay();
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <button type="button" className="btn-ghost" onClick={() => setAt(addDays(monday, -7))} aria-label="Previous week">
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-center font-serif text-xl">
          {monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – {addDays(monday, 6).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
        </h2>
        <button type="button" className="btn-ghost" onClick={() => setAt(addDays(monday, 7))} aria-label="Next week">
          <ChevronRight size={18} />
        </button>
      </div>
      <ol className="space-y-3">
        {days.map((d) => {
          const plan = WEEK_PLAN[d.getDay()];
          const list = byDay.get(dateKey(d)) ?? [];
          return (
            <li key={dateKey(d)} className={`panel p-3 ${sameDay(d, today) ? 'border-accent/60' : ''}`}>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-serif text-lg">{d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric' })}</span>
                <span className="flex items-center gap-1.5 text-xs text-ink-2">
                  {plan.world && <WorldDot world={plan.world} />}
                  {plan.label}
                </span>
                <button type="button" className="btn-ghost ml-auto min-h-9 px-2" onClick={() => void add(d)} aria-label={`New post on ${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}`}>
                  <Plus size={16} />
                </button>
              </div>
              {list.length ? (
                <ul className="grid gap-2 md:grid-cols-2">
                  {list.map((p) => (
                    <li key={p.id}>
                      <PostChip post={p} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Nothing planned.</p>
              )}
            </li>
          );
        })}
      </ol>
      <Unplaced posts={posts} />
    </>
  );
}

function MonthView({ posts, at, setAt }: { posts: Post[]; at: Date; setAt: (d: Date) => void }) {
  const month = new Date(at.getFullYear(), at.getMonth(), 1);
  const byDay = postsByDay(posts);
  const [picked, setPicked] = useState<Date>(() => at);
  const add = useNewPostForDay();
  const today = new Date();
  const pickedList = byDay.get(dateKey(picked)) ?? [];
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <button type="button" className="btn-ghost" onClick={() => setAt(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <h2 className="font-serif text-xl">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button type="button" className="btn-ghost" onClick={() => setAt(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted" aria-hidden>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {monthGrid(month).map((d) => {
          const list = byDay.get(dateKey(d)) ?? [];
          const inMonth = d.getMonth() === month.getMonth();
          const isPicked = sameDay(d, picked);
          return (
            <button
              key={dateKey(d)}
              type="button"
              onClick={() => setPicked(d)}
              aria-pressed={isPicked}
              aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}, ${list.length} post${list.length === 1 ? '' : 's'}`}
              className={`flex min-h-14 flex-col items-stretch rounded-lg border p-1 text-left md:min-h-24 ${isPicked ? 'border-accent' : 'border-line'} ${inMonth ? 'bg-card' : 'bg-transparent opacity-50'}`}
            >
              <span className={`text-xs tabular-nums ${sameDay(d, today) ? 'font-bold text-accent' : 'text-ink-2'}`}>{d.getDate()}</span>
              <span className="mt-1 flex flex-wrap gap-1 md:hidden">
                {list.map((p) => (
                  <WorldDot key={p.id} world={p.world} className="h-2 w-2" />
                ))}
              </span>
              <span className="mt-1 hidden space-y-1 md:block">
                {list.slice(0, 3).map((p) => (
                  <span key={p.id} className="flex items-center gap-1 truncate text-[11px] text-ink">
                    <WorldDot world={p.world} className="h-2 w-2" />
                    <span className="truncate">{postTitle(p)}</span>
                  </span>
                ))}
                {list.length > 3 && <span className="block text-[11px] text-muted">+{list.length - 3} more</span>}
              </span>
            </button>
          );
        })}
      </div>
      <section className="mt-5" aria-live="polite">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="font-serif text-lg">{picked.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          <span className="text-xs text-ink-2">{WEEK_PLAN[picked.getDay()].label}</span>
          <button type="button" className="btn ml-auto" onClick={() => void add(picked)}>
            <Plus size={16} /> Post
          </button>
        </div>
        {pickedList.length ? (
          <ul className="grid gap-2 md:grid-cols-2">
            {pickedList.map((p) => (
              <li key={p.id}>
                <PostChip post={p} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing planned.</p>
        )}
      </section>
    </>
  );
}

/**
 * The profile grid, as followers will see it: newest top-left, three across.
 * Moving a post swaps it into another post's planned time, so the order here
 * is the schedule. Drag on a laptop; on the phone, tap Arrange, tap a post,
 * then tap where it should go.
 */
function GridView({ posts }: { posts: Post[] }) {
  const navigate = useNavigate();
  const toast = useToast();
  const feed = feedOrder(posts);
  const [arranging, setArranging] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const move = async (id: string, toIndex: number) => {
    const post = feed.find((p) => p.id === id);
    if (post?.status === 'posted') {
      toast('That one is already posted, so it stays where it is.');
      return;
    }
    const changed = await movePostInFeed(feed, id, toIndex);
    if (!changed && feed.findIndex((p) => p.id === id) !== toIndex) toast('Posted posts stay where they are, so it can’t move past one.');
  };

  const tap = (p: Post, index: number) => {
    if (!arranging) {
      navigate(`/posts/${p.id}`);
      return;
    }
    if (!picked) {
      if (p.status === 'posted') toast('That one is already posted, so it stays where it is.');
      else setPicked(p.id);
      return;
    }
    if (picked !== p.id) void move(picked, index);
    setPicked(null);
  };

  if (!feed.length) {
    return (
      <>
        <EmptyState title="The grid is empty">Give a post a date and time and it appears here, in the place it will take in your profile.</EmptyState>
        <Unplaced posts={posts} />
      </>
    );
  }

  const hidden = posts.filter((p) => p.scheduledAt !== null && p.format === 'story').length;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-ink-2">
          {arranging ? (picked ? 'Now tap where it should go.' : 'Tap the post to move.') : 'Your profile as it will look, newest first.'}
        </p>
        <button
          type="button"
          className={arranging ? 'btn-primary' : 'btn'}
          aria-pressed={arranging}
          onClick={() => {
            setArranging(!arranging);
            setPicked(null);
          }}
        >
          <Move size={16} /> {arranging ? 'Done' : 'Arrange'}
        </button>
      </div>
      <ol className="mx-auto grid max-w-xl grid-cols-3 gap-0.5 overflow-hidden rounded-lg bg-line" aria-label="Profile grid">
        {feed.map((p, i) => (
          <li
            key={p.id}
            onDragOver={(e: DragEvent) => {
              if (!dragging) return;
              e.preventDefault();
              setOver(i);
            }}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              if (dragging && dragging !== p.id) void move(dragging, i);
              setDragging(null);
              setOver(null);
            }}
          >
            <button
              type="button"
              draggable={p.status !== 'posted'}
              onDragStart={(e: DragEvent) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', p.id);
                setDragging(p.id);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onClick={() => tap(p, i)}
              aria-pressed={arranging ? picked === p.id : undefined}
              aria-label={`${postTitle(p)}, ${STATUS_LABEL[p.status]}${p.scheduledAt ? `, ${new Date(p.scheduledAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}`}
              className={`relative block w-full transition ${picked === p.id ? 'z-10 scale-95 outline outline-3 outline-accent' : ''} ${over === i && dragging !== p.id ? 'opacity-60 outline outline-2 outline-accent' : ''} ${dragging === p.id ? 'opacity-40' : ''} ${arranging && p.status === 'posted' ? 'cursor-not-allowed' : arranging ? 'cursor-move' : ''}`}
            >
              <FeedTileFace post={p} />
            </button>
          </li>
        ))}
      </ol>
      {hidden > 0 && <p className="mt-3 text-center text-xs text-muted">Stories aren’t shown here: they don’t appear in the profile grid.</p>}
      <Unplaced posts={posts} />
    </>
  );
}

function BoardView({ posts }: { posts: Post[] }) {
  const [column, setColumn] = useState<PostStatus>('draft');
  const sorted = [...posts].sort((a, b) => (a.scheduledAt ?? Infinity) - (b.scheduledAt ?? Infinity));
  const col = (s: PostStatus) => sorted.filter((p) => p.status === s);
  return (
    <>
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl border border-line p-1 md:hidden" role="tablist" aria-label="Status">
        {STATUS_ORDER.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={column === s} className={`rounded-lg px-1 py-2 text-xs font-semibold ${column === s ? 'bg-accent text-accent-ink' : 'text-ink-2'}`} onClick={() => setColumn(s)}>
            {STATUS_LABEL[s]} <span className="font-normal opacity-80">{col(s).length}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {STATUS_ORDER.map((s) => (
          <section key={s} className={`${column === s ? '' : 'hidden'} md:block`} aria-labelledby={`col-${s}`}>
            <h2 id={`col-${s}`} className="mb-2 hidden font-serif text-lg md:block">
              {STATUS_LABEL[s]} <span className="text-sm text-muted">{col(s).length}</span>
            </h2>
            <ul className="space-y-2">
              {col(s).map((p) => {
                const back = previousStatus(p.status);
                const next = nextStatus(p.status);
                return (
                  <li key={p.id} className="space-y-1">
                    <PostChip post={p} showStatus={false} />
                    {p.scheduledAt !== null && (
                      <p className="px-1 text-[11px] text-muted">{new Date(p.scheduledAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    )}
                    <div className="flex justify-between gap-1">
                      {back ? (
                        <button type="button" className="btn-ghost min-h-9 px-2 text-xs" onClick={() => void setPostStatus(p.id, back)}>
                          <ArrowLeft size={14} /> {STATUS_LABEL[back]}
                        </button>
                      ) : (
                        <span />
                      )}
                      {next && (
                        <button type="button" className="btn-ghost min-h-9 px-2 text-xs" onClick={() => void setPostStatus(p.id, next)}>
                          {next === 'approved' ? 'Approve' : next === 'posted' ? 'Mark posted' : STATUS_LABEL[next]} <ArrowRight size={14} />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
              {!col(s).length && <li className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">None</li>}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

/**
 * Ideas: photos and videos kept to sort through later, like a camera roll.
 * Tap one to open it; select several to combine them into one post (a carousel).
 */
function IdeasView({ posts }: { posts: Post[] }) {
  const navigate = useNavigate();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const ideas = posts.filter((p) => p.status === 'idea').sort((a, b) => b.createdAt - a.createdAt);

  const add = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const { media } = await collectImportFiles(files);
      const n = await addIdeas([...media.values()]);
      toast(n ? `${n} idea${n === 1 ? '' : 's'} added.` : 'Those files aren’t images or videos.');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const finish = () => {
    setSelecting(false);
    setChosen([]);
  };
  const combine = async () => {
    const id = await combinePosts(chosen);
    finish();
    if (id) {
      toast(`Combined ${chosen.length} ideas into one post.`);
      navigate(`/posts/${id}`);
    }
  };
  const setAside = async () => {
    for (const id of chosen) await deletePost(id);
    toast(`${chosen.length} idea${chosen.length === 1 ? '' : 's'} set aside.`);
    finish();
  };

  return (
    <section
      aria-label="Ideas"
      onDragOver={(e: DragEvent) => {
        if ([...e.dataTransfer.types].includes('Files')) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: DragEvent) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setOver(false);
        void add([...e.dataTransfer.files]);
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-ink-2">
          {selecting ? (chosen.length ? `${chosen.length} selected, in the order you tapped them.` : 'Tap ideas to select them.') : 'Photos and videos you might post. Sort through them when you’re ready.'}
        </p>
        {ideas.length > 0 && (
          <button type="button" className={selecting ? 'btn-primary' : 'btn'} aria-pressed={selecting} onClick={() => (selecting ? finish() : setSelecting(true))}>
            {selecting ? 'Done' : 'Select'}
          </button>
        )}
        <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>
          <ImagePlus size={16} /> {busy ? 'Adding…' : 'Add ideas'}
        </button>
      </div>

      {ideas.length ? (
        <ol className={`mx-auto grid max-w-xl grid-cols-3 gap-0.5 overflow-hidden rounded-lg bg-line ${over ? 'outline outline-2 outline-accent' : ''}`} aria-label="Ideas">
          {ideas.map((p) => {
            const n = chosen.indexOf(p.id);
            return (
              <li key={p.id} className="relative">
                <button
                  type="button"
                  className={`block w-full ${n >= 0 ? 'opacity-80' : ''}`}
                  aria-pressed={selecting ? n >= 0 : undefined}
                  aria-label={selecting ? `Select ${postTitle(p)}` : `Open ${postTitle(p)}`}
                  onClick={() => (selecting ? toggle(p.id) : navigate(`/posts/${p.id}`))}
                >
                  <FeedTileFace post={p} />
                </button>
                {selecting && (
                  <span className={`pointer-events-none absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${n >= 0 ? 'border-white bg-accent text-accent-ink' : 'border-white/90 bg-black/30'}`} aria-hidden>
                    {n >= 0 ? n + 1 : ''}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className={`mx-auto flex w-full max-w-xl flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center ${over ? 'border-accent bg-accent/10' : 'border-line'}`}
        >
          <Lightbulb size={36} className="text-ink-2" aria-hidden />
          <span className="font-serif text-xl text-ink">{busy ? 'Adding…' : 'Keep photos and videos here'}</span>
          <span className="max-w-sm text-sm text-ink-2">Anything you might post one day. Each becomes an idea; combine a few into a carousel when you’re ready.</span>
        </button>
      )}

      {selecting && chosen.length > 0 && (
        <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 mt-4 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-line bg-card/95 p-3 backdrop-blur md:bottom-0">
          <button type="button" className="btn-ghost text-seed" onClick={() => void setAside()}>
            Set aside
          </button>
          <button type="button" className="btn-primary" disabled={chosen.length < 2} onClick={() => void combine()}>
            Combine into one post ({chosen.length})
          </button>
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept={POST_MEDIA_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Photos and videos to keep as ideas"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void add(files);
        }}
      />
    </section>
  );
}

/** Social media posts: planned on a calendar or profile grid, written, reviewed and approved here. */
export function Posts() {
  const posts = usePosts();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const view = (VIEWS.find((v) => v.id === params.get('view'))?.id ?? rememberedView()) as View;
  const at = parseDay(params.get('at')) ?? new Date();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<DraftsReview | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [exporting, setExporting] = useState(false);

  const setView = (v: View) => {
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode */
    }
    const next = new URLSearchParams(params);
    next.set('view', v);
    setParams(next, { replace: true });
  };
  const setAt = (d: Date) => {
    const next = new URLSearchParams(params);
    next.set('at', dateKey(d));
    setParams(next, { replace: true });
  };

  const openFiles = async (files: File[]) => {
    if (!files.length) return;
    try {
      setReview(await readPostDraftsFiles(files));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };

  /** Images and videos for posts already here, matched by the file names they list. */
  const attachMedia = async (files: File[]) => {
    if (!files.length) return;
    setAttaching(true);
    try {
      const { media } = await collectImportFiles(files);
      const r = await attachMediaToPosts(media);
      toast(r.posts ? `Added ${r.files} image${r.files === 1 ? '' : 's'} and video${r.files === 1 ? '' : 's'} to ${r.posts} post${r.posts === 1 ? '' : 's'}.` : 'None of those files are named in your posts.');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setAttaching(false);
    }
  };

  return (
    <div className="page-frame">
      <header className="page-intro flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Posts</h1>
          <p className="mt-3 max-w-xl font-serif text-lg text-ink-2">Plan, write and approve what you share on Instagram. Posts link to your pieces; they never copy them.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => fileInput.current?.click()} title="Pick the drafts file with its images and videos, or a .zip">
            <Upload size={16} /> Import drafts
          </button>
          <button type="button" className="btn hidden md:inline-flex" onClick={() => folderInput.current?.click()} title="Pick a folder that holds a drafts file and its images and videos">
            <FolderOpen size={16} /> Import a folder
          </button>
          <button type="button" className="btn" disabled={attaching} onClick={() => mediaInput.current?.click()} title="Add images and videos to posts that list them by file name">
            <ImagePlus size={16} /> {attaching ? 'Adding…' : 'Add media'}
          </button>
          <button type="button" className="btn" onClick={() => setExporting(true)}>
            <Download size={16} /> Export approved
          </button>
          <button type="button" className="btn-primary" onClick={async () => navigate(`/posts/${await createPost()}`)}>
            <Plus size={16} /> New post
          </button>
        </div>
      </header>

      <div className="mb-5 grid grid-cols-5 gap-1 rounded-xl border border-line p-1 sm:inline-grid" role="tablist" aria-label="View">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={`rounded-lg px-2 py-2 text-sm font-medium sm:px-4 ${view === v.id ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:text-ink'}`} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>

      {!posts ? (
        <Spinner />
      ) : view === 'week' ? (
        <WeekView posts={posts} at={at} setAt={setAt} />
      ) : view === 'month' ? (
        <MonthView key={`${at.getFullYear()}-${at.getMonth()}`} posts={posts} at={at} setAt={setAt} />
      ) : view === 'grid' ? (
        <GridView posts={posts} />
      ) : view === 'ideas' ? (
        <IdeasView posts={posts} />
      ) : (
        <BoardView posts={posts} />
      )}

      {posts && !posts.length && view !== 'grid' && view !== 'ideas' && (
        <p className="mt-6 text-center text-sm text-muted">
          No posts yet. Tap a day to start one, or{' '}
          <button type="button" className="underline" onClick={() => fileInput.current?.click()}>
            import drafts
          </button>
          .
        </p>
      )}

      <input
        ref={fileInput}
        type="file"
        accept={POST_IMPORT_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Post drafts file, with its images and videos"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void openFiles(files);
        }}
      />
      <input
        ref={(el) => {
          folderInput.current = el;
          // Folder picking is a non-standard attribute React doesn't know.
          el?.setAttribute('webkitdirectory', '');
        }}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Folder with a drafts file and its media"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void openFiles(files);
        }}
      />
      <input
        ref={mediaInput}
        type="file"
        accept={POST_MEDIA_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Images and videos for your posts"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void attachMedia(files);
        }}
      />
      <ImportPostDraftsDialog review={review} onClose={() => setReview(null)} />
      <ExportPostsDialog open={exporting} onClose={() => setExporting(false)} posts={posts ?? []} />
    </div>
  );
}
