import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Download, FolderOpen, ImagePlus, Images, Lightbulb, Move, Plus, Upload } from 'lucide-react';
import { EmptyState, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';
import { combinePosts, createPost, deletePost, movePostInFeed, setPostStatus, usePosts } from '../db/posts';
import { POST_IMPORT_ACCEPT, POST_MEDIA_ACCEPT, collectImportFiles } from '../io/postMedia';
import { addIdeas, attachMediaToPosts } from '../db/postMedia';
import { ImportPostDraftsDialog, readPostDraftsFiles, type DraftsReview } from '../components/posts/ImportPostDrafts';
import { ExportPostsDialog } from '../components/posts/ExportPosts';
import { FeedTileFace, PostChip, WorldDot, postTitle } from '../components/posts/PostBits';
import { GalleryPicker } from '../components/posts/GalleryPicker';
import { GalleryView } from '../components/art/GalleryView';
import { DEMO } from '../demo/mode';
import { AccountSwitcher, MoveToAccount } from '../components/posts/Accounts';
import { EditsWaiting } from '../components/posts/PostEdits';
import { movePostsToAccount, usePoemIdeasToMove, usePostAccounts } from '../db/postAccounts';
import { MAIN_ACCOUNT, POETRY_ACCOUNT, accountLabel, accountOf, rememberShownAccount, shownAccount, type PostAccount } from '../posts/accounts';
import {
  STATUS_LABEL,
  isFeedFormat,
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

type View = 'week' | 'month' | 'grid' | 'board' | 'ideas' | 'gallery';
const VIEWS: { id: View; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'grid', label: 'Grid' },
  { id: 'board', label: 'Board' },
  { id: 'ideas', label: 'Ideas' },
  { id: 'gallery', label: 'Gallery' },
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
const GRID_IDEAS_KEY = 'yourigin.posts.gridIdeas.';

/** Whether the grid shows undated posts as a preview: remembered per account, on at first except for the main one. */
function rememberedGridIdeas(account: string): boolean {
  try {
    const v = localStorage.getItem(GRID_IDEAS_KEY + account);
    if (v) return v === 'on';
  } catch {
    /* private mode */
  }
  return account !== MAIN_ACCOUNT;
}

function GridView({ posts, account }: { posts: Post[]; account: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const feed = feedOrder(posts);
  // Posts with no date yet (mostly ideas), shown ahead of the planned feed as a preview of the profile.
  const undated = posts.filter((p) => p.scheduledAt === null && isFeedFormat(p.format)).sort((a, b) => b.createdAt - a.createdAt);
  const [withIdeas, setWithIdeasState] = useState(() => rememberedGridIdeas(account));
  const setWithIdeas = (on: boolean) => {
    setWithIdeasState(on);
    try {
      localStorage.setItem(GRID_IDEAS_KEY + account, on ? 'on' : 'off');
    } catch {
      /* private mode */
    }
  };
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

  const preview = withIdeas && !arranging ? undated : [];
  const ideasToggle = undated.length > 0 && (
    <button type="button" className={withIdeas ? 'btn-primary' : 'btn'} aria-pressed={withIdeas} onClick={() => setWithIdeas(!withIdeas)} title="Show posts with no date yet, ahead of the planned ones">
      <Lightbulb size={16} /> Ideas {undated.length}
    </button>
  );

  if (!feed.length && !preview.length) {
    return (
      <>
        {ideasToggle && <div className="mb-3 flex justify-end">{ideasToggle}</div>}
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
          {arranging
            ? picked
              ? 'Now tap where it should go.'
              : 'Tap the post to move.'
            : preview.length
              ? 'Your profile as it could look: posts with no date yet come first, marked “No date”.'
              : 'Your profile as it will look, newest first.'}
        </p>
        {!arranging && ideasToggle}
        {feed.length > 0 && <button
          type="button"
          className={arranging ? 'btn-primary' : 'btn'}
          aria-pressed={arranging}
          onClick={() => {
            setArranging(!arranging);
            setPicked(null);
          }}
        >
          <Move size={16} /> {arranging ? 'Done' : 'Arrange'}
        </button>}
      </div>
      <ol className="mx-auto grid max-w-xl grid-cols-3 gap-0.5 overflow-hidden rounded-lg bg-line" aria-label="Profile grid">
        {preview.map((p) => (
          <li key={p.id} className="relative">
            <button type="button" onClick={() => navigate(`/posts/${p.id}`)} aria-label={`${postTitle(p)}, ${STATUS_LABEL[p.status]}, no date yet`} className="relative block w-full">
              <FeedTileFace post={p} />
            </button>
            <span className="pointer-events-none absolute left-1 top-1 z-10 rounded border border-dashed border-white/70 bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white" aria-hidden>
              No date
            </span>
          </li>
        ))}
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
      {/* Posts with no date that aren't already in the preview above (Stories, or all of them with Ideas off). */}
      <Unplaced posts={posts.filter((p) => !preview.includes(p))} />
    </>
  );
}

const STAGE_KEY = 'yourigin.posts.stage';
const STAGE_HINT: Record<PostStatus, string> = {
  idea: 'Ideas waiting to be written.',
  draft: 'Being written. Approve one when it’s ready.',
  approved: 'Ready to go out.',
  posted: 'Already on Instagram.',
};

function rememberedStage(): PostStatus {
  try {
    const v = localStorage.getItem(STAGE_KEY);
    if (v && (STATUS_ORDER as string[]).includes(v)) return v as PostStatus;
  } catch {
    /* private mode */
  }
  return 'draft';
}

/**
 * The board, as pictures: one stage at a time (Idea, Draft, Approved, Posted), laid out like
 * the profile grid. Tap a post to open it. To move posts between stages, tap Select (or
 * long-press a post), pick one or several, then choose the stage; on a laptop, a post can
 * also be dragged onto a stage's tab.
 */
function BoardView({ posts, accounts, account }: { posts: Post[]; accounts: PostAccount[]; account: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [stage, setStageState] = useState<PostStatus>(rememberedStage);
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<PostStatus | null>(null);

  const setStage = (s: PostStatus) => {
    setStageState(s);
    try {
      localStorage.setItem(STAGE_KEY, s);
    } catch {
      /* private mode */
    }
  };
  // Dated posts first, soonest first; undated ones after, newest first.
  const sorted = [...posts].sort((a, b) => (a.scheduledAt ?? Infinity) - (b.scheduledAt ?? Infinity) || b.createdAt - a.createdAt);
  const inStage = (s: PostStatus) => sorted.filter((p) => p.status === s);
  const shown = inStage(stage);

  const stopSelecting = () => {
    setSelecting(false);
    setChosen([]);
  };
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const moveTo = async (ids: string[], to: PostStatus) => {
    const moving = ids.filter((id) => posts.find((p) => p.id === id)?.status !== to);
    for (const id of moving) await setPostStatus(id, to);
    if (moving.length) toast(`${moving.length === 1 ? 'Moved' : `${moving.length} moved`} to ${STATUS_LABEL[to]}.`);
  };

  return (
    <>
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl border border-line p-1" role="tablist" aria-label="Stage">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={stage === s}
            className={`rounded-lg px-1 py-2 text-xs font-semibold transition sm:text-sm ${stage === s ? 'bg-accent text-accent-ink' : 'text-ink-2'} ${overStage === s ? 'outline outline-2 outline-accent' : ''}`}
            onClick={() => setStage(s)}
            onDragOver={(e: DragEvent) => {
              if (!dragging) return;
              e.preventDefault();
              setOverStage(s);
            }}
            onDragLeave={() => setOverStage((o) => (o === s ? null : o))}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              if (dragging) void moveTo([dragging], s);
              setDragging(null);
              setOverStage(null);
            }}
          >
            {STATUS_LABEL[s]} <span className="font-normal opacity-80">{inStage(s).length}</span>
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-ink-2">
          {selecting ? (chosen.length ? `${chosen.length} selected.` : 'Tap the posts to move.') : STAGE_HINT[stage]}
        </p>
        {shown.length > 0 && (
          <button type="button" className={selecting ? 'btn-primary' : 'btn'} aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
            <Move size={16} /> {selecting ? 'Done' : 'Select'}
          </button>
        )}
      </div>
      {shown.length ? (
        <ol className="mx-auto grid max-w-3xl grid-cols-3 gap-0.5 overflow-hidden rounded-lg bg-line sm:grid-cols-4" aria-label={`${STATUS_LABEL[stage]} posts`}>
          {shown.map((p) => {
            const n = chosen.indexOf(p.id);
            return (
              <li key={p.id} className="relative">
                <button
                  type="button"
                  draggable
                  onDragStart={(e: DragEvent) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', p.id);
                    setDragging(p.id);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOverStage(null);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelecting(true);
                    setChosen((c) => (c.includes(p.id) ? c : [...c, p.id]));
                  }}
                  onClick={() => (selecting ? toggle(p.id) : navigate(`/posts/${p.id}`))}
                  aria-pressed={selecting ? n >= 0 : undefined}
                  aria-label={`${selecting ? (n >= 0 ? 'Unselect ' : 'Select ') : ''}${postTitle(p)}${p.scheduledAt ? `, ${new Date(p.scheduledAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ', no date yet'}`}
                  className={`relative block w-full transition ${n >= 0 ? 'z-10 scale-95 outline outline-3 outline-accent' : ''} ${dragging === p.id ? 'opacity-40' : ''}`}
                >
                  <FeedTileFace post={p} />
                </button>
                {selecting && (
                  <span className={`pointer-events-none absolute left-1.5 top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${n >= 0 ? 'border-white bg-accent text-accent-ink' : 'border-white/90 bg-black/30'}`} aria-hidden>
                    {n >= 0 ? n + 1 : ''}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">Nothing in {STATUS_LABEL[stage]} right now.</p>
      )}
      {selecting && chosen.length > 0 && (
        <div className={`sticky ${DEMO ? 'bottom-[calc(124px+env(safe-area-inset-bottom))]' : 'bottom-[calc(64px+env(safe-area-inset-bottom))]'} z-20 mt-4 rounded-xl border border-line bg-card/95 p-3 backdrop-blur md:bottom-0`}>
          <p className="mb-2 text-sm text-ink-2">Move {chosen.length === 1 ? 'it' : `these ${chosen.length}`} to</p>
          <div className="grid grid-cols-3 gap-2">
            {STATUS_ORDER.filter((s) => s !== stage).map((s) => (
              <button
                key={s}
                type="button"
                className={s === nextStatus(stage) ? 'btn-primary' : 'btn'}
                onClick={() => {
                  const ids = chosen;
                  stopSelecting();
                  void moveTo(ids, s);
                }}
              >
                {s === previousStatus(stage) && <ArrowLeft size={14} />}
                {STATUS_LABEL[s]}
                {s === nextStatus(stage) && <ArrowRight size={14} />}
              </button>
            ))}
          </div>
          <MoveToAccount ids={chosen} accounts={accounts} current={account} onMoved={stopSelecting} />
        </div>
      )}
    </>
  );
}

/**
 * Ideas: photos and videos kept to sort through later, like a camera roll.
 * Tap one to open it; select several to combine them into one post (a carousel).
 */
function IdeasView({ posts, accounts, account }: { posts: Post[]; accounts: PostAccount[]; account: string }) {
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

  const [fromGallery, setFromGallery] = useState(false);
  // A post idea in words alone: kept as its own idea (a quote card until media is added).
  const [jot, setJot] = useState('');
  const keepJot = async (e: FormEvent) => {
    e.preventDefault();
    const text = jot.trim();
    if (!text) return;
    await createPost({ status: 'idea', format: 'quote-card', caption: text });
    setJot('');
    toast('Idea kept.');
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
      <form onSubmit={(e) => void keepJot(e)} className="mx-auto mb-4 flex max-w-xl gap-2">
        <input
          className="input min-w-0 flex-1"
          value={jot}
          onChange={(e) => setJot(e.target.value)}
          placeholder="Jot a post idea…"
          aria-label="A post idea in words"
          enterKeyHint="done"
        />
        <button type="submit" className="btn-primary shrink-0" disabled={!jot.trim()}>
          Keep
        </button>
      </form>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-ink-2">
          {selecting ? (chosen.length ? `${chosen.length} selected, in the order you tapped them.` : 'Tap ideas to select them.') : 'Words, photos and videos you might post.'}
        </p>
        {ideas.length > 0 && (
          <button type="button" className={selecting ? 'btn-primary' : 'btn'} aria-pressed={selecting} onClick={() => (selecting ? finish() : setSelecting(true))}>
            {selecting ? 'Done' : 'Select'}
          </button>
        )}
        <button type="button" className="btn" onClick={() => setFromGallery(true)}>
          <Images size={16} /> From Gallery
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>
          <ImagePlus size={16} /> {busy ? 'Adding…' : 'Add ideas'}
        </button>
      </div>
      <GalleryPicker open={fromGallery} onClose={() => setFromGallery(false)} onAdded={(n) => toast(n ? `${n} idea${n === 1 ? '' : 's'} added from your Gallery.` : 'Nothing was added.')} />

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
        <div className={`sticky ${DEMO ? 'bottom-[calc(124px+env(safe-area-inset-bottom))]' : 'bottom-[calc(64px+env(safe-area-inset-bottom))]'} z-20 mt-4 rounded-xl border border-line bg-card/95 p-3 backdrop-blur md:bottom-0`}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="btn-ghost text-seed" onClick={() => void setAside()}>
              Set aside
            </button>
            <button type="button" className="btn-primary" disabled={chosen.length < 2} onClick={() => void combine()}>
              Combine into one post ({chosen.length})
            </button>
          </div>
          <MoveToAccount ids={chosen} accounts={accounts} current={account} onMoved={finish} />
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
function MenuItem({ icon: Icon, label, hint, onClick, disabled, className = '' }: { icon: typeof Upload; label: string; hint: string; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-paper-2 disabled:opacity-50 ${className}`}>
      <Icon size={16} className="mt-0.5 shrink-0 text-ink-2" aria-hidden />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </button>
  );
}

const POEM_OFFER_KEY = 'yourigin.posts.poemIdeasOffer';

/**
 * A one-time offer: ideas whose notes start with "Poem idea:" were written for the poetry
 * account but sit in the main one. Nothing moves until Cassidy taps Move.
 */
function PoemIdeasOffer({ poetry, main }: { poetry: PostAccount | undefined; main: PostAccount | undefined }) {
  const toast = useToast();
  const ids = usePoemIdeasToMove();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(POEM_OFFER_KEY) === 'done';
    } catch {
      return false;
    }
  });
  if (!poetry || !main || dismissed || !ids?.length) return null;
  const done = () => {
    setDismissed(true);
    try {
      localStorage.setItem(POEM_OFFER_KEY, 'done');
    } catch {
      /* private mode */
    }
  };
  return (
    <div className="mb-4 rounded-xl border border-accent/50 bg-accent/10 p-3" role="status">
      <p className="text-sm text-ink">
        {ids.length} post{ids.length === 1 ? '' : 's'} in {accountLabel(main)} {ids.length === 1 ? 'has' : 'have'} notes starting “Poem idea:”. Move {ids.length === 1 ? 'it' : 'them'} to {accountLabel(poetry)}?
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          onClick={async () => {
            const n = await movePostsToAccount(ids, poetry.id);
            done();
            toast(`${n} moved to ${accountLabel(poetry)}.`);
          }}
        >
          Move {ids.length} to {accountLabel(poetry)}
        </button>
        <button type="button" className="btn-ghost" onClick={done}>
          Leave them
        </button>
      </div>
    </div>
  );
}

export function Posts() {
  const allPosts = usePosts();
  const accounts = usePostAccounts();
  const [accountChoice, setAccountChoice] = useState(shownAccount);
  // An account removed on another device falls back to the main one.
  const account = !accounts || accounts.some((a) => a.id === accountChoice) ? accountChoice : MAIN_ACCOUNT;
  const chooseAccount = (id: string) => {
    rememberShownAccount(id);
    setAccountChoice(id);
  };
  // Once the remembered account is gone, new posts go to the main one too.
  useEffect(() => {
    if (account !== accountChoice) {
      rememberShownAccount(account);
      setAccountChoice(account);
    }
  }, [account, accountChoice]);
  const posts = allPosts?.filter((p) => accountOf(p) === account);
  const counts: Record<string, number> = {};
  for (const p of allPosts ?? []) counts[accountOf(p)] = (counts[accountOf(p)] ?? 0) + 1;
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const view = (VIEWS.find((v) => v.id === params.get('view'))?.id ?? rememberedView()) as View;
  const at = parseDay(params.get('at')) ?? new Date();
  const fileInput = useRef<HTMLInputElement>(null);
  const filesMenu = useRef<HTMLDetailsElement>(null);
  // Tapping anywhere else closes the Files menu.
  useEffect(() => {
    const close = (e: PointerEvent) => {
      const menu = filesMenu.current;
      if (menu?.open && !menu.contains(e.target as Node)) menu.removeAttribute('open');
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
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
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Importing and exporting fold into one menu, so the page stays quiet. */}
          <details className="group relative" ref={filesMenu}>
            <summary className="btn list-none [&::-webkit-details-marker]:hidden" aria-label="Import and export">
              <FolderOpen size={16} /> {attaching ? 'Adding…' : 'Files'} <ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-line bg-card p-1.5 shadow-xl" onClick={() => filesMenu.current?.removeAttribute('open')}>
              <MenuItem icon={Upload} label="Import drafts" hint="A drafts file with its pictures, or a .zip" onClick={() => fileInput.current?.click()} />
              <MenuItem icon={FolderOpen} label="Import a folder" hint="A folder with a drafts file inside" onClick={() => folderInput.current?.click()} className="hidden md:flex" />
              <MenuItem icon={ImagePlus} label="Add media" hint="Pictures for posts that name them" onClick={() => mediaInput.current?.click()} disabled={attaching} />
              <MenuItem icon={Download} label="Export approved" hint="Ready posts, for scheduling" onClick={() => setExporting(true)} />
            </div>
          </details>
          <button type="button" className="btn-primary" onClick={async () => navigate(`/posts/${await createPost()}`)}>
            <Plus size={16} /> New post
          </button>
        </div>
      </header>

      {accounts && <AccountSwitcher accounts={accounts} current={account} counts={counts} onChoose={chooseAccount} />}
      {allPosts && accounts && (
        <EditsWaiting posts={allPosts} accountName={(p) => accountLabel(accounts.find((a) => a.id === accountOf(p)) ?? accounts[0])} />
      )}
      {accounts && <PoemIdeasOffer poetry={accounts.find((a) => a.id === POETRY_ACCOUNT)} main={accounts.find((a) => a.id === MAIN_ACCOUNT)} />}

      <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl border border-line p-1 sm:inline-grid sm:grid-cols-6" role="tablist" aria-label="View">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={`rounded-lg px-2 py-2 text-sm font-medium sm:px-4 ${view === v.id ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:text-ink'}`} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>

      {!posts || !accounts ? (
        <Spinner />
      ) : view === 'week' ? (
        <WeekView posts={posts} at={at} setAt={setAt} />
      ) : view === 'month' ? (
        <MonthView key={`${at.getFullYear()}-${at.getMonth()}`} posts={posts} at={at} setAt={setAt} />
      ) : view === 'grid' ? (
        <GridView key={account} posts={posts} account={account} />
      ) : view === 'ideas' ? (
        <IdeasView key={account} posts={posts} accounts={accounts} account={account} />
      ) : view === 'gallery' ? (
        <GalleryView addable />
      ) : (
        <BoardView key={account} posts={posts} accounts={accounts} account={account} />
      )}

      {posts && !posts.length && view !== 'grid' && view !== 'ideas' && view !== 'gallery' && (
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
