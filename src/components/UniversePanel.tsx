import { useState, type FormEvent } from 'react';
import { Globe2, Trash2 } from 'lucide-react';
import type { Project, UniverseRealm } from '../domain/types';
import { UNIVERSE_REALMS, isUniverseRealm, slugify } from '../domain/universe';
import { CHANGE_NOTE_MAX, addChangeNote, removeChangeNote, setUniverseLink } from '../db/projectRecords';
import { useConfirm } from './Modal';

const dateInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fromDateInput = (v: string) => {
  const [y, m, d] = v.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d, 12).getTime() : Date.now();
};

/**
 * Where this Project lives in Creative Universe, and what has changed. The change
 * notes are Cassidy's own words; they travel to Creative Universe only when a
 * portfolio is exported for it.
 */
export function UniversePanel({ project }: { project: Project }) {
  const confirm = useConfirm();
  const [slug, setSlug] = useState(project.universe?.slug ?? '');
  const [text, setText] = useState('');
  const [date, setDate] = useState(() => dateInput(Date.now()));
  const realm = project.universe?.realm ?? '';
  const notes = project.changeNotes ?? [];

  const chooseRealm = (value: string) => void setUniverseLink(project.id, isUniverseRealm(value) ? { realm: value as UniverseRealm, slug } : null);
  const saveSlug = () => {
    if (realm) void setUniverseLink(project.id, { realm: realm as UniverseRealm, slug });
    setSlug(slugify(slug));
  };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await addChangeNote(project.id, text, fromDateInput(date));
    setText('');
  };
  const remove = async (noteId: string) => {
    if (await confirm({ title: 'Remove this change note?', message: 'It will no longer travel to Creative Universe with this Project.', confirmLabel: 'Remove', danger: true }))
      await removeChangeNote(project.id, noteId);
  };

  return (
    <section className="mt-10" aria-labelledby="project-universe">
      <div className="mb-4">
        <p className="eyebrow">Your portfolio hub</p>
        <h2 id="project-universe" className="section-heading flex items-center gap-2">
          <Globe2 size={20} className="text-gold" aria-hidden /> Creative Universe
        </h2>
      </div>
      <div className="panel space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="universe-realm">Realm</label>
            <select id="universe-realm" className="input" value={realm} onChange={(e) => chooseRealm(e.target.value)}>
              <option value="">Placed by its portfolio section</option>
              {UNIVERSE_REALMS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="universe-slug">
              Address there <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="universe-slug"
              className="input"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              onBlur={saveSlug}
              placeholder={slugify(project.title)}
              disabled={!realm}
              aria-describedby="universe-slug-help"
            />
            <p id="universe-slug-help" className="mt-1 text-xs text-muted">
              {realm ? 'Leave empty to use the name.' : 'Choose a realm first.'}
            </p>
          </div>
        </div>

        <div>
          <h3 className="label">Change notes</h3>
          <p className="mb-3 text-sm text-ink-2">What’s new, in your words. They go to Creative Universe with this Project when you export your portfolio for it.</p>
          <form className="flex flex-col gap-2 sm:flex-row sm:items-start" onSubmit={add}>
            <label className="sr-only" htmlFor="universe-note">New change note</label>
            <textarea
              id="universe-note"
              className="input min-h-11 flex-1"
              rows={2}
              maxLength={CHANGE_NOTE_MAX}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Launched guided journeys…"
            />
            <label className="sr-only" htmlFor="universe-note-date">When</label>
            <input id="universe-note-date" type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
            <button type="submit" className="btn" disabled={!text.trim()}>
              Add note
            </button>
          </form>
          {notes.length > 0 && (
            <ol className="mt-4 divide-y divide-line">
              {notes.map((n) => (
                <li key={n.id} className="flex items-start gap-3 py-2.5">
                  <time className="w-24 shrink-0 pt-0.5 text-xs text-muted" dateTime={new Date(n.at).toISOString()}>
                    {new Date(n.at).toLocaleDateString()}
                  </time>
                  <p className="min-w-0 flex-1 text-sm whitespace-pre-wrap text-ink">{n.text}</p>
                  <button type="button" className="btn-ghost px-2 py-1 text-muted" onClick={() => void remove(n.id)} aria-label={`Remove change note from ${new Date(n.at).toLocaleDateString()}`}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
