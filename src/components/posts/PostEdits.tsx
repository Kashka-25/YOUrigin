import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, MessageSquareText, RotateCcw, X } from 'lucide-react';
import { Modal } from '../Modal';
import { useToast } from '../Toast';
import { AutoTextarea } from '../AutoTextarea';
import { addPostEdit, finishPostEdit, removePostEdit, reopenPostEdit } from '../../db/postEdits';
import { doneEdits, openEdits, postsWithOpenEdits } from '../../posts/edits';
import type { Post, PostEdit } from '../../posts/model';
import { postTitle } from './PostBits';

const when = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** One waiting request: its words, and Done (with an optional note of what changed). */
function OpenEdit({ postId, edit }: { postId: string; edit: PostEdit }) {
  const [closing, setClosing] = useState(false);
  const [reply, setReply] = useState('');
  return (
    <li className="rounded-xl border border-line bg-card p-3">
      <p className="whitespace-pre-wrap text-sm text-ink">{edit.text}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="mr-auto text-xs text-muted">Asked {when(edit.createdAt)}</span>
        {!closing && (
          <>
            <button type="button" className="btn-ghost min-h-9 px-2 text-xs" aria-label="Remove this request" onClick={() => void removePostEdit(postId, edit.id)}>
              <X size={14} />
            </button>
            <button type="button" className="btn min-h-9 px-3 text-sm" onClick={() => setClosing(true)}>
              <Check size={15} /> Done
            </button>
          </>
        )}
      </div>
      {closing && (
        <form
          className="mt-2 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void finishPostEdit(postId, edit.id, reply);
          }}
        >
          <input
            className="input min-h-9 flex-1 py-1 text-sm"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="What changed? (optional)"
            aria-label="What changed"
            data-autofocus
          />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary min-h-9 px-3 text-sm">
              Mark done
            </button>
            <button type="button" className="btn-ghost min-h-9 px-2 text-sm" onClick={() => setClosing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

/**
 * The post's edit requests: type what to change, and Claude reads it, makes the change
 * and marks it done with a note. Done requests stay below, so there's a record.
 */
export function PostEditsPanel({ post }: { post: Post }) {
  const [text, setText] = useState('');
  const open = openEdits(post);
  const done = doneEdits(post);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await addPostEdit(post.id, text)) setText('');
  };
  return (
    <div className="space-y-3">
      {open.length > 0 && (
        <ol className="space-y-2" aria-label="Edits waiting">
          {open.map((edit) => (
            <OpenEdit key={edit.id} postId={post.id} edit={edit} />
          ))}
        </ol>
      )}
      <form onSubmit={(e) => void add(e)} className="space-y-2">
        <AutoTextarea
          id={`post-edit-${post.id}`}
          minHeight={64}
          className="input"
          ariaLabel="A new edit request"
          placeholder="Type an edit for Claude, e.g. keep only the jacket in colour, or move the poem into the sky"
          value={text}
          onChange={setText}
        />
        <div className="flex items-center gap-2">
          <p className="mr-auto text-xs text-muted">Claude reads these, makes the change and marks it done.</p>
          <button type="submit" className="btn-primary min-h-9 px-3 text-sm" disabled={!text.trim()}>
            Add edit
          </button>
        </div>
      </form>
      {done.length > 0 && (
        <details className="rounded-xl border border-line">
          <summary className="cursor-pointer list-none px-3 py-2 text-sm text-ink-2 [&::-webkit-details-marker]:hidden">Done ({done.length})</summary>
          <ol className="space-y-2 px-3 pb-3" aria-label="Edits done">
            {done.map((edit) => (
              <li key={edit.id} className="flex items-start gap-2 text-sm">
                <Check size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-pre-wrap text-ink-2 line-through decoration-muted/60">{edit.text}</span>
                  {edit.reply && <span className="mt-0.5 block text-ink">{edit.reply}</span>}
                  <span className="block text-xs text-muted">Done {when(edit.doneAt ?? edit.createdAt)}</span>
                </span>
                <button type="button" className="btn-ghost min-h-8 shrink-0 px-2 text-xs" onClick={() => void reopenPostEdit(post.id, edit.id)} aria-label="Ask again">
                  <RotateCcw size={14} />
                </button>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

/**
 * On the Posts page: every post with edits waiting, across all accounts, so nothing
 * typed is missed. Shows nothing when there are none.
 */
export function EditsWaiting({ posts, accountName }: { posts: Post[]; accountName: (p: Post) => string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const waiting = postsWithOpenEdits(posts);
  const count = waiting.reduce((n, p) => n + openEdits(p).length, 0);
  if (!count) return null;
  return (
    <>
      <button type="button" className="mb-4 flex w-full items-center gap-3 rounded-xl border border-accent/50 bg-accent/10 p-3 text-left" onClick={() => setOpen(true)}>
        <MessageSquareText size={18} className="shrink-0 text-accent" aria-hidden />
        <span className="flex-1 text-sm text-ink">
          {count} edit{count === 1 ? '' : 's'} waiting on {waiting.length} post{waiting.length === 1 ? '' : 's'}
        </span>
        <ChevronRight size={16} className="text-muted" aria-hidden />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edits waiting">
        <ol className="space-y-3">
          {waiting.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full rounded-xl border border-line bg-card p-3 text-left hover:border-accent/60"
                onClick={() => {
                  setOpen(false);
                  if (p.deletedAt) toast('That post is set aside.');
                  else navigate(`/posts/${p.id}`);
                }}
              >
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate font-serif text-[15px] text-ink">{postTitle(p)}</span>
                  <span className="shrink-0 text-xs text-muted">{accountName(p)}</span>
                </span>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-2">
                  {openEdits(p).map((e) => (
                    <li key={e.id} className="whitespace-pre-wrap">
                      {e.text}
                    </li>
                  ))}
                </ul>
              </button>
            </li>
          ))}
        </ol>
      </Modal>
    </>
  );
}
