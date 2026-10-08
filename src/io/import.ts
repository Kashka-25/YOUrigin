import type { NewContent } from '../db/content';
import type { ContentType, Status } from '../domain/types';
import { extractHashtags, newId } from '../domain/text';
import { blocksFromHtml, blocksFromText, splitDocument, type Block, type SplitStrategy } from './splitter';

export const IMPORT_ACCEPT = '.txt,.md,.markdown,.text,.docx';

export interface ImportedFile {
  name: string;
  blocks: Block[];
  error?: string;
}

/** One piece in the import preview. Editable before anything is saved. */
export interface DraftPiece {
  key: string;
  file: string;
  title: string;
  body: string;
  include: boolean;
  /** Chapter/section in the source document, if it has them. */
  section?: string;
  /** This piece is the document's own contents list (mostly other pieces' titles). */
  contentsList?: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * A document's own contents/glossary lists the titles of its pieces. In the app
 * that's replaced by the live, linked Contents, so such a piece is flagged and
 * left unticked (it can still be kept).
 */
export function markContentsLists(pieces: DraftPiece[]): DraftPiece[] {
  const titles = new Set(pieces.map((p) => norm(p.title)).filter(Boolean));
  if (titles.size < 4) return pieces;
  return pieces.map((p) => {
    const lines = p.body.split('\n').map(norm).filter(Boolean);
    if (lines.length < 4) return p;
    const hits = lines.filter((l) => titles.has(l) && l !== norm(p.title)).length;
    return hits / lines.length >= 0.5 ? { ...p, contentsList: true, include: false } : p;
  });
}

// Word styles that mark a poem's title, and page breaks, survive conversion.
const DOCX_STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "br[type='page'] => hr",
];

/** Reads files into blocks. DOCX is converted on-device (mammoth, loaded lazily). */
export async function readFiles(files: File[]): Promise<ImportedFile[]> {
  return Promise.all(
    files.map(async (f): Promise<ImportedFile> => {
      try {
        if (/\.docx$/i.test(f.name)) {
          const mammoth = await import('mammoth');
          const data = await f.arrayBuffer();
          // The browser build takes an ArrayBuffer; the Node build (tests) needs a Buffer.
          const NodeBuffer = (globalThis as { Buffer?: { from(a: ArrayBuffer): unknown } }).Buffer;
          const input = (NodeBuffer ? { buffer: NodeBuffer.from(data) } : { arrayBuffer: data }) as { arrayBuffer: ArrayBuffer };
          const { value } = await mammoth.convertToHtml(
            input,
            { styleMap: DOCX_STYLE_MAP, ignoreEmptyParagraphs: false, convertImage: mammoth.images.imgElement(async () => ({ src: '' })) },
          );
          return { name: f.name, blocks: blocksFromHtml(value) };
        }
        if (/\.(txt|md|markdown|text)$/i.test(f.name) || f.type.startsWith('text/')) {
          return { name: f.name, blocks: blocksFromText(await f.text(), /\.(md|markdown)$/i.test(f.name)) };
        }
        return { name: f.name, blocks: [], error: 'Unsupported file type (use .docx, .txt or .md)' };
      } catch (e) {
        return { name: f.name, blocks: [], error: e instanceof Error ? e.message : 'Could not read file' };
      }
    }),
  );
}

function baseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
}

/** Splits every file into draft pieces. Returns which method was used per file. */
export function draftPieces(
  files: ImportedFile[],
  strategy: SplitStrategy,
): { pieces: DraftPiece[]; used: Record<string, Exclude<SplitStrategy, 'auto'>> } {
  const pieces: DraftPiece[] = [];
  const used: Record<string, Exclude<SplitStrategy, 'auto'>> = {};
  for (const f of files) {
    if (f.error || !f.blocks.length) continue;
    const { strategy: s, pieces: split } = splitDocument(f.blocks, strategy);
    used[f.name] = s;
    for (const p of split) {
      pieces.push({
        key: newId(),
        file: f.name,
        title: p.title || (split.length === 1 ? baseName(f.name) : ''),
        body: p.body,
        include: true,
        section: p.section,
      });
    }
  }
  return { pieces: markContentsLists(pieces), used };
}

export interface ImportOptions {
  status: Status;
  /** 'auto' guesses each piece's type from its title and shape. */
  type: ContentType | 'auto';
  extraTags: string[];
}

/** The drafts that will actually be imported, in order. */
export function includedDrafts(drafts: DraftPiece[]): DraftPiece[] {
  return drafts.filter((d) => d.include && (d.body.trim() || d.title.trim()));
}

/**
 * Types for a whole import. In a document that is mostly verse, short
 * untitled-looking pieces are poems too, not fragments or notes.
 */
export function resolveTypes(drafts: Pick<DraftPiece, 'title' | 'body'>[], choice: ContentType | 'auto'): ContentType[] {
  if (choice !== 'auto') return drafts.map(() => choice);
  const guesses = drafts.map((d) => guessType(d.title, d.body));
  const verse = guesses.filter((t) => t === 'poem' || t === 'fragment' || t === 'note').length;
  if (guesses.length && verse / guesses.length >= 0.7) {
    return guesses.map((t) => (t === 'fragment' || t === 'note' ? 'poem' : t));
  }
  return guesses;
}

/** Guesses a piece's type from how journals and collections usually label things. */
export function guessType(title: string, body: string): ContentType {
  const t = title.toLowerCase();
  const lines = body.split('\n').filter((l) => l.trim());
  if (/^\W*\d+[\s.)]/.test(title) && title.includes('?')) return 'prompt';
  if (/prompt|journal(ing)? question|question/.test(t)) return 'prompt';
  if (/invitation|ritual|practice|meditation|exercise|ceremony|breath/.test(t)) return 'ritual';
  if (/reflection/.test(t)) return 'reflection';
  if (/teaching|lesson|energetics|wisdom/.test(t)) return 'teaching';
  if (/quote|epigraph/.test(t)) return 'quote';
  if (/introduction|chapter|preface|foreword|opening|closing|conclusion|afterword/.test(t)) return 'reflection';
  const words = body.split(/\s+/).filter(Boolean).length;
  if (lines.length >= 2 && words / lines.length <= 10) return 'poem';
  if (words > 120) return 'reflection';
  return lines.length <= 2 ? 'fragment' : 'note';
}

/**
 * Turns the reviewed drafts into library records. The text is kept exactly as
 * written; hashtags are read into tags but never removed from the writing.
 */
export function toNewContent(drafts: DraftPiece[], opts: ImportOptions): NewContent[] {
  const kept = includedDrafts(drafts);
  const types = resolveTypes(kept, opts.type);
  return kept
    .map((d, i) => ({
      title: d.title.trim(),
      body: d.body,
      type: types[i],
      status: opts.status,
      tagNames: [...new Set([...extractHashtags(`${d.title}\n${d.body}`), ...opts.extraTags])],
      source: { kind: 'import' as const, fileName: d.file },
    }));
}

// ---- preview edits -----------------------------------------------------------

export function joinWithNext(pieces: DraftPiece[], index: number): DraftPiece[] {
  const a = pieces[index];
  const b = pieces[index + 1];
  if (!a || !b) return pieces;
  const joined: DraftPiece = {
    ...a,
    body: [a.body, b.title ? `${b.title}\n${b.body}` : b.body].filter((s) => s.trim()).join('\n\n'),
  };
  return [...pieces.slice(0, index), joined, ...pieces.slice(index + 2)];
}

/** Split a piece before the given line; the new piece starts at that line. */
export function splitAt(pieces: DraftPiece[], index: number, lineIndex: number): DraftPiece[] {
  const p = pieces[index];
  if (!p) return pieces;
  const lines = p.body.split('\n');
  if (lineIndex <= 0 || lineIndex >= lines.length) return pieces;
  const trim = (ls: string[]) => {
    while (ls.length && !ls[0].trim()) ls.shift();
    while (ls.length && !ls[ls.length - 1].trim()) ls.pop();
    return ls.join('\n');
  };
  const first: DraftPiece = { ...p, body: trim(lines.slice(0, lineIndex)) };
  const second: DraftPiece = { ...p, key: newId(), title: '', body: trim(lines.slice(lineIndex)) };
  return [...pieces.slice(0, index), first, second, ...pieces.slice(index + 1)];
}
