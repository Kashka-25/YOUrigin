import { describe, expect, it } from 'vitest';
import { resolveSpace, bookHtml } from './render';
import { defaultDesign } from './design';
import type { ContentItem, ContentType } from '../domain/types';

const piece = (type: ContentType, title: string, body = ''): ContentItem => ({
  id: title,
  title,
  body,
  type,
  status: 'seed',
  tagIds: [],
  notes: '',
  source: { kind: 'capture' },
  keepUnassigned: false,
  archived: false,
  deletedAt: null,
  createdAt: 1,
  updatedAt: 1,
});

describe('writing and drawing space', () => {
  const journal = defaultDesign('journal');

  it('gives prompts ruled lines to the end of the page', () => {
    expect(resolveSpace(piece('prompt', '1 What have you brought with you?'), undefined, journal)).toMatchObject({ kind: 'lines', size: 'fill' });
  });

  it('gives drawing activities open space instead of lines', () => {
    const ripples = piece('ritual', '🌀 Integration Invitation 3: Ripple Mapping', 'Draw a series of ripples on the page.');
    expect(resolveSpace(ripples, undefined, journal)).toMatchObject({ kind: 'blank', size: 'fill' });
    expect(resolveSpace(piece('prompt', '6 Draw a shoreline of what you feel'), undefined, journal).kind).toBe('blank');
  });

  it('gives writing activities lines, and leaves other pieces alone', () => {
    expect(resolveSpace(piece('ritual', 'Meet Your Reflection', 'Write the answers in the form of a letter.'), undefined, journal).kind).toBe('lines');
    expect(resolveSpace(piece('ritual', 'Touch the Earth', 'Place your palms on the ground.'), undefined, journal).kind).toBe('none');
    expect(resolveSpace(piece('poem', 'Tide'), undefined, journal).kind).toBe('none');
  });

  it('respects a per-piece choice and turning detection off', () => {
    const p = piece('prompt', '2 Close your eyes');
    expect(resolveSpace(p, { space: { kind: 'blank', size: 'page' } }, journal)).toMatchObject({ kind: 'blank', size: 'page' });
    expect(resolveSpace(p, { space: { kind: 'none', size: 'fill' } }, journal).kind).toBe('none');
    const draw = piece('prompt', '6 Draw a shoreline');
    expect(resolveSpace(draw, undefined, { ...journal, detectDrawing: false }).kind).toBe('lines');
  });

  it('poetry books get no writing space by default', () => {
    expect(resolveSpace(piece('prompt', 'A prompt'), undefined, defaultDesign('poetry')).kind).toBe('none');
  });

  it('emits a fill area that ends its page', () => {
    const p = piece('prompt', '1 What have you brought?');
    const html = bookHtml({
      book: { id: 'b', title: 'B', subtitle: '', description: '', type: 'journal', templateId: null, cover: 'clay', notes: '', archived: false, createdAt: 1, updatedAt: 1 },
      design: journal,
      sections: [{ id: 's', bookId: 'b', title: 'One', order: 0, notes: '', createdAt: 1, updatedAt: 1 }],
      entries: [{ id: 'e', bookId: 'b', sectionId: 's', contentId: p.id, order: 0, createdAt: 1, updatedAt: 1 }],
      contentById: new Map([[p.id, p]]),
      assets: new Map(),
    });
    expect(html).toContain('yb-space yb-space-lines yb-space-fill');
  });
});
