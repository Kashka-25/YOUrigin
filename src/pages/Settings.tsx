import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BookA, Bot, Cloud, Compass, Download, Feather, HardDrive, Keyboard, Laptop, Monitor, Palette, RotateCcw, Send, Smartphone, Sparkles, TabletSmartphone, Upload } from 'lucide-react';
import { setSetting, useSettings } from '../db/settings';
import { applyColourScale, COLOUR_SCALE_DEFAULT, COLOUR_SCALE_STOPS, DEFAULT_COLOUR_SCALE, coloursAt, stopName } from '../domain/colourScale';
import { StatusPicker, TypeSelect, Spinner } from '../components/ui';
import { Fold, FoldGroup, MoreAbout } from '../components/Fold';
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
import { ArtistProfilePanel } from '../components/ShowcasePanels';
import { STATUS_META, TYPE_LABEL } from '../domain/constants';
import showcaseSymbol from '../assets/brand/showcase-96.webp';
import themeSymbol from '../assets/brand/theme-96.webp';
import { DEMO } from '../demo/mode';
import { DemoOffline } from '../demo/DemoChrome';
import { isEditNote, needsSending, resolveEditCategory, sendEditNote } from '../sync/buildNotes';

const CRAFT_LABEL = { words: 'Words', art: 'Art', both: 'Both' } as const;

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
  const { hash } = useLocation();
  const ready = !!s && !!lib;
  // Links like /settings#s-artist open that section and scroll to it.
  useEffect(() => {
    if (!hash || !ready) return;
    const el = document.getElementById(hash.slice(1));
    if (el instanceof HTMLDetailsElement) el.open = true;
    el?.scrollIntoView({ block: 'start' });
  }, [hash, ready]);

  useEffect(() => {
    void (async () => {
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      const est = await navigator.storage?.estimate?.();
      setStorage({ persisted, usage: est?.usage, quota: est?.quota });
      setSample(await hasSample());
    })();
  }, []);

  if (!s || !lib) return <Spinner />;

  const colourScale = s.colourScale ?? DEFAULT_COLOUR_SCALE;
  function updateColourScale(mode: 'light' | 'dark', value: number) {
    const next = { ...colourScale, [mode]: value };
    const activeMode = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    applyColourScale(next, activeMode);
    void setSetting('colourScale', next);
  }

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
  const themeLabel = s.theme === 'system' ? 'Follows this device' : s.theme === 'light' ? 'Light' : 'Dark';
  const pill = (on: boolean) => `rounded-full border px-4 py-1.5 text-sm ${on ? 'border-accent bg-accent text-accent-ink' : 'border-line'}`;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 md:px-8 md:pt-12">
      <h1 className="page-title mb-6">Settings</h1>

      <FoldGroup title="Look and feel">
        <Fold id="s-look" title="Appearance" summary={`${themeLabel} · ${stopName('light', colourScale.light)} by day, ${stopName('dark', colourScale.dark)} by night`} icon={themeSymbol}>
          <div className="flex gap-2" role="radiogroup" aria-label="Theme">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={s.theme === t} className={`${pill(s.theme === t)} capitalize`} onClick={() => void setSetting('theme', t)}>
                {t}
              </button>
            ))}
          </div>
          <div className="border-t border-line pt-5">
            <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
              <Palette size={16} className="text-gold" aria-hidden /> Colour scale
            </p>
            <ColourScaleSlider mode="light" title="Nature, by day" value={colourScale.light} onChange={(value) => updateColourScale('light', value)} />
            <ColourScaleSlider mode="dark" title="The Cosmos, by night" value={colourScale.dark} onChange={(value) => updateColourScale('dark', value)} />
            {(Math.abs(colourScale.light - COLOUR_SCALE_DEFAULT) > 0.5 || Math.abs(colourScale.dark - COLOUR_SCALE_DEFAULT) > 0.5) && (
              <button
                type="button"
                className="btn-ghost -ml-2 mt-1 min-h-9 px-2 text-xs"
                onClick={() => {
                  applyColourScale(DEFAULT_COLOUR_SCALE, document.documentElement.classList.contains('dark') ? 'dark' : 'light');
                  void setSetting('colourScale', DEFAULT_COLOUR_SCALE);
                }}
              >
                <RotateCcw size={13} /> Restore original colours
              </button>
            )}
          </div>
        </Fold>

        <Fold id="s-craft" title="What you mainly make" summary={CRAFT_LABEL[s.craft]} icon={<Sparkles size={18} />}>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What you mainly make">
            {(Object.keys(CRAFT_LABEL) as (keyof typeof CRAFT_LABEL)[]).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={s.craft === v} className={pill(s.craft === v)} onClick={() => void setSetting('craft', v)}>
                {CRAFT_LABEL[v]}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">Art puts the Gallery in the bottom bar. Both adds it to the menu.</p>
        </Fold>

        <Fold id="s-capture" title="Capture defaults" summary={`New notes: ${TYPE_LABEL[s.defaultType]} · ${s.defaultStatus === 'none' ? 'no colour' : `${STATUS_META[s.defaultStatus].label.toLowerCase()} light`}`} icon={<Feather size={18} />}>
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
        </Fold>
      </FoldGroup>

      <FoldGroup title="Keeping your work safe">
        <Fold id="s-sync" title="Sync between devices" summary="Encrypted on this device before it leaves" icon={<Cloud size={18} />}>
          {DEMO ? <DemoOffline what="Sync between devices" /> : <SyncPanel />}
        </Fold>

        <Fold id="s-data" title="Backups and storage" summary={`Last backup: ${s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleDateString() : 'never'}`} icon={<HardDrive size={18} />}>
          <div className="panel flex flex-wrap items-center gap-3 p-4 text-sm">
            <span>
              {live.length} pieces · {lib.books.length} books · {lib.tags.length} tags
            </span>
            <span className="text-muted">
              {storage ? `${mb(storage.usage)} used` : ''}
              {storage && (storage.persisted ? ' · protected from clean-up' : ' · not yet protected')}
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
              Export as Markdown
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
          <MoreAbout>
            <p>Everything lives on this device and works fully offline. A backup is a safety net whether or not you sync.</p>
            <p>
              Without sync, you can still carry work between devices: download a backup on one and <em>merge</em> it on the other. The newest version of each
              piece wins, and nothing is deleted.
            </p>
          </MoreAbout>
        </Fold>

        <Fold
          id="s-install"
          title="Install on your devices"
          summary={install.installed ? 'Installed here' : install.canInstall ? 'Ready to install here' : 'How to add it to a home screen'}
          icon={<Smartphone size={18} />}
        >
          {install.installed ? (
            <p className="text-[15px] text-polished">YOUrigin is running as an installed app on this device.</p>
          ) : install.canInstall ? (
            <button type="button" className="btn-primary" onClick={() => void install.install()}>
              Install YOUrigin on this device
            </button>
          ) : null}
          <MoreAbout label="Samsung / Android">
            <p className="flex items-start gap-2">
              <Smartphone size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                Open YOUrigin in Chrome or Samsung Internet → menu (⋮ or ≡) → <em>Install app</em> / <em>Add page to → Home screen</em>.
              </span>
            </p>
          </MoreAbout>
          <MoreAbout label="Windows laptop">
            <p className="flex items-start gap-2">
              <Laptop size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                In Edge or Chrome, click the install icon in the address bar (or menu → <em>Apps → Install YOUrigin</em>). It opens in its own window and works offline.
              </span>
            </p>
          </MoreAbout>
          <MoreAbout label="iPhone / iPad">
            <p className="flex items-start gap-2">
              <TabletSmartphone size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                In Safari, tap <em>Share</em> → <em>Add to Home Screen</em> → <em>Add</em>. The installed app and Safari keep separate libraries, so write in the
                app. Safari can clear websites you haven’t opened in a while, so download a backup now and then.
              </span>
            </p>
          </MoreAbout>
          <MoreAbout label="Mac">
            <p className="flex items-start gap-2">
              <Monitor size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                In Safari (macOS Sonoma or later): <em>File → Add to Dock</em>. In Chrome or Edge, click the install icon in the address bar.
              </span>
            </p>
          </MoreAbout>
          <p className="text-sm text-muted">Open the app once while online after installing; from then on it works offline.</p>
        </Fold>
      </FoldGroup>

      <FoldGroup title="Helpers">
        <Fold id="s-ai" title="Creative assistant" summary={s.aiProvider === 'claude' ? 'Claude (needs internet)' : 'On this device, offline'} icon={<Bot size={18} />}>
          {DEMO && <DemoOffline what="Connecting Claude" />}
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Assistant">
            {(
              [
                ['local', 'On-device (offline)'],
                ['claude', 'Claude (needs internet)'],
              ] as const
            ).map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={s.aiProvider === v} className={pill(s.aiProvider === v)} onClick={() => void setSetting('aiProvider', v)}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">Suggestions never change your writing unless you accept them.</p>
          {s.aiProvider === 'claude' && (
            <>
              <MoreAbout label="Before you connect Claude">
                <ul className="list-disc space-y-1.5 pl-5">
                  <li>
                    <span className="font-medium text-ink">What is shared:</span> while Claude is on, a piece’s text is sent to Anthropic whenever the assistant
                    looks at it: after each capture, and when you use <em>Suggest</em>, <em>Develop</em> or <em>Refine</em>. Finding related pieces, placement and
                    themes always stay on this device.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Who pays:</span> your own Anthropic API key, billed per use at{' '}
                    <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
                      console.anthropic.com
                    </a>
                    , separate from a Claude.ai subscription.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Keeping costs low:</span> Sonnet or Haiku cost far less than Opus if you capture often. A monthly
                    spending limit in the console is a good safeguard.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Your key:</span> anyone who can open YOUrigin on this device could find it, so only add it on your own
                    devices.
                  </li>
                </ul>
              </MoreAbout>
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
                <p className="mt-1 text-xs text-muted">Stored only on this device, never in backups. Offline, the on-device assistant takes over.</p>
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
            </>
          )}
        </Fold>

        <Fold id="s-words" title="Dictionary and thesaurus" summary="Meanings and synonyms, offline" icon={<BookA size={18} />}>
          <p className="text-sm text-ink-2">
            Download once and it works offline. In a piece, select a word and tap <BookA size={14} className="inline align-[-2px]" aria-label="the book button" />.
          </p>
          <WordPacks />
        </Fold>

        <Fold
          id="s-notes"
          title="Edit notes → Notion"
          summary={s.editNotesCategory === 'off' ? 'Off' : editCategory ? `${editNotes.length} in ${editCategory.name}${unsent.length ? ` · ${unsent.length} to send` : ' · all sent'}` : 'Choose where they live'}
          icon={<Send size={18} />}
        >
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
            s.editNotesCategory !== 'off' && <p className="text-sm text-muted">No tag or collection with “edit” in its name yet. Choose one above.</p>
          )}
          <MoreAbout>
            <p>
              Notes here go to the <em>Build Notes</em> database in Notion, filed under <em>YOUrigin</em>, so Claude can read them and make the changes. Each one
              sends a few seconds after you finish editing it; editing it again updates the same Notion page. It uses the sign-in from Sync.
            </p>
          </MoreAbout>
        </Fold>

        <Fold id="s-artist" title="Artist profile: Showcase on YOU" summary="How you’re credited when you share a piece" icon={showcaseSymbol}>
          {DEMO ? <DemoOffline what="Showcase on YOU" /> : <ArtistProfilePanel />}
          <MoreAbout>
            <p>
              Choose <em>Share to YOU</em> on any piece to show it on YOU, credited to you, with your links. Each share is a separate public copy that waits for
              approval; the rest of your codex stays private.
            </p>
          </MoreAbout>
        </Fold>
      </FoldGroup>

      <FoldGroup title="Help">
        <Fold id="s-start" title="Getting started" summary={sample ? 'Sample material is in' : 'Welcome tour and sample material'} icon={<Compass size={18} />}>
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
        </Fold>

        <Fold id="s-keys" title="Keyboard shortcuts" summary="For the laptop" icon={<Keyboard size={18} />}>
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
        </Fold>
      </FoldGroup>
      <p className="pb-6 text-xs text-muted">YOUrigin {__APP_VERSION__} · Your Creative Codex</p>
    </div>
  );
}

type ColourScaleMode = 'light' | 'dark';

function ColourScaleSlider({
  mode,
  title,
  value,
  onChange,
}: {
  mode: ColourScaleMode;
  title: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const stops = COLOUR_SCALE_STOPS[mode];
  const colours = coloursAt(mode, value);
  const track = `linear-gradient(90deg, ${stops.map((stop) => stop.paper2).join(', ')})`;

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={`colour-scale-${mode}`} className="text-sm text-ink">{title}</label>
        <span className="inline-flex items-center gap-2 text-xs text-ink-2">
          <span className="h-4 w-4 rounded-full border border-line" style={{ backgroundColor: colours.paper2 }} aria-hidden />
          {stopName(mode, value)}
        </span>
      </div>
      <input
        id={`colour-scale-${mode}`}
        className="colour-scale w-full"
        type="range"
        min="0"
        max="100"
        step="1"
        value={Math.round(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-valuetext={stopName(mode, value)}
        style={{ '--track': track } as React.CSSProperties}
      />
      <div className="mt-1 flex justify-between text-[10px] text-muted" aria-hidden>
        {stops.map((stop) => <span key={stop.label}>{stop.label}</span>)}
      </div>
    </div>
  );
}
