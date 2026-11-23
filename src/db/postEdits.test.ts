import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createPost, updatePost } from './posts';
import { addPostEdit, finishPostEdit, removePostEdit, reopenPostEdit, rewordPostEdit } from './postEdits';
import { doneEdits, openEdits, postsWithOpenEdits } from '../posts/edits';
import { exportBackup } from './backup';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('edit requests on a post', () => {
  it('keeps requests in the order asked, and blank ones add nothing', async () => {
    const id = await createPost({ hook: 'North Star' });
    await addPostEdit(id, '  Keep only the sun in colour  ', 1000);
    await addPostEdit(id, 'Move the poem lower', 2000);
    expect(await addPostEdit(id, '   ')).toBeNull();
    const post = (await db.posts.get(id))!;
    expect(openEdits(post).map((e) => e.text)).toEqual(['Keep only the sun in colour', 'Move the poem lower']);
    expect(post.hook).toBe('North Star');
  });

  it('marks a request done with a note, can reopen it, reword it and remove it', async () => {
    const id = await createPost();
    const a = (await addPostEdit(id, 'Crop tighter', 1000))!;
    const b = (await addPostEdit(id, 'Swap the poem', 2000))!;
    await finishPostEdit(id, a, '  Cropped to the jacket  ', 3000);
    let post = (await db.posts.get(id))!;
    expect(openEdits(post).map((e) => e.id)).toEqual([b]);
    expect(doneEdits(post)).toMatchObject([{ id: a, doneAt: 3000, reply: 'Cropped to the jacket' }]);

    await reopenPostEdit(id, a);
    await rewordPostEdit(id, a, 'Crop tighter, to the jacket');
    post = (await db.posts.get(id))!;
    expect(openEdits(post).map((e) => e.text)).toEqual(['Crop tighter, to the jacket', 'Swap the poem']);

    await finishPostEdit(id, a);
    expect((await db.posts.get(id))!.edits!.find((e) => e.id === a)).not.toHaveProperty('reply');

    await removePostEdit(id, b);
    expect((await db.posts.get(id))!.edits!.map((e) => e.id)).toEqual([a]);
  });

  it('survives the editor saving its other fields', async () => {
    const id = await createPost();
    await addPostEdit(id, 'Brighter colour on the flamingos');
    await updatePost(id, { caption: 'New words', notes: 'Notes' });
    expect(openEdits((await db.posts.get(id))!)).toHaveLength(1);
  });

  it('lists the posts with waiting requests, the longest-waiting first, leaving out set-aside posts', async () => {
    const a = await createPost({ hook: 'a' });
    const b = await createPost({ hook: 'b' });
    const c = await createPost({ hook: 'c', deletedAt: 1 });
    const d = await createPost({ hook: 'd' });
    await addPostEdit(a, 'later', 5000);
    await addPostEdit(b, 'sooner', 1000);
    await addPostEdit(c, 'set aside', 500);
    const done = (await addPostEdit(d, 'done already', 100))!;
    await finishPostEdit(d, done);
    expect(postsWithOpenEdits(await db.posts.toArray()).map((p) => p.hook)).toEqual(['b', 'a']);
  });

  it('goes into the backup with its post', async () => {
    const id = await createPost();
    await addPostEdit(id, 'In the backup too');
    const backup = JSON.stringify(await exportBackup());
    expect(backup).toContain('In the backup too');
  });

  it('fails clearly when the post is gone', async () => {
    await expect(addPostEdit('missing', 'hello')).rejects.toThrow('no longer exists');
  });
});
