// Splits one long document into separate pieces (e.g. a whole poetry collection
// in a single Word file). The text of each piece is kept exactly as written;
// only the boundaries are decided here.

export type BlockKind = 'heading' | 'line' | 'empty' | 'pagebreak' | 'separator';

export interface Block {
  kind: BlockKind;
  text: string;
}

export type SplitStrategy = 'auto' | 'headings' | 'pagebreaks' | 'separators' | 'title-lines' | 'blank-lines' | 'none';

export const STRATEGY_LABEL: Record<Exclude<SplitStrategy, 'auto'>, string> = {
  headings: 'Headings (titles styled as headings)',
  pagebreaks: 'Page breaks',
  separators: 'Separator lines (*** --- ~~~ ⁂ …)',
  'title-lines': 'Title-like lines (ALL CAPS, numbered, or set apart)',
  'blank-lines': 'Two or more blank lines',
  none: 'Keep as one piece',
};

export interface SplitPiece {
  title: string;
  body: string;
}

const SEPARATOR = /^\s*(?:(?:[-*_~=#•·✦✧❦⁂☙❧◆◇◦+]\s*){3,}|[⁂❦☙❧✦]|\*\s\*\s\*)\s*$/u;

/** Plain text / Markdown → blocks. A form-feed character marks a page break. */
export function blocksFromText(text: string, markdown = false): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const parts = raw.split('\f');
    parts.forEach((line, i) => {
      if (i > 0) blocks.push({ kind: 'pagebreak', text: '' });
      if (markdown && /^#{1,3}\s+\S/.test(line)) blocks.push({ kind: 'heading', text: line.replace(/^#{1,3}\s+/, '').trim() });
      else if (!line.trim()) blocks.push({ kind: 'empty', text: '' });
      else if (SEPARATOR.test(line)) blocks.push({ kind: 'separator', text: line });
      else blocks.push({ kind: 'line', text: line });
    });
  }
  return blocks;
}

/** Word document (converted to HTML by mammoth) → blocks, keeping headings, page breaks and empty lines. */
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
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        const t = textOf(child).trim();
        if (t) blocks.push({ kind: 'heading', text: t });
      } else if (tag === 'hr') blocks.push({ kind: 'pagebreak', text: '' });
      else if (tag === 'p' || tag === 'li') {
        // A page break inside a paragraph arrives as an <hr> child.
        if (child.querySelector('hr')) {
          const before = Array.from(child.childNodes);
          let buf = '';
          for (const n of before) {
            if (n.nodeName === 'HR') {
              if (buf.trim()) pushLines(buf);
              blocks.push({ kind: 'pagebreak', text: '' });
              buf = '';
            } else buf += n.nodeName === 'BR' ? '\n' : (n.textContent ?? '');
          }
          if (buf.trim()) pushLines(buf);
        } else pushLines(textOf(child));
      } else if (tag === 'ul' || tag === 'ol' || tag === 'div' || tag === 'table' || tag === 'tbody' || tag === 'tr' || tag === 'td') walk(child);
      else pushLines(textOf(child));
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

function finish(title: string, lines: string[]): SplitPiece | null {
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length && !title) return null;
  return { title: title.trim(), body: lines.join('\n') };
}

function lineOf(b: Block) {
  return b.kind === 'empty' ? '' : b.text;
}

export function splitBlocks(blocks: Block[], strategy: Exclude<SplitStrategy, 'auto'>): SplitPiece[] {
  const out: SplitPiece[] = [];
  let title = '';
  let lines: string[] = [];
  const flush = () => {
    const p = finish(title, lines);
    if (p && (p.body.trim() || p.title)) out.push(p);
    title = '';
    lines = [];
  };

  blocks.forEach((b, i) => {
    switch (strategy) {
      case 'headings':
        if (b.kind === 'heading') {
          flush();
          title = b.text;
        } else if (b.kind !== 'pagebreak') lines.push(lineOf(b));
        break;
      case 'pagebreaks':
        if (b.kind === 'pagebreak') flush();
        else if (b.kind === 'heading' && !lines.some((l) => l.trim()) && !title) title = b.text;
        else lines.push(lineOf(b));
        break;
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
