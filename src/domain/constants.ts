import type { Book, BookType, ContentType, ProjectColour, ProjectKind, ProjectStatus, Status } from './types';

/** Order shown in pickers: no colour, then red, amber, green. */
export const STATUSES: Status[] = ['none', 'seed', 'developing', 'polished'];

export const PROJECT_CATEGORIES = ['App', 'Business', 'Creative', 'Place', 'Research', 'Personal', 'Other'] as const;

export const DEFAULT_PROJECT_COLOUR: ProjectColour = 'ochre';

/**
 * Project colours, spread around the wheel and across light/deep so no two read alike.
 * The keys are what's stored on each Project; only the shades changed (13 Nov 2026).
 */
export const PROJECT_COLOURS: { value: ProjectColour; label: string; hex: string }[] = [
  { value: 'rose', label: 'Rose', hex: '#F06292' },
  { value: 'berry', label: 'Berry', hex: '#C2185B' },
  { value: 'plum', label: 'Plum', hex: '#6D2A5E' },
  { value: 'coral', label: 'Coral', hex: '#FF7F50' },
  { value: 'terracotta', label: 'Terracotta', hex: '#A33E22' },
  { value: 'amber', label: 'Amber', hex: '#F59E0B' },
  { value: 'ochre', label: 'Ochre', hex: '#C9A227' },
  { value: 'olive', label: 'Olive', hex: '#7D8B1F' },
  { value: 'moss', label: 'Moss', hex: '#3E8E3A' },
  { value: 'jade', label: 'Jade', hex: '#16A57F' },
  { value: 'teal', label: 'Teal', hex: '#0E7C86' },
  { value: 'sky', label: 'Sky', hex: '#4FB3F0' },
  { value: 'indigo', label: 'Indigo', hex: '#3949AB' },
  { value: 'lavender', label: 'Lavender', hex: '#B39DDB' },
  { value: 'violet', label: 'Violet', hex: '#7B3FC4' },
  { value: 'slate', label: 'Slate', hex: '#66788A' },
];

export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; description: string; className: string }
> = {
  idea: { label: 'Idea', description: 'Something you may explore.', className: 'bg-paper-2 text-ink-2' },
  building: { label: 'Building', description: 'Actively taking shape.', className: 'bg-developing/15 text-developing' },
  resting: { label: 'Resting', description: 'Intentionally paused.', className: 'bg-paper-2 text-muted' },
  complete: { label: 'Complete', description: 'Finished or fulfilled.', className: 'bg-polished/15 text-polished' },
};

/**
 * Pieces use a traffic light rather than words. The keys stay seed / developing / polished
 * so stored data and sync are untouched; 'none' means no light at all.
 */
export const STATUS_META: Record<
  Status,
  { label: string; short: string; colour: string; symbol: string; meaning: string }
> = {
  none: { label: 'No colour', short: 'None', colour: 'muted', symbol: '○', meaning: 'No traffic light on this piece.' },
  seed: { label: 'Red', short: 'Just begun', colour: 'seed', symbol: '●', meaning: 'Red: just begun.' },
  developing: { label: 'Amber', short: 'Taking shape', colour: 'developing', symbol: '●', meaning: 'Amber: taking shape.' },
  polished: { label: 'Green', short: 'Ready', colour: 'polished', symbol: '●', meaning: 'Green: ready, or close enough to share.' },
};

export const CONTENT_TYPES: ContentType[] = [
  'poem',
  'song',
  'fragment',
  'idea',
  'reflection',
  'teaching',
  'prompt',
  'ritual',
  'quote',
  'story',
  'research',
  'note',
  'image',
  'other',
];

export const TYPE_LABEL: Record<ContentType, string> = {
  poem: 'Poem',
  song: 'Song',
  fragment: 'Fragment',
  idea: 'Idea',
  reflection: 'Reflection',
  teaching: 'Teaching',
  prompt: 'Prompt',
  ritual: 'Ritual',
  quote: 'Quote',
  story: 'Story',
  research: 'Research',
  note: 'Note',
  image: 'Image',
  other: 'Other',
};

export const BOOK_TYPE_LABEL: Record<BookType, string> = {
  journal: 'Journal',
  poetry: 'Poetry Collection',
  essay: 'Essay / Philosophy',
  codex: 'Codex',
  custom: 'Custom',
};

export const PROJECT_KINDS: ProjectKind[] = ['book', 'album', 'setlist', 'series', 'ideas', 'custom'];

/** numbered: pieces show their place (track 1, 2…). noun: what a piece is called in counts. gallery: sections show as picture grids. */
export const PROJECT_KIND_META: Record<ProjectKind, { label: string; numbered: boolean; sections: string[]; noun: string; gallery?: boolean }> = {
  book: { label: 'Book', numbered: false, sections: [], noun: 'piece' },
  album: { label: 'Album', numbered: true, sections: ['Tracks'], noun: 'track' },
  setlist: { label: 'Set list', numbered: true, sections: ['Set 1'], noun: 'song' },
  series: { label: 'Series', numbered: false, sections: [], noun: 'artwork', gallery: true },
  ideas: { label: 'Ideas', numbered: false, sections: [], noun: 'idea' },
  custom: { label: 'Custom', numbered: false, sections: [], noun: 'piece' },
};

export function projectKind(b: Pick<Book, 'kind'>): ProjectKind {
  return b.kind && b.kind in PROJECT_KIND_META ? b.kind : 'book';
}

export function isBookProject(b: Pick<Book, 'kind'>): boolean {
  return projectKind(b) === 'book';
}

export const COVER_COLOURS = ['clay', 'sea', 'moss', 'dusk', 'sand', 'ink'] as const;

/** Built-in templates use stable ids so backups merge cleanly across devices. */
export const BUILT_IN_TEMPLATES: { id: string; name: string; bookType: BookType; sections: string[] }[] = [
  {
    id: 'tpl-journal',
    name: 'Journal',
    bookType: 'journal',
    sections: [
      'Opening',
      'Orientation',
      'Teaching',
      'Reflection',
      'Prompts',
      'Embodiment',
      'Ritual',
      'Creative Exploration',
      'Integration',
      'Closing',
    ],
  },
  {
    id: 'tpl-poetry',
    name: 'Poetry Collection',
    bookType: 'poetry',
    sections: ['Front Matter', 'Part I', 'Interlude', 'Part II', 'Closing'],
  },
  {
    id: 'tpl-essay',
    name: 'Essay / Philosophy',
    bookType: 'essay',
    sections: ['Opening', 'Thesis / Question', 'Exploration', 'Development', 'Integration', 'Conclusion'],
  },
  {
    id: 'tpl-codex',
    name: 'Codex',
    bookType: 'codex',
    sections: ['Concept', 'Symbol', 'Meaning', 'Teaching', 'Practice', 'Reflection'],
  },
  { id: 'tpl-custom', name: 'Custom (empty)', bookType: 'custom', sections: [] },
  {
    id: 'tpl-you-journal',
    name: 'YOU Journal',
    bookType: 'journal',
    sections: [
      'Opening',
      'Orientation',
      'Element',
      'Elemental Teaching',
      'Emotional Landscape',
      'Archetype',
      'Reflection',
      'Journal Prompts',
      'Embodiment',
      'Ritual',
      'Creative Exploration',
      'Integration',
      'Closing',
    ],
  },
];

export const BUILT_IN_FAMILIES: { id: string; name: string; suggested: string[] }[] = [
  { id: 'fam-element', name: 'Element', suggested: ['water', 'fire', 'earth', 'air', 'ether'] },
  {
    id: 'fam-theme',
    name: 'Theme',
    suggested: [
      'surrender',
      'grief',
      'love',
      'death',
      'rebirth',
      'identity',
      'freedom',
      'desire',
      'memory',
      'transformation',
      'loss',
    ],
  },
  {
    id: 'fam-archetype',
    name: 'Archetype',
    suggested: ['seeker', 'alchemist', 'lover', 'shadow', 'wanderer', 'sage', 'child', 'warrior'],
  },
  { id: 'fam-project', name: 'Project', suggested: [] },
  {
    id: 'fam-material',
    name: 'Material',
    suggested: ['poetry', 'poem', 'fragment', 'teaching', 'prompt', 'ritual', 'reflection'],
  },
];

export function suggestedFamilyFor(tagName: string): string | null {
  for (const fam of BUILT_IN_FAMILIES) if (fam.suggested.includes(tagName)) return fam.id;
  return null;
}
