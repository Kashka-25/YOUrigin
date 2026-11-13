import type { Book, BookType, ContentType, ProjectColour, ProjectKind, ProjectStatus, Status } from './types';

/** Order shown in pickers: no colour, then red, amber, green. */
export const STATUSES: Status[] = ['none', 'seed', 'developing', 'polished'];

export const PROJECT_CATEGORIES = ['App', 'Business', 'Creative', 'Place', 'Research', 'Personal', 'Other'] as const;

export const DEFAULT_PROJECT_COLOUR: ProjectColour = 'ochre';

/**
 * Project colours, spread around the wheel so no two read alike, each with a shade per theme.
 * `hex` is the light-mode shade (also used for print), `dark` the dark-mode one. Both stand out
 * at least 3:1 from every background of that theme's colour scale (Bark to Moss, Void to Aurora), and `onLight` / `onDark` is the text colour that reads at
 * least 4.5:1 on top of each. The keys are what's stored on a Project; only shades changed.
 */
export interface ProjectColourOption { value: ProjectColour; label: string; hex: string; dark: string; onLight: string; onDark: string }
export const PROJECT_COLOURS: ProjectColourOption[] = [
  { value: 'rose', label: 'Rose', hex: '#A71569', dark: '#F48FB1', onLight: '#FFFFFF', onDark: '#1A1420' },
  { value: 'berry', label: 'Berry', hex: '#7E0A2E', dark: '#E8457E', onLight: '#FFFFFF', onDark: '#1A1420' },
  { value: 'plum', label: 'Plum', hex: '#6D2A5E', dark: '#C77DB4', onLight: '#FFFFFF', onDark: '#1A1420' },
  { value: 'coral', label: 'Coral', hex: '#9C340A', dark: '#FF9A76', onLight: '#FFFFFF', onDark: '#1A1420' },
  { value: 'terracotta', label: 'Terracotta', hex: '#6E2A14', dark: '#C1512A', onLight: '#FFFFFF', onDark: '#FFFFFF' },
  { value: 'amber', label: 'Amber', hex: '#834C07', dark: '#FFB547', onLight: '#FFFFFF', onDark: '#1A1420' },
  { value: 'ochre', label: 'Ochre', hex: '#6B5408', dark: '#E2C04A', onLight: '#FFFFFF', onDark: '#1A1420' },
  { value: 'olive', label: 'Olive', hex: '#505B0D', dark: '#B9C94A', onLight: '#FFFFFF', onDark: '#1A1420' },
  { value: 'moss', label: 'Moss', hex: '#256324', dark: '#78C86C', onLight: '#FFFFFF', onDark: '#1A1420' },
  { value: 'jade', label: 'Jade', hex: '#09634A', dark: '#3FD6A6', onLight: '#FFFFFF', onDark: '#1A1420' },
  { value: 'teal', label: 'Teal', hex: '#0A616A', dark: '#3BB8C4', onLight: '#FFFFFF', onDark: '#1A1420' },
  { value: 'sky', label: 'Sky', hex: '#165D8E', dark: '#7CC8F8', onLight: '#FFFFFF', onDark: '#1A1420' },
  { value: 'indigo', label: 'Indigo', hex: '#24308F', dark: '#8D9CF0', onLight: '#FFFFFF', onDark: '#1A1420' },
  { value: 'lavender', label: 'Lavender', hex: '#6D469B', dark: '#C9B6F0', onLight: '#FFFFFF', onDark: '#1A1420' },
  { value: 'violet', label: 'Violet', hex: '#6A2DB8', dark: '#A97BF0', onLight: '#FFFFFF', onDark: '#1A1420' },
  { value: 'slate', label: 'Slate', hex: '#4B5A6B', dark: '#A3B2C2', onLight: '#FFFFFF', onDark: '#1A1420' },
];

/** The colour option for a Project (falling back to the default). */
export function projectColourOption(colour?: ProjectColour): ProjectColourOption {
  return PROJECT_COLOURS.find((c) => c.value === colour) ?? PROJECT_COLOURS.find((c) => c.value === DEFAULT_PROJECT_COLOUR)!;
}

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
