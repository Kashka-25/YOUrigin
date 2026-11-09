// The demo's example creator. Everything here is invented for the demo: the person,
// their projects and every line of writing. Nothing describes Cassidy or anyone real.
// Written only into the demo database (see ./mode.ts).

import { db } from '../db/db';
import { createMany } from '../db/content';
import { addToBook, createBook } from '../db/books';
import { createCollection, linkContent } from '../db/collections';
import { addItemsToProject, createProject } from '../db/projectRecords';
import { setSetting } from '../db/settings';
import type { ContentType, ProjectColour, ProjectStatus, RelationshipKind, Status } from '../domain/types';

export const EXAMPLE_CREATOR = 'Juno Tidewell';
export const EXAMPLE_LINE = 'An example creator, invented for this demo';

const DAY = 86_400_000;

type Piece = { key: string; title?: string; body: string; type: ContentType; status: Status; tags: string[]; daysAgo: number; project?: string };

const PROJECTS: { key: string; title: string; description: string; category: string; colour: ProjectColour; status: ProjectStatus }[] = [
  { key: 'saltglass', title: 'Saltglass Poems', description: 'A first collection of sea poems, written on the night ferry.', category: 'Creative', colour: 'teal', status: 'building' },
  { key: 'lamplighters', title: 'The Lamplighters', description: 'A four-piece folk band: songs, an album in progress and a gig set list.', category: 'Creative', colour: 'rose', status: 'building' },
  { key: 'kite', title: 'Paper Kite Studio', description: 'An idea for a small app that turns morning notes into a weekly zine.', category: 'App', colour: 'sky', status: 'idea' },
  { key: 'almanac', title: 'Garden Almanac', description: 'Notes from a year of growing herbs on a windy balcony.', category: 'Research', colour: 'olive', status: 'resting' },
];

const PIECES: Piece[] = [
  // Saltglass Poems
  { key: 'ferry-note', body: 'The ferry horn sounds like someone clearing their throat before a long story.', type: 'fragment', status: 'seed', tags: ['sea', 'night'], daysAgo: 290, project: 'saltglass' },
  {
    key: 'saltglass', title: 'Saltglass', body: `Every bottle the sea gives back
comes softened, frosted, unsure of its colour,
as if it had forgotten what it held
and decided that was a kind of freedom.`,
    type: 'poem', status: 'polished', tags: ['sea', 'memory'], daysAgo: 260, project: 'saltglass',
  },
  {
    key: 'saltglass-2', title: 'Saltglass (second take)', body: `What the tide returns is never the bottle.
It is the bottle's patience,
worn to a pale green question
that fits in the palm.`,
    type: 'poem', status: 'developing', tags: ['sea', 'memory'], daysAgo: 230, project: 'saltglass',
  },
  {
    key: 'night-ferry', title: 'Night Ferry', body: `We cross in the dark with our coats on,
the lights of two towns trading places,
and nobody says the word home
in case it changes its mind.`,
    type: 'poem', status: 'polished', tags: ['night', 'home', 'sea'], daysAgo: 200, project: 'saltglass',
  },
  {
    key: 'lighthouse', title: 'Keeper', body: `The lighthouse keeps its one sentence
and says it all night, patiently,
to ships that never answer.`,
    type: 'poem', status: 'developing', tags: ['light', 'night'], daysAgo: 120, project: 'saltglass',
  },
  { key: 'gulls', body: 'Gulls arguing over a chip like a committee that has lost the minutes.', type: 'fragment', status: 'seed', tags: ['sea'], daysAgo: 40, project: 'saltglass' },

  // The Lamplighters
  {
    key: 'harbour-song', title: 'Harbour Lights', body: `[Verse 1]
Down where the harbour lights are low
The fishing boats come in slow
I kept a lantern by the door
For someone walking home

[Chorus]
Hold the light, hold the light
Somebody's out there late tonight
Hold the light, hold it high
Till they're home and dry`,
    type: 'song', status: 'polished', tags: ['light', 'home'], daysAgo: 180, project: 'lamplighters',
  },
  {
    key: 'ferry-song', title: 'Ferry at Midnight', body: `[Verse 1]
Ticket in my pocket and the deck is cold
Every crossing makes the leaving old

[Chorus]
Midnight ferry, carry me slow
Over the water where the lanterns go`,
    type: 'song', status: 'developing', tags: ['night', 'sea'], daysAgo: 150, project: 'lamplighters',
  },
  {
    key: 'kitchen-song', title: 'Kitchen Table Waltz', body: `[Verse 1]
Three chairs and a candle and a kettle on
We danced in the kitchen till the night was gone

[Chorus]
One, two, three, round the table we go
Nobody watching, nobody knows`,
    type: 'song', status: 'polished', tags: ['home'], daysAgo: 95, project: 'lamplighters',
  },
  { key: 'chorus-idea', title: 'Chorus idea', body: 'A call-and-response chorus where the crowd sings the lighthouse part.', type: 'idea', status: 'seed', tags: ['light'], daysAgo: 20, project: 'lamplighters' },

  // Paper Kite Studio
  { key: 'kite-idea', title: 'The weekly zine', body: 'Every Sunday, gather the week\'s morning notes into eight folded pages you can print and post.', type: 'idea', status: 'seed', tags: ['making'], daysAgo: 70, project: 'kite' },
  { key: 'kite-research', title: 'How people keep notebooks', body: 'Asked five friends how they keep notes. Four start strong in January. All of them keep the first page blank.', type: 'research', status: 'developing', tags: ['making'], daysAgo: 55, project: 'kite' },

  // Garden Almanac
  { key: 'basil', title: 'Basil, week three', body: 'The basil leans toward the kitchen window like it wants to hear the radio.', type: 'note', status: 'seed', tags: ['garden'], daysAgo: 240, project: 'almanac' },
  { key: 'wind', title: 'Wind log', body: 'Balcony wind strongest at four in the afternoon. Moved the rosemary behind the chair.', type: 'research', status: 'seed', tags: ['garden'], daysAgo: 210, project: 'almanac' },

  // Loose, not yet in a Project
  { key: 'loose-1', body: 'Write something about the way streetlights come on one at a time, as if checking with each other.', type: 'prompt', status: 'seed', tags: ['light'], daysAgo: 6 },
  { key: 'loose-2', body: 'Home is the place where the kettle already knows how you take it.', type: 'fragment', status: 'seed', tags: ['home'], daysAgo: 2 },
];

const LINKS: { from: string; to: string; kind: RelationshipKind }[] = [
  { from: 'saltglass', to: 'ferry-note', kind: 'continues' },
  { from: 'saltglass-2', to: 'saltglass', kind: 'variant' },
  { from: 'night-ferry', to: 'saltglass', kind: 'continues' },
  { from: 'ferry-song', to: 'night-ferry', kind: 'continues' },
  { from: 'harbour-song', to: 'lighthouse', kind: 'echoes' },
  { from: 'chorus-idea', to: 'harbour-song', kind: 'continues' },
];

/** Fills the (empty) demo library with the example creator's work. */
export async function seedExampleCreator(now = Date.now()): Promise<void> {
  const projectIds = new Map<string, string>();
  for (const p of PROJECTS) projectIds.set(p.key, await createProject(p));

  const ids = await createMany(PIECES.map((p) => ({ title: p.title, body: p.body, type: p.type, status: p.status, tagNames: p.tags, source: { kind: 'sample' as const } })));
  const byKey = new Map(PIECES.map((p, i) => [p.key, ids[i]]));
  // Spread the writing over the past months, so the timeline has a shape.
  await db.transaction('rw', db.content, async () => {
    for (const p of PIECES) {
      const at = now - p.daysAgo * DAY;
      await db.content.update(byKey.get(p.key)!, { createdAt: at, updatedAt: at });
    }
  });
  for (const proj of PROJECTS) {
    const members = PIECES.filter((p) => p.project === proj.key).map((p) => byKey.get(p.key)!);
    if (members.length) await addItemsToProject(projectIds.get(proj.key)!, members);
  }
  for (const l of LINKS) await linkContent(byKey.get(l.from)!, byKey.get(l.to)!, l.kind);

  // Works: a poetry book, an album and a gig set list.
  const book = await createBook({ title: 'Saltglass', subtitle: 'Poems from the night ferry', templateId: 'tpl-poetry', projectIds: [projectIds.get('saltglass')!], author: EXAMPLE_CREATOR });
  const bookSection = (await db.sections.where('bookId').equals(book).sortBy('order'))[0]?.id ?? null;
  await addToBook(book, ['saltglass', 'night-ferry', 'lighthouse'].map((k) => byKey.get(k)!), bookSection);

  const album = await createBook({ title: 'Night Ferry', templateId: null, kind: 'album', shelf: 'Music', projectIds: [projectIds.get('lamplighters')!] });
  const albumSection = (await db.sections.where('bookId').equals(album).first())?.id ?? null;
  await addToBook(album, ['harbour-song', 'ferry-song', 'kitchen-song'].map((k) => byKey.get(k)!), albumSection);

  const gig = await createBook({ title: 'Friday at the Harbour Hall', templateId: null, kind: 'setlist', shelf: 'Music', projectIds: [projectIds.get('lamplighters')!] });
  const gigSection = (await db.sections.where('bookId').equals(gig).first())?.id ?? null;
  await addToBook(gig, ['kitchen-song', 'ferry-song', 'harbour-song'].map((k) => byKey.get(k)!), gigSection);

  await createCollection('Favourite lines', ['ferry-note', 'gulls', 'loose-2'].map((k) => byKey.get(k)!), 'Small things worth keeping.');
  await setSetting('onboarded', true);
}
