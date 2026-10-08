import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Merge, Scissors, Upload } from 'lucide-react';
import { Modal } from './Modal';
import {
  IMPORT_ACCEPT,
  draftPieces,
  includedDrafts,
  joinWithNext,
  readFiles,
  resolveTypes,
  splitAt,
  toNewContent,
  type DraftPiece,
  type ImportedFile,
} from '../io/import';
import { buildBookFromImport, guessBookType } from '../io/importBook';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { BOOK_TYPE_LABEL, CONTENT_TYPES, TYPE_LABEL } from '../domain/constants';
import type { BookType } from '../domain/types';
import { STRATEGY_LABEL, type SplitStrategy } from '../io/splitter';
import { normaliseTagName } from '../domain/text';
import type { ContentType, Status } from '../domain/types';
import { StatusPicker } from './ui';
import { createMany } from '../db/content';
import { db } from '../db/db';
import { useToast } from './Toast';

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<ImportedFile[]>([]);
  const [strategy, setStrategy] = useState<SplitStrategy>('auto');
  const [drafts, setDrafts] = useState<DraftPiece[] | null>(null);
  const [used, setUsed] = useState<Record<string, Exclude<SplitStrategy, 'auto'>>>({});
  const [status, setStatus] = useState<Status>('seed');
  const [type, setType] = useState<ContentType | 'auto'>('auto');
  const [makeBook, setMakeBook] = useState(false);
  const [bookTitle, setBookTitle] = useState('');
  const [bookType, setBookType] = useState<BookType>('poetry');
  const nav = useNavigate();
  const [tags, setTags] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const resplit = (fs: ImportedFile[], s: SplitStrategy) => {
    const r = draftPieces(fs, s);
    setDrafts(r.pieces);
    // Documents with chapters are most useful imported as a ready-made book.
    setMakeBook(r.pieces.some((d) => d.section));
    setBookType(guessBookType(resolveTypes(r.pieces, 'auto')));
    setBookTitle((t) => t || (fs[0]?.name.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim() ?? ''));
    setUsed(r.used);
    setExpanded(null);
  };

  const add = async (list: FileList | File[]) => {
    setBusy(true);
    try {
      const read = await readFiles([...list]);
      const next = [...files, ...read];
      setFiles(next);
      resplit(next, strategy);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFiles([]);
    setDrafts(null);
    setTags('');
    setBookTitle('');
    setMakeBook(false);
    setStrategy('auto');
  };

  const errors = files.filter((f) => f.error);
  const included = drafts?.filter((d) => d.include).length ?? 0;
  const detected = useMemo(() => [...new Set(Object.values(used))], [used]);

  const update = (i: number, patch: Partial<DraftPiece>) => setDrafts((d) => d && d.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const commit = async () => {
    if (!drafts) return;
    setBusy(true);
    try {
      const kept = includedDrafts(drafts);
      const ids = await createMany(
        toNewContent(drafts, { status, type, extraTags: tags.split(/[\s,]+/).map(normaliseTagName).filter(Boolean) }),
      );
      const title = bookTitle.trim() || 'Imported book';
      const bookId = makeBook ? await buildBookFromImport(title, bookType, kept, ids) : null;
      toast(bookId ? `Imported ${ids.length} pieces and built “${title}”` : `Imported ${ids.length} piece${ids.length === 1 ? '' : 's'} into your Library`, {
        undo: async () => {
          if (bookId) {
            await db.entries.where('bookId').equals(bookId).delete();
            await db.sections.where('bookId').equals(bookId).delete();
            await db.books.delete(bookId);
          }
          await db.content.bulkDelete(ids);
        },
      });
      reset();
      onClose();
      if (bookId) nav(`/books/${bookId}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import writing" wide>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void add(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-7 text-center ${dragging ? 'border-accent bg-paper-2' : 'border-line'}`}
      >
        <Upload className="text-muted" aria-hidden />
        <p className="mt-2 text-sm text-ink-2">
          Drop a Word document (.docx), .txt or .md file — one with all your poems, or many files at once. Each poem becomes its own piece.
        </p>
        <button type="button" className="btn mt-3" onClick={() => inputRef.current?.click()} disabled={busy}>
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={IMPORT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {errors.length > 0 && (
        <ul className="mt-3 text-sm text-seed">
          {errors.map((f) => (
            <li key={f.name}>
              {f.name}: {f.error}
            </li>
          ))}
        </ul>
      )}

      {drafts && (
        <div className="mt-5 space-y-4">
          <div className="panel space-y-2 p-4">
            <label className="label" htmlFor="imp-split">
              Where does each poem begin?
            </label>
            <select
              id="imp-split"
              className="input"
              value={strategy}
              onChange={(e) => {
                const s = e.target.value as SplitStrategy;
                setStrategy(s);
                resplit(files, s);
              }}
            >
              <option value="auto">Find it automatically{detected.length === 1 ? ` — found: ${STRATEGY_LABEL[detected[0]].toLowerCase()}` : ''}</option>
              {(Object.keys(STRATEGY_LABEL) as Exclude<SplitStrategy, 'auto'>[]).map((s) => (
                <option key={s} value={s}>
                  {STRATEGY_LABEL[s]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted">
              Check the list below. <strong>Join</strong> pieces that were split too eagerly, open a piece to <strong>cut</strong> it where a new poem starts,
              and untick anything you don't want. Changing this setting resets those edits.
            </p>
          </div>

          <div className={`panel space-y-3 p-4 ${makeBook ? 'border-accent' : ''}`}>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={makeBook} onChange={(e) => setMakeBook(e.target.checked)} />
              <span>
                <span className="flex items-center gap-1.5 font-semibold">
                  <BookOpen size={15} aria-hidden /> Also build this as a book
                </span>
                <span className="block text-xs text-muted">
                  {drafts.some((d) => d.section)
                    ? `Creates the book with its ${new Set(drafts.map((d) => d.section).filter(Boolean)).size} chapters as sections and every piece placed in order — ready to edit and design.`
                    : 'Creates a book containing these pieces in this order, ready to arrange and design.'}
                </span>
              </span>
            </label>
            {makeBook && (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <label className="label" htmlFor="imp-book-title">
                    Book title
                  </label>
                  <input id="imp-book-title" className="input font-serif text-base" value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="imp-book-type">
                    Kind of book
                  </label>
                  <select id="imp-book-type" className="input" value={bookType} onChange={(e) => setBookType(e.target.value as BookType)}>
                    {Object.entries(BOOK_TYPE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="imp-type">
                Type
              </label>
              <select id="imp-type" className="input" value={type} onChange={(e) => setType(e.target.value as ContentType | 'auto')}>
                <option value="auto">Detect for each piece</option>
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    All {TYPE_LABEL[t]}s
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="label">Status</span>
              <StatusPicker value={status} onChange={setStatus} size="sm" />
            </div>
            <div>
              <label className="label" htmlFor="imp-tags">
                Add tags to all
              </label>
              <input id="imp-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#poetry #2019" />
            </div>
          </div>

          <div className="panel">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-2xl border-b border-line bg-card px-4 py-2">
              <p className="text-sm font-semibold">
                {drafts.length} piece{drafts.length === 1 ? '' : 's'} found · {included} selected
              </p>
              <div className="flex gap-1">
                <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setDrafts(drafts.map((d) => ({ ...d, include: true })))}>
                  Select all
                </button>
                <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setDrafts(drafts.map((d) => ({ ...d, include: false })))}>
                  None
                </button>
              </div>
            </div>
            <ol className="max-h-[50dvh] divide-y divide-line overflow-y-auto">
              {drafts.map((d, i) => {
                const lines = d.body.split('\n');
                const open = expanded === d.key;
                const newSection = d.section && d.section !== drafts[i - 1]?.section;
                return (
                  <li key={d.key} className={`px-3 py-2.5 ${d.include ? '' : 'opacity-50'}`}>
                    {newSection && <p className="eyebrow mb-2 border-b border-line pb-1 text-accent">{d.section}</p>}
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-2 h-4 w-4"
                        checked={d.include}
                        onChange={(e) => update(i, { include: e.target.checked })}
                        aria-label={`Include piece ${i + 1}`}
                      />
                      <div className="min-w-0 flex-1">
                        <input
                          className="w-full rounded-lg bg-transparent px-1 py-0.5 font-serif text-base text-ink placeholder:text-muted hover:bg-paper-2 focus:bg-paper-2 focus:outline-none"
                          value={d.title}
                          placeholder={lines.find((l) => l.trim())?.slice(0, 60) ?? 'Untitled'}
                          onChange={(e) => update(i, { title: e.target.value })}
                          aria-label={`Title of piece ${i + 1}`}
                        />
                        {!open && (
                          <p className="line-clamp-2 px-1 font-serif text-sm whitespace-pre-line text-ink-2">{lines.filter((l) => l.trim()).slice(0, 2).join('\n')}</p>
                        )}
                        <p className="px-1 text-[11px] text-muted">
                          {lines.filter((l) => l.trim()).length} lines · {d.file}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1 text-xs"
                          onClick={() => setExpanded(open ? null : d.key)}
                          aria-expanded={open}
                          title="Open to cut this piece in two"
                        >
                          {open ? <ChevronUp size={14} /> : <Scissors size={14} />} {open ? 'Close' : 'Cut'}
                        </button>
                        {i < drafts.length - 1 && (
                          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setDrafts(joinWithNext(drafts, i))} title="Join with the next piece">
                            <Merge size={14} /> Join
                          </button>
                        )}
                      </div>
                    </div>
                    {open && (
                      <div className="mt-2 ml-6 rounded-xl bg-paper-2 p-2">
                        <p className="mb-1 px-1 text-[11px] text-muted">Tap ✂ above the line where the next poem begins.</p>
                        {lines.map((line, li) => (
                          <div key={li}>
                            {li > 0 && (
                              <button
                                type="button"
                                className="group flex w-full items-center gap-2 py-0.5 text-[11px] text-muted hover:text-accent"
                                onClick={() => {
                                  setDrafts(splitAt(drafts, i, li));
                                  setExpanded(null);
                                }}
                                aria-label={`Cut before line ${li + 1}`}
                              >
                                <Scissors size={11} />
                                <span className="h-px flex-1 bg-line group-hover:bg-accent" />
                              </button>
                            )}
                            <p className="writing min-h-[1.2em] px-1 font-serif text-sm text-ink">{line}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          <p className="text-xs text-muted">
            Your text is imported exactly as written. Hashtags in the files become tags; nothing is removed from the writing.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={reset}>
              Start over
            </button>
            <button type="button" className="btn-primary" onClick={() => void commit()} disabled={busy || !included}>
              Import {included} piece{included === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}
      {busy && !drafts && (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-2">
          <ChevronDown size={14} className="animate-bounce" /> Reading…
        </p>
      )}
    </Modal>
  );
}
