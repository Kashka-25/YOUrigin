import { useState, type FormEvent } from 'react';
import { AtSign, Pencil, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../Modal';
import { useToast } from '../Toast';
import { addAccount, movePostsToAccount, removeAccount, saveAccount } from '../../db/postAccounts';
import { MAIN_ACCOUNT, accountLabel, canRemoveAccount, cleanHandle, type PostAccount } from '../../posts/accounts';

/** One button per Instagram account; the chosen one is what every Posts view shows. */
export function AccountSwitcher({ accounts, current, counts, onChoose }: { accounts: PostAccount[]; current: string; counts: Record<string, number>; onChoose: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl border border-line p-1" role="tablist" aria-label="Instagram account">
        {accounts.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={current === a.id}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${current === a.id ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:text-ink'}`}
            onClick={() => onChoose(a.id)}
          >
            <AtSign size={14} aria-hidden />
            <span>{a.handle ? a.handle : a.name}</span>
            <span className="font-normal opacity-75">{counts[a.id] ?? 0}</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn-ghost shrink-0" aria-label="Edit accounts" title="Edit accounts" onClick={() => setEditing(true)}>
        <Pencil size={16} />
      </button>
      <AccountsDialog open={editing} onClose={() => setEditing(false)} accounts={accounts} counts={counts} />
    </div>
  );
}

function AccountRow({ account, count, main }: { account: PostAccount; count: number; main: PostAccount }) {
  const toast = useToast();
  const [name, setName] = useState(account.name);
  const [handle, setHandle] = useState(account.handle);
  const [removing, setRemoving] = useState(false);
  const changed = name.trim() !== account.name || cleanHandle(handle) !== account.handle;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    await saveAccount(account.id, { name, handle });
    setHandle(cleanHandle(handle));
    toast('Account saved.');
  };
  return (
    <form onSubmit={(e) => void save(e)} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="block">
        <span className="label">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="What you call it" />
      </label>
      <label className="block">
        <span className="label">Instagram handle</span>
        <span className="flex items-center gap-1">
          <span className="text-ink-2">@</span>
          <input className="input" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="not chosen yet" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </span>
      </label>
      <span className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={!changed}>
          Save
        </button>
        {canRemoveAccount(account.id) && (
          <button type="button" className="btn-ghost" aria-label={`Remove ${accountLabel(account)}`} title="Remove this account" onClick={() => setRemoving(true)}>
            <Trash2 size={16} />
          </button>
        )}
      </span>
      {removing && (
        <div className="rounded-lg border border-line bg-paper-2 p-2 text-sm sm:col-span-3" role="alert">
          <p className="text-ink">
            Remove {accountLabel(account)}?{' '}
            {count ? `${count === 1 ? 'Its post moves' : `Its ${count} posts move`} to ${accountLabel(main)}; nothing is deleted.` : 'It has no posts.'}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const n = await removeAccount(account.id, main.id);
                toast(n ? `Account removed. ${n} moved to ${accountLabel(main)}.` : 'Account removed.');
              }}
            >
              Remove
            </button>
            <button type="button" className="btn-ghost" onClick={() => setRemoving(false)}>
              Keep it
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

export function AccountsDialog({ open, onClose, accounts, counts }: { open: boolean; onClose: () => void; accounts: PostAccount[]; counts: Record<string, number> }) {
  const main = accounts.find((a) => a.id === MAIN_ACCOUNT) ?? accounts[0];
  const toast = useToast();
  const [adding, setAdding] = useState('');
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!adding.trim()) return;
    await addAccount(adding);
    setAdding('');
    toast('Account added.');
  };
  return (
    <Modal open={open} onClose={onClose} title="Instagram accounts">
      <p className="mb-3 text-sm text-ink-2">Each post belongs to one account, and each account has its own calendar, board, ideas and grid. Names and handles sync to your other devices.</p>
      <div className="space-y-2">
        {accounts.map((a) => (
          <AccountRow key={`${a.id}-${a.updatedAt}`} account={a} count={counts[a.id] ?? 0} main={main} />
        ))}
      </div>
      <form onSubmit={(e) => void add(e)} className="mt-4 flex gap-2">
        <input className="input min-w-0 flex-1" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Another account’s name" aria-label="New account name" />
        <button type="submit" className="btn shrink-0" disabled={!adding.trim()}>
          <Plus size={16} /> Add
        </button>
      </form>
    </Modal>
  );
}

/** Buttons that move the chosen posts to another account. */
export function MoveToAccount({ ids, accounts, current, onMoved }: { ids: string[]; accounts: PostAccount[]; current: string; onMoved: () => void }) {
  const toast = useToast();
  const others = accounts.filter((a) => a.id !== current);
  if (!others.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
      <span className="text-sm text-ink-2">Or move to account</span>
      {others.map((a) => (
        <button
          key={a.id}
          type="button"
          className="btn min-h-9"
          onClick={async () => {
            const n = await movePostsToAccount(ids, a.id);
            onMoved();
            toast(`${n === 1 ? 'Moved' : `${n} moved`} to ${accountLabel(a)}.`);
          }}
        >
          <AtSign size={14} /> {a.handle || a.name}
        </button>
      ))}
    </div>
  );
}
