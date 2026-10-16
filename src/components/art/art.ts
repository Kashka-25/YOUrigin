import type { ContentItem } from '../../domain/types';

/** "Oil on canvas · 60×80cm · 2026", or '' when no details are filled in. */
export function artCaption(item: Pick<ContentItem, 'art' | 'inspiration'>): string {
  const parts = [item.art?.medium, item.art?.size, item.art?.madeOn].map((p) => p?.trim()).filter(Boolean);
  if (item.inspiration) parts.unshift('Inspiration');
  return parts.join(' · ');
}

export const isArtwork = (i: ContentItem) => i.type === 'image' && !!i.assetId && !i.deletedAt;
