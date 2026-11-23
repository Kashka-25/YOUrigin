import { db } from './db';
import { newId } from '../domain/text';
import type { PostEdit } from '../posts/model';

// Edit requests on a post (see posts/edits.ts). Each change runs in a transaction on the
// post's own list, so the post editor's autosave (which never writes `edits`) can't undo it.

async function changeEdits(postId: string, change: (edits: PostEdit[]) => PostEdit[]): Promise<void> {
  await db.transaction('rw', db.posts, async () => {
    const post = await db.posts.get(postId);
    if (!post) throw new Error('This post no longer exists.');
    await db.posts.update(postId, { edits: change(post.edits ?? []), updatedAt: Date.now() });
  });
}

/** Adds a request. Blank text adds nothing. Returns the new request's id, or null. */
export async function addPostEdit(postId: string, text: string, now = Date.now()): Promise<string | null> {
  const clean = text.trim();
  if (!clean) return null;
  const edit: PostEdit = { id: newId(), text: clean, createdAt: now, doneAt: null };
  await changeEdits(postId, (edits) => [...edits, edit]);
  return edit.id;
}

/** Marks a request done, with an optional note of what changed. */
export async function finishPostEdit(postId: string, editId: string, reply = '', now = Date.now()): Promise<void> {
  const note = reply.trim();
  await changeEdits(postId, (edits) =>
    edits.map((e) => {
      if (e.id !== editId) return e;
      const done: PostEdit = { id: e.id, text: e.text, createdAt: e.createdAt, doneAt: now };
      return note ? { ...done, reply: note } : done;
    }),
  );
}

/** Puts a done request back on the waiting list (its note stays, for context). */
export async function reopenPostEdit(postId: string, editId: string): Promise<void> {
  await changeEdits(postId, (edits) => edits.map((e) => (e.id === editId ? { ...e, doneAt: null } : e)));
}

/** Changes the words of a request. */
export async function rewordPostEdit(postId: string, editId: string, text: string): Promise<void> {
  const clean = text.trim();
  if (!clean) return;
  await changeEdits(postId, (edits) => edits.map((e) => (e.id === editId ? { ...e, text: clean } : e)));
}

/** Removes a request for good. */
export async function removePostEdit(postId: string, editId: string): Promise<void> {
  await changeEdits(postId, (edits) => edits.filter((e) => e.id !== editId));
}
