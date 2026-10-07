import type { Book, BookEntry, ContentItem, Section } from '../domain/types';
import { STATUS_META, TYPE_LABEL } from '../domain/constants';
import { displayTitle } from '../domain/text';

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'yourigin'
  );
}

export function download(fileName: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Poems keep their line breaks in Markdown via trailing double spaces. */
function mdBody(item: ContentItem): string {
  if (item.type === 'poem' || item.type === 'fragment') {
    return item.body
      .split('\n')
      .map((l) => (l.trim() ? l + '  ' : ''))
      .join('\n');
  }
  return item.body;
}

export function orderedBook(sections: Section[], entries: BookEntry[], contentById: Map<string, ContentItem>) {
  const live = entries.filter((e) => {
    const c = contentById.get(e.contentId);
    return c && !c.deletedAt;
  });
  return [...sections]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      section: s,
      items: live
        .filter((e) => e.sectionId === s.id)
        .sort((a, b) => a.order - b.order)
        .map((e) => contentById.get(e.contentId)!),
    }));
}

export function bookToMarkdown(
  book: Book,
  sections: Section[],
  entries: BookEntry[],
  contentById: Map<string, ContentItem>,
): string {
  const lines: string[] = [`# ${book.title}`];
  if (book.subtitle) lines.push(`## ${book.subtitle}`);
  if (book.description) lines.push('', `> ${book.description.replace(/\n/g, '\n> ')}`);
  for (const { section, items } of orderedBook(sections, entries, contentById)) {
    lines.push('', '---', '', `## ${section.title}`);
    for (const item of items) {
      lines.push('', `### ${displayTitle(item)}`, '', mdBody(item));
    }
  }
  lines.push('');
  return lines.join('\n');
}

export function libraryToMarkdown(items: ContentItem[], tagName: Map<string, string>): string {
  const lines = [`# YOUrigin library export`, '', `Exported ${new Date().toLocaleString()} · ${items.length} pieces`];
  for (const item of items) {
    const tags = item.tagIds.map((t) => '#' + (tagName.get(t) ?? '')).join(' ');
    lines.push(
      '',
      '---',
      '',
      `## ${displayTitle(item)}`,
      '',
      `*${TYPE_LABEL[item.type]} · ${STATUS_META[item.status].label}${tags ? ' · ' + tags : ''}*`,
      '',
      mdBody(item),
    );
    if (item.notes) lines.push('', `> Notes: ${item.notes.replace(/\n/g, '\n> ')}`);
  }
  lines.push('');
  return lines.join('\n');
}
