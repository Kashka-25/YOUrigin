import type { Book, BookType, ContentType, ProjectColour, ProjectKind, ProjectStatus, Status } from './types';

/** Order shown in pickers: no colour, then red, amber, green. */
export const STATUSES: Status[] = ['none', 'seed', 'developing', 'polished'];

export const PROJECT_CATEGORIES = ['App', 'Business', 'Creative', 'Place', 'Research', 'Personal', 'Other'] as const;

export const DEFAULT_PROJECT_COLOUR: ProjectColour = 'ochre';

/**
 * Project colours, spread around the wheel so no two read alike, each with a shade per theme:
 * soft and light in light mode (light pinks and reds), deep and rich in dark mode (deep reds).
 * `hex` is the light-mode shade, `dark` the dark-mode one. `onLight` / `onDark` is the text
 * colour that reads at least 4.5:1 on top of each. Dots and swatches carry a faint outline
 * (index.css) so a soft or deep shade never disappears into the page. Keys are what's stored.
 */
export interface ProjectColourOption { value: ProjectColour; label: string; hex: string; dark: string; onLight: string; onDark: string }
export const PROJECT_COLOURS: ProjectColourOption[] = [
  { value: 'rose', label: 'Rose', hex: '#F48FB1', dark: '#D81B60', onLight: '#1A1420', onDark: '#FFFFFF' },
  { value: 'berry', label: 'Berry', hex: '#EF7B7B', dark: '#9E0F2E', onLight: '#1A1420', onDark: '#FFFFFF' },
  { value: 'plum', label: 'Plum', hex: '#CE93D8', dark: '#7A1F5C', onLight: '#1A1420', onDark: '#FFFFFF' },
  { value: 'coral', label: 'Coral', hex: '#FF8A65', dark: '#E64A19', onLight: '#1A1420', onDark: '#1A1420' },
  { value: 'terracotta', label: 'Terracotta', hex: '#D2875F', dark: '#A23B17', onLight: '#1A1420', onDark: '#FFFFFF' },
  { value: 'amber', label: 'Amber', hex: '#FFB74D', dark: '#E08600', onLight: '#1A1420', onDark: '#1A1420' },
  { value: 'ochre', label: 'Ochre', hex: '#E6C14F', dark: '#B8860B', onLight: '#1A1420', onDark: '#1A1420' },
  { value: 'olive', label: 'Olive', hex: '#AFC042', dark: '#6E7D12', onLight: '#1A1420', onDark: '#FFFFFF' },
  { value: 'moss', label: 'Moss', hex: '#66BB6A', dark: '#2E7D32', onLight: '#1A1420', onDark: '#FFFFFF' },
  { value: 'jade', label: 'Jade', hex: '#4DD0A8', dark: '#007D62', onLight: '#1A1420', onDark: '#FFFFFF' },
  { value: 'teal', label: 'Teal', hex: '#4DB6C0', dark: '#00707A', onLight: '#1A1420', onDark: '#FFFFFF' },
  { value: 'sky', label: 'Sky', hex: '#7CC4F5', dark: '#1565C0', onLight: '#1A1420', onDark: '#FFFFFF' },
  { value: 'indigo', label: 'Indigo', hex: '#7986CB', dark: '#283593', onLight: '#1A1420', onDark: '#FFFFFF' },
  { value: 'lavender', label: 'Lavender', hex: '#C3AEEA', dark: '#6A4FB0', onLight: '#1A1420', onDark: '#FFFFFF' },
  { value: 'violet', label: 'Violet', hex: '#A66BD6', dark: '#5E1A9E', onLight: '#1A1420', onDark: '#FFFFFF' },
  { value: 'slate', label: 'Slate', hex: '#9FB0BF', dark: '#455A64', onLight: '#1A1420', onDark: '#FFFFFF' },
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
