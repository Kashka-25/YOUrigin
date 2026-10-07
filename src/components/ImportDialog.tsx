import { useMemo, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Modal } from './Modal';
import { IMPORT_ACCEPT, buildImport, readFiles, type ImportedFile } from '../io/import';
import type { SplitMode } from '../domain/text';
import { displayTitle, normaliseTagName } from '../domain/text';
import type { ContentType, Status } from '../domain/types';
import { StatusPicker, TypeSelect } from './ui';
import { createMany } from '../db/content';
import { db } from '../db/db';
import { useToast } from './Toast';

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<ImportedFile[]>([]);
  const [split, setSplit] = useState<SplitMode>('none');
  const [status, setStatus] = useState<Status>('seed');
  const [type, setType] = useState<ContentType>('poem');
  const [tags, setTags] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const preview = useMemo(
    () => buildImport(files, { split, status, type, extraTags: tags.split(/[\s,]+/).map(normaliseTagName).filter(Boolean) }),
    [files, split, status, type, tags],
  );
  const errors = files.filter((f) => f.error);

  const add = async (list: FileList | File[]) => {
    const read = await readFiles([...list]);
    setFiles((prev) => [...prev, ...read]);
  };

  const reset = () => {
    setFiles([]);
    setTags('');
  };

  const commit = async () => {
    setBusy(true);
    try {
      const ids = await createMany(preview);
      toast(`Imported ${ids.length} piece${ids.length === 1 ? '' : 's'} into your Library`, {
        undo: async () => {
          await db.content.bulkDelete(ids);
        },
      });
      reset();
      onClose();
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
        className={`flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-8 text-center ${dragging ? 'border-accent bg-paper-2' : 'border-line'}`}
      >
        <Upload className="text-muted" aria-hidden />
        <p className="mt-2 text-sm text-ink-2">Drop .txt, .md or .docx files here — as many as you like.</p>
        <button type="button" className="btn mt-3" onClick={() => inputRef.current?.click()}>
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

      {files.length > 0 && (
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="imp-split">
                One file contains…
              </label>
              <select id="imp-split" className="input" value={split} onChange={(e) => setSplit(e.target.value as SplitMode)}>
                <option value="none">One piece per file</option>
                <option value="separator">Several pieces separated by --- or ***</option>
                <option value="blank-lines">Several pieces separated by 2+ blank lines</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="imp-type">
                Type
              </label>
              <TypeSelect id="imp-type" value={type} onChange={setType} className="w-full" />
            </div>
            <div>
              <span className="label">Status</span>
              <StatusPicker value={status} onChange={setStatus} size="sm" />
            </div>
            <div>
              <label className="label" htmlFor="imp-tags">
                Add tags to all (optional)
              </label>
              <input id="imp-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#archive #2019" />
            </div>
          </div>
          <p className="text-xs text-muted">
            Your text is imported exactly as written. Hashtags in the files become tags; nothing is removed from the writing.
          </p>
          {errors.length > 0 && (
            <ul className="text-sm text-seed">
              {errors.map((f) => (
                <li key={f.name}>
                  {f.name}: {f.error}
                </li>
              ))}
            </ul>
          )}
          <div className="panel max-h-64 overflow-y-auto">
            <p className="sticky top-0 border-b border-line bg-card px-4 py-2 text-sm font-semibold">
              {preview.length} piece{preview.length === 1 ? '' : 's'} from {files.length - errors.length} file{files.length === 1 ? '' : 's'}
            </p>
            <ol className="divide-y divide-line">
              {preview.slice(0, 200).map((p, i) => (
                <li key={i} className="px-4 py-2">
                  <span className="font-serif">{displayTitle({ title: p.title ?? '', body: p.body })}</span>
                  <span className="ml-2 text-xs text-muted">{p.source?.fileName}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={reset}>
              Clear
            </button>
            <button type="button" className="btn-primary" onClick={() => void commit()} disabled={busy || !preview.length}>
              Import {preview.length}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
