// Splits one long document into separate pieces (e.g. a whole poetry collection
// or journal in a single Word file), and recognises its chapters/sections.
// The text of each piece is kept exactly as written; only boundaries are decided here.

export type BlockKind = 'heading' | 'line' | 'empty' | 'pagebreak' | 'separator';

export interface Block {
  kind: BlockKind;
  text: string;
  /** Heading level: 1–3 from Word/Markdown headings, 4 for a bold title line. */
  level?: number;
}

export type SplitStrategy = 'auto' | 'headings' | 'pagebreaks' | 'separators' | 'title-lines' | 'blank-lines' | 'none';

export const STRATEGY_LABEL: Record<Exclude<SplitStrategy, 'auto'>, string> = {
  headings: 'Titles (headings or bold title lines)',
  pagebreaks: 'Page breaks (one piece per page)',
  separators: 'Separator lines (*** --- ~~~ ⁂ …)',
  'title-lines': 'Title-like lines (ALL CAPS, numbered, or set apart)',
  'blank-lines': 'Two or more blank lines',
  none: 'Keep as one piece',
};

export interface SplitPiece {
  title: string;
  body: string;
  /** The chapter/section this piece sits in, when the document has them. */
  section?: string;
}

const SEPARATOR = /^\s*(?:(?:[-*_~=#•·✦✧❦⁂☙❧◆◇◦+]\s*){3,}|[⁂❦☙❧✦]|\*\s\*\s\*)\s*$/u;
const SECTION_WORD = /^[^\p{L}\p{N}]*(chapter|part|introduction|prologue|epilogue|conclusion|section|interlude|afterword|foreword|preface|closing|opening)\b/iu;

/** Plain text / Markdown → blocks. A form-feed character marks a page break. */
export function blocksFromText(text: string, markdown = false): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const parts = raw.split('\f');
    parts.forEach((line, i) => {
      if (i > 0) blocks.push({ kind: 'pagebreak', text: '' });
      const md = markdown ? line.match(/^(#{1,3})\s+(\S.*)$/) : null;
      if (md) blocks.push({ kind: 'heading', text: md[2].trim(), level: md[1].length });
      else if (!line.trim()) blocks.push({ kind: 'empty', text: '' });
      else if (SEPARATOR.test(line)) blocks.push({ kind: 'separator', text: line });
      else blocks.push({ kind: 'line', text: line });
    });
  }
  return blocks;
}

/**
 * Word document (converted to HTML by mammoth) → blocks. Keeps headings (with
 * their level), page breaks and empty lines; a short paragraph that is entirely
 * bold is treated as a title line.
 */
export function blocksFromHtml(html: string): Block[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const blocks: Block[] = [];
  const textOf = (el: Element) => {
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    return (clone.textContent ?? '').replace(/\u00a0/g, ' ');
  };
  const pushLines = (text: string) => {
    for (const line of text.split('\n')) {
      if (!line.trim()) blocks.push({ kind: 'empty', text: '' });
      else if (SEPARATOR.test(line)) blocks.push({ kind: 'separator', text: line });
      else blocks.push({ kind: 'line', text: line.replace(/\s+$/, '') });
    }
  };
  // Letters only, so an un-bolded emoji or punctuation mark doesn't hide a bold title.
  const letters = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '');
  const isBoldTitle = (p: Element) => {
    const all = letters(p.textContent ?? '');
    if (!all) return false;
    const bold = letters([...p.querySelectorAll('strong')].map((s) => s.textContent ?? '').join(''));
    const firstLine = textOf(p).split('\n').find((l) => l.trim()) ?? '';
    return bold.length / all.length >= 0.9 && firstLine.trim().length <= 260;
  };
  const pushParagraph = (p: Element) => {
    if (isBoldTitle(p)) {
      const [first, ...rest] = textOf(p).split('\n').filter((l, i) => i > 0 || l.trim());
      const title = first.trim();
      blocks.push({ kind: 'heading', text: title, level: SECTION_WORD.test(title) ? 1 : 4 });
      if (rest.length) pushLines(rest.join('\n'));
    } else pushLines(textOf(p));
  };
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        const t = textOf(child).replace(/\s+/g, ' ').trim();
        if (t) blocks.push({ kind: 'heading', text: t, level: Math.min(Number(tag[1]), 3) });
      } else if (tag === 'hr') blocks.push({ kind: 'pagebreak', text: '' });
      else if (tag === 'p' || tag === 'li') {
        // A page break inside a paragraph arrives as an <hr> child.
        if (child.querySelector('hr')) {
          // Treat the text on each side of the break as its own paragraph (so a bold
          // chapter title that follows a page break is still recognised).
          let part = doc.createElement('p');
          const flushPart = () => {
            if ((part.textContent ?? '').trim()) pushParagraph(part);
            part = doc.createElement('p');
          };
          for (const n of Array.from(child.childNodes)) {
            if (n.nodeName === 'HR') {
              flushPart();
              blocks.push({ kind: 'pagebreak', text: '' });
            } else part.appendChild(n.cloneNode(true));
          }
          flushPart();
        } else pushParagraph(child);
      } else if (['ul', 'ol', 'div', 'table', 'tbody', 'tr', 'td'].includes(tag)) walk(child);
      else {
        // Loose inline text — e.g. a bold title the HTML parser pushed out of its
        // paragraph because a page break came first. Treat it as a paragraph.
        const p = doc.createElement('p');
        p.appendChild(child.cloneNode(true));
        pushParagraph(p);
      }
    }
  };
  walk(doc.body);
  return blocks;
}

const ROMAN = /^(?=[MDCLXVI])M*(?:C[MD]|D?C{0,3})(?:X[CL]|L?X{0,3})(?:I[XV]|V?I{0,3})\.?$/;

/** Short lines that look like a poem title rather than a line of verse. */
export function isTitleLike(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 60) return false;
  const words = t.split(/\s+/);
  if (words.length > 9) return false;
  if (/[,;:]$/.test(t)) return false;
  if (/^(?:no\.?\s*)?\d{1,3}[.)]?(\s|$)/i.test(t) || ROMAN.test(t)) return true; // "12." "No. 3" "XIV"
  const letters = t.replace(/[^\p{L}]/gu, '');
  if (letters.length >= 2 && letters === letters.toUpperCase() && /\p{Lu}/u.test(letters)) return true; // ALL CAPS
  return false;
}

/** "- H O P E F U L -" → "HOPEFUL"; other names are only trimmed. */
export function cleanSectionName(raw: string): string {
  let t = raw.replace(/^[\s\-–—_*~•·]+|[\s\-–—_*~•·]+$/g, '').trim();
  if (/^(?:\S\s){2,}\S$/u.test(t)) t = t.replace(/\s/g, '');
  return t || raw.trim();
}

/**
 * Which heading level marks chapters: the top level, when the document also has
 * more detailed headings beneath it and the top level is used more than once.
 */
export function sectionLevel(blocks: Block[]): number | null {
  const levels = new Map<number, number>();
  for (const b of blocks) if (b.kind === 'heading') levels.set(b.level ?? 1, (levels.get(b.level ?? 1) ?? 0) + 1);
  const sorted = [...levels.keys()].sort((a, b) => a - b);
  if (sorted.length < 2) return null;
  const top = sorted[0];
  const topCount = levels.get(top)!;
  const below = sorted.slice(1).reduce((n, l) => n + levels.get(l)!, 0);
  return topCount >= 2 && below > topCount ? top : null;
}

function finish(title: string, lines: string[], section?: string): SplitPiece | null {
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length && !title) return null;
  return { title: title.trim(), body: lines.join('\n'), section };
}

function lineOf(b: Block) {
  return b.kind === 'empty' ? '' : b.text;
}

export function splitBlocks(blocks: Block[], strategy: Exclude<SplitStrategy, 'auto'>): SplitPiece[] {
  const secLevel = strategy === 'headings' || strategy === 'pagebreaks' ? sectionLevel(blocks) : null;
  const isSection = (b: Block) => b.kind === 'heading' && secLevel !== null && (b.level ?? 1) <= secLevel;
  const out: SplitPiece[] = [];
  let section: string | undefined;
  let title = '';
  let lines: string[] = [];
  const flush = () => {
    const p = finish(title, lines, section);
    // A chapter heading on its own is structure, not a piece.
    if (p && (p.body.trim() || (p.title && p.title !== section))) out.push(p);
    title = '';
    lines = [];
  };
  const startSection = (b: Block) => {
    flush();
    section = cleanSectionName(b.text);
    title = section; // any text directly under the chapter heading becomes its opening piece
  };

  blocks.forEach((b, i) => {
    switch (strategy) {
      case 'headings':
        if (isSection(b)) startSection(b);
        else if (b.kind === 'heading') {
          flush();
          title = b.text;
        } else if (b.kind !== 'pagebreak') lines.push(lineOf(b));
        break;
      case 'pagebreaks': {
        const atPageStart = !lines.some((l) => l.trim()) && (!title || title === section);
        if (b.kind === 'pagebreak') flush();
        else if (isSection(b) && atPageStart) startSection(b);
        else if (b.kind === 'heading' && atPageStart && (!title || title === section)) title = b.text;
        else lines.push(lineOf(b));
        break;
      }
      case 'separators':
        if (b.kind === 'separator') flush();
        else if (b.kind === 'heading' && !lines.some((l) => l.trim()) && !title) title = b.text;
        else if (b.kind !== 'pagebreak') lines.push(lineOf(b));
        break;
      case 'title-lines': {
        const prevEmpty = i === 0 || blocks[i - 1].kind !== 'line';
        const nextLine = blocks.slice(i + 1).find((x) => x.kind !== 'empty');
        const startsPiece = b.kind === 'heading' || (b.kind === 'line' && prevEmpty && isTitleLike(b.text) && nextLine?.kind === 'line');
        if (startsPiece) {
          flush();
          title = b.text.trim();
        } else if (b.kind !== 'pagebreak' && b.kind !== 'separator') lines.push(lineOf(b));
        else flush();
        break;
      }
      case 'blank-lines': {
        if (b.kind === 'empty' && blocks[i + 1]?.kind === 'empty' && lines.some((l) => l.trim())) flush();
        else if (b.kind === 'pagebreak' || b.kind === 'separator') flush();
        else if (b.kind === 'heading') {
          flush();
          title = b.text;
        } else lines.push(lineOf(b));
        break;
      }
      case 'none':
        if (b.kind === 'heading' && !title && !lines.some((l) => l.trim())) title = b.text;
        else if (b.kind !== 'pagebreak') lines.push(lineOf(b));
        break;
    }
  });
  flush();
  return out;
}

/** Picks the most likely way this document separates its pieces. */
export function detectStrategy(blocks: Block[]): Exclude<SplitStrategy, 'auto'> {
  const count = (k: BlockKind) => blocks.filter((b) => b.kind === k).length;
  if (count('heading') >= 2) return 'headings';
  if (count('pagebreak') >= 2) return 'pagebreaks';
  if (count('separator') >= 2) return 'separators';
  const titled = splitBlocks(blocks, 'title-lines').filter((p) => p.title).length;
  if (titled >= 3) return 'title-lines';
  const byBlank = splitBlocks(blocks, 'blank-lines');
  if (byBlank.length >= 3) return 'blank-lines';
  return 'none';
}

export function splitDocument(blocks: Block[], strategy: SplitStrategy): { strategy: Exclude<SplitStrategy, 'auto'>; pieces: SplitPiece[] } {
  const chosen = strategy === 'auto' ? detectStrategy(blocks) : strategy;
  return { strategy: chosen, pieces: splitBlocks(blocks, chosen) };
}
