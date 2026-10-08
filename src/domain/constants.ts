import type { BookType, ContentType, Status } from './types';

export const STATUSES: Status[] = ['seed', 'developing', 'polished'];

export const STATUS_META: Record<
  Status,
  { label: string; colour: string; symbol: string; meaning: string }
> = {
  seed: {
    label: 'Seed',
    colour: 'seed',
    symbol: '●',
    meaning: 'Something alive here that has not grown yet.',
  },
  developing: {
    label: 'Developing',
    colour: 'developing',
    symbol: '◐',
    meaning: 'The core is there; it is still being shaped.',
  },
  polished: {
    label: 'Polished',
    colour: 'polished',
    symbol: '◆',
    meaning: 'Essentially finished, or close enough to share.',
  },
};

export const CONTENT_TYPES: ContentType[] = [
  'poem',
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
