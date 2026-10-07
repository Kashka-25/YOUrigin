import type { NewContent } from '../db/content';
import type { ContentType, Status } from '../domain/types';
import { extractHashtags, extractMarkdownTitle, splitPieces, type SplitMode } from '../domain/text';

export const IMPORT_ACCEPT = '.txt,.md,.markdown,.text,.docx';

export interface ImportOptions {
  split: SplitMode;
  status: Status;
  type: ContentType;
  extraTags: string[];
}

export interface ImportedFile {
  name: string;
  text: string;
  error?: string;
}

/** Reads files as text. DOCX is converted to plain text on-device (mammoth, loaded lazily). */
export async function readFiles(files: File[]): Promise<ImportedFile[]> {
  return Promise.all(
    files.map(async (f): Promise<ImportedFile> => {
      try {
        if (/\.docx$/i.test(f.name)) {
          const mammoth = await import('mammoth');
          const { value } = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
          return { name: f.name, text: value };
        }
        if (/\.(txt|md|markdown|text)$/i.test(f.name) || f.type.startsWith('text/')) {
          return { name: f.name, text: await f.text() };
        }
        return { name: f.name, text: '', error: 'Unsupported file type (use .txt, .md or .docx)' };
      } catch (e) {
        return { name: f.name, text: '', error: e instanceof Error ? e.message : 'Could not read file' };
      }
    }),
  );
}

function baseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
}

/**
 * Turns files into new library records. The body text is kept exactly as
 * written (only outer blank lines trimmed); hashtags are *read* into tags but
 * never removed from the text.
 */
export function buildImport(files: ImportedFile[], opts: ImportOptions): NewContent[] {
  const out: NewContent[] = [];
  for (const f of files) {
    if (f.error || !f.text.trim()) continue;
    const isMd = /\.(md|markdown)$/i.test(f.name);
    const pieces = splitPieces(f.text, opts.split);
    for (const raw of pieces) {
      let title = '';
      let body = raw;
      if (isMd) ({ title, body } = extractMarkdownTitle(raw));
      if (!title && pieces.length === 1) title = baseName(f.name);
      out.push({
        title,
        body,
        type: opts.type,
        status: opts.status,
        tagNames: [...new Set([...extractHashtags(raw), ...opts.extraTags])],
        source: { kind: 'import', fileName: f.name },
      });
    }
  }
  return out;
}
