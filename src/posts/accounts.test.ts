import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCOUNTS, MAIN_ACCOUNT, POETRY_ACCOUNT, accountLabel, accountOf, cleanHandle, isPoemIdea, mergeAccounts } from './accounts';
import { newPost } from './model';

describe('post accounts', () => {
  it('posts made before accounts existed belong to the main account', () => {
    expect(accountOf(newPost())).toBe(MAIN_ACCOUNT);
    expect(accountOf(newPost({ account: POETRY_ACCOUNT }))).toBe(POETRY_ACCOUNT);
  });

  it('starts with @_freethedream_ and a Poetry account waiting for its name', () => {
    const [main, poetry] = mergeAccounts([]);
    expect(main).toMatchObject({ id: MAIN_ACCOUNT, handle: '_freethedream_' });
    expect(poetry).toMatchObject({ id: POETRY_ACCOUNT, name: 'Poetry', handle: '' });
  });

  it('a saved edit replaces the starting account instead of adding a second one', () => {
    const named = { ...DEFAULT_ACCOUNTS[1], name: 'Quiet lines', handle: 'quiet.lines', updatedAt: 5 };
    const extra = { id: 'x', name: 'Music', handle: '', createdAt: 100, updatedAt: 100 };
    const all = mergeAccounts([extra, named]);
    expect(all.map((a) => a.id)).toEqual([MAIN_ACCOUNT, POETRY_ACCOUNT, 'x']);
    expect(all[1].name).toBe('Quiet lines');
  });

  it('labels by @handle, or by name until there is one', () => {
    expect(accountLabel(DEFAULT_ACCOUNTS[0])).toBe('@_freethedream_');
    expect(accountLabel(DEFAULT_ACCOUNTS[1])).toBe('Poetry');
  });

  it('cleans a handle the way Instagram allows', () => {
    expect(cleanHandle('  @Quiet Lines!.rae ')).toBe('quietlines.rae');
  });

  it('spots ideas written for the poetry account that are still in the main one', () => {
    expect(isPoemIdea(newPost({ notes: 'Poem idea: salt and sky' }))).toBe(true);
    expect(isPoemIdea(newPost({ notes: '  poem idea: lower case' }))).toBe(true);
    expect(isPoemIdea(newPost({ notes: 'A poem idea, later' }))).toBe(false);
    expect(isPoemIdea(newPost({ notes: 'Poem idea: moved', account: POETRY_ACCOUNT }))).toBe(false);
    expect(isPoemIdea(newPost({ notes: 'Poem idea: set aside', deletedAt: 1 }))).toBe(false);
  });
});
