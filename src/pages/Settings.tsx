import { useEffect, useRef, useState } from 'react';
import { BookA, Download, HardDrive, Laptop, Monitor, Smartphone, TabletSmartphone, Upload } from 'lucide-react';
import { setSetting, useSettings } from '../db/settings';
import { StatusPicker, TypeSelect, Spinner } from '../components/ui';
import { exportBackup, isBackup, mergeBackup, replaceWithBackup } from '../db/backup';
import { download, libraryToMarkdown, today } from '../io/export';
import { useLibrary } from '../hooks/useLibrary';
import { useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import { hasSample, loadSample, removeSample } from '../db/sample';
import { requestPersistentStorage } from '../db/db';
import { useInstallPrompt } from '../pwa';
import { SyncPanel } from '../components/SyncPanel';
import { WordPacks } from '../components/WordPacks';
import { isEditNote, needsSending, resolveEditCategory, sendEditNote } from '../sync/buildNotes';

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="border-t border-line py-8" aria-labelledby={id}>
      <h2 id={id} className="font-serif text-2xl">
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function Settings() {
  const s = useSettings();
  const lib = useLibrary();
  const confirm = useConfirm();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const [storage, setStorage] = useState<{ persisted: boolean; usage?: number; quota?: number } | null>(null);
  const [sample, setSample] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const install = useInstallPrompt();

  useEffect(() => {
    void (async () => {
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      const est = await navigator.storage?.estimate?.();
      setStorage({ persisted, usage: est?.usage, quota: est?.quota });
      setSample(await hasSample());
    })();
  }, []);

  if (!s || !lib) return <Spinner />;

  const backupNow = async () => {
    const data = await exportBackup();
    download(`yourigin-backup-${today()}.json`, JSON.stringify(data), 'application/json');
    await setSetting('lastBackupAt', Date.now());
  };

  const onBackupFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (!isBackup(data)) throw new Error('That file is not a YOUrigin backup.');
      if (replaceMode) {
        const ok = await confirm({
          title: 'Replace everything on this device?',
          message: 'All pieces, books, tags and collections here will be replaced by the backup. Download a backup of this device first if unsure.',
          confirmLabel: 'Replace everything',
          danger: true,
        });
        if (!ok) return;
        await replaceWithBackup(data);
        toast('Library replaced from backup');
      } else {
        const r = await mergeBackup(data);
        toast(`Merged: ${r.added} added, ${r.updated} updated, ${r.unchanged} unchanged`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read that file');
    }
  };

  const live = lib.items.filter((i) => !i.deletedAt);
  const editCategory = resolveEditCategory(s.editNotesCategory, lib.tags, lib.collections);
  const editNotes = live.filter((i) => isEditNote(i, editCategory, lib.collections));
  const unsent = editNotes.filter(needsSending);

  const sendAllEditNotes = async () => {
    setSendingAll(true);
    let sent = 0;
    try {
      for (const item of unsent) {
        await sendEditNote(item);
        sent++;
      }
      toast(`Sent ${sent} edit note${sent === 1 ? '' : 's'} to Notion`);
    } catch (e) {
      toast(`${sent ? `Sent ${sent}, then stopped: ` : ''}${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSendingAll(false);
    }
  };
  const mb = (n?: number) => (n === undefined ? '?' : (n / 1024 / 1024).toFixed(1) + ' MB');

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 md:px-8 md:pt-12">
      <h1 className="page-title">Settings</h1>

      <Section title="Sync between devices" id="s-sync">
        <SyncPanel />
      </Section>

      <Section title="Edit notes → Notion" id="s-notes">
        <p className="text-[15px] leading-relaxed text-ink-2">
          Pieces in your edit-notes tag or collection go to the <em>Build Notes</em> database in Notion, filed under <em>YOUrigin</em>, so Claude can
          read them and make the changes. Each one sends a few seconds after you finish editing it, and editing it again updates the same Notion page.
          Uses the sign-in from Sync above.
        </p>
        <div>
          <label className="label" htmlFor="edit-cat">
            Edit notes live in
          </label>
          <select id="edit-cat" className="input" value={s.editNotesCategory} onChange={(e) => void setSetting('editNotesCategory', e.target.value)}>
            <option value="">Find it by name{editCategory && !s.editNotesCategory ? ` (${editCategory.name})` : ' (anything with “edit” in it)'}</option>
            {lib.collections.length > 0 && (
              <optgroup label="Collections">
                {lib.collections.map((c) => (
                  <option key={c.id} value={`collection:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
            {lib.tags.length > 0 && (
              <optgroup label="Tags">
                {[...lib.tags]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((t) => (
                    <option key={t.id} value={`tag:${t.id}`}>
                      #{t.name}
                    </option>
                  ))}
              </optgroup>
            )}
            <option value="off">Don’t send edit notes</option>
          </select>
        </div>
        {editCategory ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-ink-2">
              {editNotes.length} edit note{editNotes.length === 1 ? '' : 's'} in {editCategory.name}
              {unsent.length ? ` · ${unsent.length} not sent from this device` : ' · all sent'}
            </span>
            <button type="button" className="btn" disabled={sendingAll || !unsent.length} onClick={() => void sendAllEditNotes()}>
              {sendingAll ? 'Sending…' : 'Send all to Notion'}
            </button>
          </div>
        ) : (
          s.editNotesCategory !== 'off' && <p className="text-sm text-muted">No tag or collection with “edit” in its name yet — choose one above.</p>
        )}
      </Section>

      <Section title="Your writing on this device" id="s-data">
        <p className="text-[15px] leading-relaxed text-ink-2">
          Everything lives on this device and works fully offline. Backups are a safety net whether or not you sync — and without sync, you can still carry
          work between devices by downloading a backup on one and <em>merging</em> it on the other (the newest version of each piece wins; nothing is
          deleted).
        </p>
        <div className="panel flex flex-wrap items-center gap-3 p-4 text-sm">
          <HardDrive size={18} className="text-muted" aria-hidden />
          <span>
            {live.length} pieces · {lib.books.length} books · {lib.tags.length} tags
          </span>
          <span className="text-muted">
            {storage ? `${mb(storage.usage)} used` : ''}
            {storage && (storage.persisted ? ' · protected from automatic clean-up' : ' · not yet protected')}
          </span>
          {storage && !storage.persisted && (
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={async () => {
                const ok = await requestPersistentStorage();
                setStorage((x) => (x ? { ...x, persisted: ok } : x));
                toast(ok ? 'Storage protected' : 'The browser declined — installing the app usually allows it');
              }}
            >
              Protect storage
            </button>
          )}
        </div>
        <p className="text-sm text-muted">
          Last backup: {s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleString() : 'never'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => void backupNow()}>
            <Download size={16} /> Download full backup
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setReplaceMode(false);
              fileRef.current?.click();
            }}
          >
            <Upload size={16} /> Merge a backup
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => download(`yourigin-library-${today()}.md`, libraryToMarkdown(live.filter((i) => !i.archived), lib.ctx.tagName), 'text/markdown')}
          >
            Export library as Markdown
          </button>
          <button
            type="button"
            className="btn-ghost text-seed"
            onClick={() => {
              setReplaceMode(true);
              fileRef.current?.click();
            }}
          >
            Replace with a backup…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onBackupFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </Section>

      <Section title="Install on your devices" id="s-install">
        {install.installed ? (
          <p className="text-[15px] text-polished">YOUrigin is running as an installed app on this device.</p>
        ) : install.canInstall ? (
          <button type="button" className="btn-primary" onClick={() => void install.install()}>
            Install YOUrigin on this device
          </button>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="panel p-4 text-sm leading-relaxed">
            <p className="flex items-center gap-2 font-semibold">
              <Smartphone size={16} aria-hidden /> Samsung / Android
            </p>
            <p className="mt-1 text-ink-2">
              Open YOUrigin in Chrome or Samsung Internet → menu (⋮ or ≡) → <em>Install app</em> / <em>Add page to → Home screen</em>.
            </p>
          </div>
          <div className="panel p-4 text-sm leading-relaxed">
            <p className="flex items-center gap-2 font-semibold">
              <Laptop size={16} aria-hidden /> Windows laptop
            </p>
            <p className="mt-1 text-ink-2">
              In Edge or Chrome, click the install icon in the address bar (or menu → <em>Apps → Install YOUrigin</em>). It opens in its own window and works offline.
            </p>
          </div>
          <div className="panel p-4 text-sm leading-relaxed">
            <p className="flex items-center gap-2 font-semibold">
              <TabletSmartphone size={16} aria-hidden /> iPhone / iPad
            </p>
            <p className="mt-1 text-ink-2">
              Open YOUrigin in Safari → tap <em>Share</em> (the square with an arrow) → <em>Add to Home Screen</em> → <em>Add</em>. Recent iOS versions also
              allow this from Chrome or Edge via their Share menu.
            </p>
          </div>
          <div className="panel p-4 text-sm leading-relaxed">
            <p className="flex items-center gap-2 font-semibold">
              <Monitor size={16} aria-hidden /> Mac
            </p>
            <p className="mt-1 text-ink-2">
              In Safari (macOS Sonoma or later): <em>File → Add to Dock</em>. In Chrome or Edge, click the install icon in the address bar.
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-ink-2">
          <strong className="font-semibold text-ink">On iPhone and iPad:</strong> the installed app and Safari keep separate libraries, so do your writing
          in the app you added to your Home Screen. Safari can clear data from websites you haven’t opened in a while — installed apps are far better
          protected — so download a backup now and then.
        </p>
        <p className="text-sm text-muted">Open the app once while online after installing; from then on it works offline on every device.</p>
      </Section>

      <Section title="Dictionary and thesaurus" id="s-words">
        <p className="text-[15px] leading-relaxed text-ink-2">
          Download once and it works offline. In a piece, select a word and tap <BookA size={15} className="inline align-[-2px]" aria-label="the book button" /> to see its meanings and swap in a synonym.
          With a spelling pack, <em>Spelling</em> in the menu checks a whole project at once.
        </p>
        <WordPacks />
      </Section>

      <Section title="Capture defaults" id="s-capture">
        <div>
          <span className="label">New pieces start as</span>
          <StatusPicker value={s.defaultStatus} onChange={(v) => void setSetting('defaultStatus', v)} size="sm" />
        </div>
        <div>
          <label className="label" htmlFor="def-type">
            Default type
          </label>
          <TypeSelect id="def-type" value={s.defaultType} onChange={(v) => void setSetting('defaultType', v)} />
        </div>
      </Section>

      <Section title="Appearance" id="s-look">
        <div className="flex gap-2" role="radiogroup" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={s.theme === t}
              className={`rounded-full border px-4 py-1.5 text-sm capitalize ${s.theme === t ? 'border-accent bg-accent text-accent-ink' : 'border-line'}`}
              onClick={() => void setSetting('theme', t)}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Creative assistant" id="s-ai">
        <p className="text-[15px] leading-relaxed text-ink-2">
          By default the assistant runs entirely on this device: it notices words, tags and patterns, and asks questions. Connect Claude for richer suggestions and
          alternative drafts. Suggestions never change your writing unless you accept them.
        </p>
        <div className="flex gap-2" role="radiogroup" aria-label="Assistant">
          {(
            [
              ['local', 'On-device (offline)'],
              ['claude', 'Claude (needs internet)'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={s.aiProvider === v}
              className={`rounded-full border px-4 py-1.5 text-sm ${s.aiProvider === v ? 'border-accent bg-accent text-accent-ink' : 'border-line'}`}
              onClick={() => void setSetting('aiProvider', v)}
            >
              {label}
            </button>
          ))}
        </div>
        {s.aiProvider !== 'claude' && (
          <p className="text-xs leading-relaxed text-muted">
            Choosing Claude sends the text you work on to Anthropic and uses your own pay-as-you-go API key. The details appear when you select it.
          </p>
        )}
        {s.aiProvider === 'claude' && (
          <div className="panel space-y-3 p-4">
            <div className="rounded-xl border border-dashed border-ai/60 bg-ai-bg/50 p-3 text-sm leading-relaxed text-ink-2">
              <p className="font-semibold text-ink">Before you connect</p>
              <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
                <li>
                  <span className="font-medium text-ink">What is shared:</span> while Claude is on, the text of a piece is sent to Anthropic whenever the
                  assistant looks at it — automatically after each capture (for tag and type suggestions), and when you use <em>Suggest</em>,{' '}
                  <em>Develop</em> or <em>Refine</em>. Finding related pieces, placement and themes always stay on this device. Nothing is sent while the
                  on-device option is selected.
                </li>
                <li>
                  <span className="font-medium text-ink">Who pays:</span> this uses your own Anthropic API key, billed per use to your account at{' '}
                  <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
                    console.anthropic.com
                  </a>
                  . It is separate from a Claude.ai Pro or Max subscription. Each person who connects pays only for their own use.
                </li>
                <li>
                  <span className="font-medium text-ink">Keeping costs low:</span> suggestions run on every capture, so Sonnet or Haiku cost far less than
                  Opus if you capture often. Setting a monthly spending limit in the Anthropic console is a good safeguard.
                </li>
                <li>
                  <span className="font-medium text-ink">Your key:</span> anyone who can open YOUrigin on this device could find it, so only add it on
                  devices that are yours.
                </li>
              </ul>
            </div>
            <div>
              <label className="label" htmlFor="ai-key">
                Anthropic API key
              </label>
              <input
                id="ai-key"
                type="password"
                autoComplete="off"
                className="input font-mono"
                value={key ?? s.claudeApiKey}
                onChange={(e) => setKey(e.target.value)}
                onBlur={() => key !== null && void setSetting('claudeApiKey', key.trim())}
                placeholder="sk-ant-…"
              />
              <p className="mt-1 text-xs text-muted">
                Stored only on this device and never included in backups. Requests go directly from this device to Anthropic. When offline, the on-device assistant is
                used automatically.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="ai-model">
                Model
              </label>
              <select id="ai-model" className="input" value={s.claudeModel} onChange={(e) => void setSetting('claudeModel', e.target.value)}>
                <option value="claude-opus-5-5">Claude Opus 5.5 (most capable, highest cost)</option>
                <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (balanced, about half the cost)</option>
                <option value="claude-haiku-4-5">Claude Haiku 4.5 (fastest, lowest cost)</option>
              </select>
            </div>
          </div>
        )}
      </Section>

      <Section title="Getting started" id="s-start">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => void setSetting('onboarded', false)}>
            Show the welcome tour again
          </button>
          {sample ? (
            <button
              type="button"
              className="btn"
              onClick={async () => {
                if (await confirm({ title: 'Remove sample material?', message: 'Only the example pieces, the sample book and collection are removed. Your own writing is untouched.', confirmLabel: 'Remove samples' })) {
                  await removeSample();
                  setSample(false);
                  toast('Sample material removed');
                }
              }}
            >
              Remove sample material
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={async () => {
                await loadSample();
                setSample(true);
                toast('Sample material added');
              }}
            >
              Add sample material
            </button>
          )}
        </div>
      </Section>

      <Section title="Keyboard" id="s-keys">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt>
            <kbd>Ctrl/⌘ K</kbd> or <kbd>/</kbd>
          </dt>
          <dd className="text-ink-2">Search everything</dd>
          <dt>
            <kbd>N</kbd> or <kbd>Alt N</kbd>
          </dt>
          <dd className="text-ink-2">New brain dump (Ctrl N too, where the browser allows)</dd>
          <dt>
            <kbd>Ctrl/⌘ Enter</kbd>
          </dt>
          <dd className="text-ink-2">Capture</dd>
          <dt>
            <kbd>Alt L</kbd>
          </dt>
          <dd className="text-ink-2">Look up the word at the cursor</dd>
          <dt>
            <kbd>Space</kbd> then arrows
          </dt>
          <dd className="text-ink-2">Pick up and move a section or piece in the book builder</dd>
        </dl>
      </Section>
      <p className="pb-6 text-xs text-muted">YOUrigin {__APP_VERSION__} · Your Creative Codex</p>
    </div>
  );
}
