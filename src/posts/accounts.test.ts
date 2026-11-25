import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCOUNTS, FIRST_ACCOUNTS, MAIN_ACCOUNT, POETRY_ACCOUNT, accountLabel, accountOf, canRemoveAccount, cleanHandle, isPoemIdea, mergeAccounts } from './accounts';
import { newPost } from './model';

describe('post accounts', () => {
  it('posts made before accounts existed belong to the main account', () => {
    expect(accountOf(newPost())).toBe(MAIN_ACCOUNT);
    expect(accountOf(newPost({ account: POETRY_ACCOUNT }))).toBe(POETRY_ACCOUNT);
  });

  it('starts with one unnamed account anyone can make theirs, which cannot be removed', () => {
    expect(mergeAccounts([])).toEqual([expect.objectContaining({ id: MAIN_ACCOUNT, name: 'My account', handle: '' })]);
    expect(canRemoveAccount(MAIN_ACCOUNT)).toBe(false);
    expect(canRemoveAccount(POETRY_ACCOUNT)).toBe(true);
  });

  it('an account posts belong to always shows, even with no saved row', () => {
    const all = mergeAccounts([], [MAIN_ACCOUNT, POETRY_ACCOUNT, 'gone']);
    expect(all.map((a) => [a.id, a.name])).toEqual([
      [MAIN_ACCOUNT, 'My account'],
      [POETRY_ACCOUNT, 'Poetry'],
      ['gone', 'Other account'],
    ]);
    expect(mergeAccounts(FIRST_ACCOUNTS, [POETRY_ACCOUNT])).toHaveLength(2);
  });

  it('a saved edit replaces the starting account instead of adding a second one', () => {
    const named = { ...FIRST_ACCOUNTS[1], name: 'Quiet lines', handle: 'quiet.lines', updatedAt: 5 };
    const extra = { id: 'x', name: 'Music', handle: '', createdAt: 100, updatedAt: 100 };
    const all = mergeAccounts([extra, named, FIRST_ACCOUNTS[0]]);
    expect(all.map((a) => a.id)).toEqual([MAIN_ACCOUNT, POETRY_ACCOUNT, 'x']);
    expect(all[1].name).toBe('Quiet lines');
  });

  it('labels by @handle, or by name until there is one', () => {
    expect(accountLabel(FIRST_ACCOUNTS[0])).toBe('@_freethedream_');
    expect(accountLabel(DEFAULT_ACCOUNTS[0])).toBe('My account');
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
