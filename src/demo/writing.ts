// Cassidy's own words in the demo: short excerpts from the spoken-word introduction
// to My Living YOUlogy, Cassidy's first concert. Approved word for word by Cassidy
// for the public demo on 22 Nov 2026; only the line breaks and the [Spoken] and
// [Heartbeat] labels (for the script's heartbeat cue) are added. Change nothing here
// without asking Cassidy first.

import type { ContentType, RelationshipKind, Status } from '../domain/types';

export type WritingPiece = {
  key: string;
  title?: string;
  body: string;
  type: ContentType;
  status: Status;
  tags: string[];
  daysAgo: number;
  projects?: string[];
  notes?: string;
};

const FROM = 'From the spoken-word introduction to My Living YOUlogy.';

export const YOULOGY: WritingPiece[] = [
  {
    key: 'yl-wardrobe', title: 'Inner Wardrobe', type: 'poem', status: 'polished', tags: ['growth', 'voice'], daysAgo: 150, projects: ['youlogy'], notes: FROM,
    body: 'The camouflage we once wore becomes clothes within our inner wardrobe, a designer of choice that gives us permission to be all our parts consciously and authentically, centred in our heart.',
  },
  {
    key: 'yl-whysdom', title: 'Whysdom', type: 'fragment', status: 'polished', tags: ['journal', 'growth'], daysAgo: 146, projects: ['youlogy'], notes: FROM,
    body: 'For all the whys we ask give us whysdom…. Just kidding, it gives us wisdom.',
  },
  {
    key: 'yl-forest', title: 'Forest of Dreams', type: 'poem', status: 'polished', tags: ['growth', 'journal'], daysAgo: 140, projects: ['youlogy'], notes: FROM,
    body: `The questions of “why” leads us to planting a forest of seeds.
A forest in which we continue to water and feed
with our love, attention, truth and dreams.`,
  },
  {
    key: 'yl-ships', title: 'Ships', type: 'song', status: 'polished', tags: ['voice', 'growth'], daysAgo: 128, projects: ['youlogy'], notes: `${FROM} Spoken, with the heartbeat rhythm coming in under the last lines.`,
    body: `[Spoken]
In metaphorical terms, each of us are like ships,
sailing through an infinite ocean.
Where all designed differently,
with different hulls, different masts,
different skin and different bones.
Yet at the core of it all, we all serve the same purpose…
To sail these never-ending seas, floating upon its surface.

[Heartbeat]
And when our emotions arise, treat them as your compass,
guiding us in the direction of where our heart lives.`,
  },
  {
    key: 'yl-butterflies', title: 'Carnivorous Butterflies', type: 'poem', status: 'polished', tags: ['voice'], daysAgo: 120, projects: ['youlogy'], notes: FROM,
    body: `I can feel the carnivorous butterflies eating me from the inside.
I know that’s anxiety and excitement all wrapped into one –
after all they’re from the same species
and feel quite similar when they emerge from their chrysalis.`,
  },
  {
    key: 'yl-welcome', title: 'Welcome', type: 'fragment', status: 'polished', tags: ['voice'], daysAgo: 116, projects: ['youlogy'], notes: FROM,
    body: 'So allow me to welcome you all and all your parts to My Living YOUlogy.',
  },
  // Loose in Capture, waiting for a Project.
  {
    key: 'yl-no-book', type: 'fragment', status: 'seed', tags: ['growth'], daysAgo: 3, notes: FROM,
    body: 'There is no book that maps out how we are supposed to be alive.',
  },
];

export const YOULOGY_LINKS: { from: string; to: string; kind: RelationshipKind }[] = [
  { from: 'yl-forest', to: 'yl-whysdom', kind: 'continues' },
  { from: 'yl-ships', to: 'yl-forest', kind: 'continues' },
  { from: 'yl-forest', to: 'ff-7', kind: 'echoes' },
  { from: 'yl-butterflies', to: 'yl-wardrobe', kind: 'echoes' },
  { from: 'yl-welcome', to: 'yl-butterflies', kind: 'continues' },
  { from: 'yl-no-book', to: 'yl-ships', kind: 'related' },
];

/** Earlier drafts of Forest of Dreams (oldest first): its own first lines, before it grew. */
export const YOULOGY_DRAFTS: { key: string; daysAgo: number; title: string; body: string }[] = [
  { key: 'yl-forest', daysAgo: 144, title: 'Forest of seeds', body: 'The questions of “why” leads us to planting a forest of seeds.' },
  {
    key: 'yl-forest', daysAgo: 142, title: 'Forest of Dreams',
    body: `The questions of “why” leads us to planting a forest of seeds.
A forest in which we continue to water and feed`,
  },
];

/** The set list, in the order of the introduction's own parts. */
export const SET_LIST: [string, string[]][] = [
  ['A Journey Through Age', ['yl-wardrobe']],
  ['…and Beyond', ['yl-whysdom', 'yl-forest']],
  ['Facing the Present', ['yl-ships']],
  ['The Mystery of Life', ['yl-butterflies', 'yl-welcome']],
];

export const JOURNEY = {
  /** The poem with drafts and links, for the Lineage plate. */
  poem: 'yl-forest',
  /** The piece shown in Lyric view. */
  song: 'yl-ships',
};
