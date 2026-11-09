// The demo's example creator. Everything here is invented for the demo: the person,
// their projects, every line of writing and every picture. Nothing describes Cassidy
// or anyone real. Written only into the demo database (see ./mode.ts), from the same
// fixed content every time; dates are counted back from the moment the demo starts.

import { db } from '../db/db';
import { createMany } from '../db/content';
import { addSection, addToBook, createBook } from '../db/books';
import { createCollection, linkContent } from '../db/collections';
import { addItemsToProject, createProject } from '../db/projectRecords';
import { ensureTags, setTagFamily } from '../db/tags';
import { setSetting } from '../db/settings';
import { createPortfolio, updatePortfolio } from '../db/portfolios';
import { headingItem, itemFromPiece, itemFromProject, itemFromWork } from '../portfolio/model';
import { newId } from '../domain/text';
import type { ContentItem, ContentType, ProjectColour, ProjectStatus, RelationshipKind, Status } from '../domain/types';
import { demoPicture, type DemoPicture } from './art';

export const EXAMPLE_CREATOR = 'Juno Tidewell';
export const EXAMPLE_LINE = 'Poet and songwriter · an example creator, invented for this demo';

const DAY = 86_400_000;

type Piece = {
  key: string;
  title?: string;
  body: string;
  type: ContentType;
  status: Status;
  tags: string[];
  daysAgo: number;
  projects?: string[];
  notes?: string;
  /** For pictures. */
  art?: DemoPicture;
  artMedium?: string;
};

type ProjectDef = { key: string; title: string; description: string; category: string; colour: ProjectColour; status: ProjectStatus; cover: DemoPicture; daysAgo: number };

const PROJECTS: ProjectDef[] = [
  {
    key: 'saltglass', title: 'Saltglass Poems', category: 'Writing', colour: 'teal', status: 'building', daysAgo: 300,
    description: 'A first collection of sea poems, mostly written on the night ferry between the two towns. Now shaping into a book in two parts.',
    cover: demoPicture('waves', '#123a46', '#0b1d26', '#d6ad6d'),
  },
  {
    key: 'lamplighters', title: 'The Lamplighters', category: 'Music', colour: 'rose', status: 'building', daysAgo: 240,
    description: 'A four-piece folk band: songs in progress, the debut album and the set list for Friday’s gig.',
    cover: demoPicture('notes', '#4a1f2c', '#1f0e16', '#f0b58a'),
  },
  {
    key: 'lantern-walk', title: 'Lantern Walk Zine', category: 'Writing', colour: 'amber', status: 'complete', daysAgo: 200,
    description: 'A small finished zine: five pieces written along the old lamplighter’s route through town, printed for the autumn walk.',
    cover: demoPicture('lantern', '#3b2a12', '#170f06', '#f2c46d'),
  },
  {
    key: 'circle', title: 'Thursday Writing Circle', category: 'Teaching', colour: 'lavender', status: 'building', daysAgo: 150,
    description: 'Prompts, short teachings and notes from the weekly writing circle in the library’s back room.',
    cover: demoPicture('circle', '#2b2343', '#120e1e', '#c9b3ef'),
  },
  {
    key: 'kite', title: 'Paper Kite Studio', category: 'App', colour: 'sky', status: 'idea', daysAgo: 80,
    description: 'An idea for a small app that turns a week of morning notes into an eight-page zine you can fold and post.',
    cover: demoPicture('kite', '#1d3a52', '#0c1a26', '#9fd0f0'),
  },
  {
    key: 'almanac', title: 'Garden Almanac', category: 'Research', colour: 'olive', status: 'resting', daysAgo: 270,
    description: 'Notes from a year of growing herbs on a windy balcony. Resting until spring.',
    cover: demoPicture('leaf', '#2e3a1d', '#11170a', '#c6d18a'),
  },
];

const PIECES: Piece[] = [
  // ---- Saltglass Poems -------------------------------------------------------------
  { key: 'ferry-note', body: 'The ferry horn sounds like someone clearing their throat before a long story.', type: 'fragment', status: 'seed', tags: ['sea', 'night', 'ferry'], daysAgo: 296, projects: ['saltglass'] },
  {
    key: 'saltglass', title: 'Saltglass', type: 'poem', status: 'polished', tags: ['sea', 'memory'], daysAgo: 281, projects: ['saltglass'],
    notes: 'Third version. Cut the stanza about the lighthouse: it belongs in Keeper.',
    body: `Every bottle the sea gives back
comes softened, frosted, unsure of its colour,
as if it had forgotten what it held
and decided that was a kind of freedom.

I keep the green ones on the sill.
In the morning they hold a little of the light
the way a shell holds a little of the sea:
not the thing itself, but the shape of it.`,
  },
  {
    key: 'saltglass-2', title: 'Saltglass (second take)', type: 'poem', status: 'developing', tags: ['sea', 'memory'], daysAgo: 262, projects: ['saltglass'],
    notes: 'Trying it shorter. Not sure yet which one goes in the book.',
    body: `What the tide returns is never the bottle.
It is the bottle’s patience,
worn to a pale green question
that fits in the palm.`,
  },
  {
    key: 'night-ferry', title: 'Night Ferry', type: 'poem', status: 'polished', tags: ['night', 'home', 'sea', 'ferry'], daysAgo: 238, projects: ['saltglass'],
    body: `We cross in the dark with our coats on,
the lights of two towns trading places,
and nobody says the word home
in case it changes its mind.

A child asleep across three seats.
A man reading the safety card
as if it might end differently.
The engine’s long vowel underneath everything.`,
  },
  {
    key: 'tide-tables', title: 'Tide Tables', type: 'poem', status: 'polished', tags: ['sea', 'time'], daysAgo: 214, projects: ['saltglass'],
    body: `My grandmother’s kitchen had a tide table
pinned beside the calendar,
two kinds of time on one wall:
the days we promised,
and the hours the water kept.`,
  },
  {
    key: 'keeper', title: 'Keeper', type: 'poem', status: 'developing', tags: ['light', 'night'], daysAgo: 176, projects: ['saltglass'],
    body: `The lighthouse keeps its one sentence
and says it all night, patiently,
to ships that never answer.

Some nights I think that is all faith is:
saying the same bright thing
into the dark, on time.`,
  },
  {
    key: 'inventory', title: 'Inventory of a Beach', type: 'poem', status: 'developing', tags: ['sea', 'lists'], daysAgo: 131, projects: ['saltglass'],
    body: `One blue rope, frayed to feathers.
A gull’s argument, unresolved.
Forty-one footprints, mostly mine.
A shoe with no story it will tell.
The light, again, insisting.`,
  },
  { key: 'gulls', body: 'Gulls arguing over a chip like a committee that has lost the minutes.', type: 'fragment', status: 'seed', tags: ['sea', 'funny'], daysAgo: 96, projects: ['saltglass'] },
  {
    key: 'bottle-letter', title: 'Letter Found in a Bottle', type: 'poem', status: 'seed', tags: ['sea', 'memory'], daysAgo: 41, projects: ['saltglass'],
    body: `Whoever you are,
the ink has run but the hope hasn’t.
I wrote this on the last day of a summer
I wanted someone, anyone, to know about.`,
  },
  {
    key: 'why-sea', title: 'Why the sea keeps showing up', type: 'reflection', status: 'developing', tags: ['sea', 'craft'], daysAgo: 60, projects: ['saltglass'],
    body: 'Every poem I start somewhere else ends up at the water. Maybe it is the only thing I know that leaves and comes back on a timetable. The book should admit that rather than hide it.',
  },
  {
    key: 'book-order', title: 'Order of the book', type: 'note', status: 'developing', tags: ['craft'], daysAgo: 22, projects: ['saltglass'],
    body: 'Part I: leaving (Saltglass, Tide Tables, Night Ferry). Interlude: Inventory of a Beach. Part II: the light (Keeper and the newer ones). End on something quiet.',
  },
  {
    key: 'dedication', title: 'Dedication', type: 'other', status: 'polished', tags: [], daysAgo: 20, projects: ['saltglass'],
    body: 'For everyone on the last crossing.',
  },

  // ---- The Lamplighters -----------------------------------------------------------------
  {
    key: 'harbour-song', title: 'Harbour Lights', type: 'song', status: 'polished', tags: ['light', 'home'], daysAgo: 228, projects: ['lamplighters'],
    notes: 'Capo 2. Mara takes the second verse.',
    body: `[Verse 1]
Down where the harbour lights are low
The fishing boats come in slow
I kept a lantern by the door
For someone walking home

[Chorus]
Hold the light, hold the light
Somebody's out there late tonight
Hold the light, hold it high
Till they're home and dry

[Verse 2]
The kettle's on, the window's bright
The tide is turning with the night
Whoever you are, whatever you've done
There's a chair here, come on home`,
  },
  {
    key: 'ferry-song', title: 'Ferry at Midnight', type: 'song', status: 'developing', tags: ['night', 'sea', 'ferry'], daysAgo: 205, projects: ['lamplighters'],
    body: `[Verse 1]
Ticket in my pocket and the deck is cold
Every crossing makes the leaving old
Lights of the old town falling behind
The new town waiting on the other side

[Chorus]
Midnight ferry, carry me slow
Over the water where the lanterns go`,
  },
  {
    key: 'kitchen-song', title: 'Kitchen Table Waltz', type: 'song', status: 'polished', tags: ['home', 'dance'], daysAgo: 168, projects: ['lamplighters'],
    body: `[Verse 1]
Three chairs and a candle and a kettle on
We danced in the kitchen till the night was gone

[Chorus]
One, two, three, round the table we go
Nobody watching, nobody knows

[Verse 2]
The radio crackled an old sweet tune
We waltzed past the sink and the silver spoon`,
  },
  {
    key: 'rope-song', title: 'Rope and Anchor', type: 'song', status: 'developing', tags: ['sea', 'love'], daysAgo: 122, projects: ['lamplighters'],
    body: `[Verse 1]
You were the rope and I was the anchor
Holding us both through the worst of the weather

[Chorus]
Pull me in, let me go
Only the sea and the two of us know`,
  },
  {
    key: 'hymn', title: 'Lighthouse Hymn', type: 'song', status: 'polished', tags: ['light', 'night'], daysAgo: 88, projects: ['lamplighters'],
    notes: 'Encore. Everyone sings the last chorus unaccompanied.',
    body: `[Verse 1]
Over the rocks where the long waves break
A light keeps watch for the sailors' sake

[Chorus]
Shine, little light, on the water wide
Bring every boat to the harbour side`,
  },
  {
    key: 'last-bus', title: 'Last Bus Home', type: 'song', status: 'seed', tags: ['night', 'home'], daysAgo: 35, projects: ['lamplighters'],
    body: `[Verse 1]
Top deck, front seat, the town asleep below
Every streetlight a friend I used to know`,
  },
  { key: 'chorus-idea', title: 'Chorus idea', body: 'A call-and-response chorus where the crowd sings the lighthouse part back to us.', type: 'idea', status: 'seed', tags: ['light'], daysAgo: 52, projects: ['lamplighters'] },
  {
    key: 'rehearsal', title: 'Rehearsal notes', type: 'note', status: 'developing', tags: ['band'], daysAgo: 12, projects: ['lamplighters'],
    body: 'Kitchen Table Waltz is tighter at a slower tempo. Ferry at Midnight needs a bridge before the gig. Open the second set quietly; save Harbour Lights for the end.',
  },

  // ---- Lantern Walk Zine (finished) -----------------------------------------------------
  {
    key: 'lantern-walk', title: 'Lantern Walk', type: 'poem', status: 'polished', tags: ['light', 'town'], daysAgo: 196, projects: ['lantern-walk'],
    body: `They lit the street one lamp at a time,
a man with a pole and a patience,
and every window learned his name
by the small gold he left behind.`,
  },
  {
    key: 'street-by-street', title: 'Street by Street', type: 'poem', status: 'polished', tags: ['town', 'memory'], daysAgo: 190, projects: ['lantern-walk'],
    body: `Chapel Row, where the bakery was.
Rope Lane, steep as a rumour.
Quay Street, where the cobbles keep
the shape of every cart that ever came home.`,
  },
  {
    key: 'rounds', title: 'The Lamplighter’s Rounds', type: 'poem', status: 'polished', tags: ['light', 'town', 'time'], daysAgo: 184, projects: ['lantern-walk'],
    body: `Forty lamps, and the last one by the sea,
lit as the first one went pale with morning:
a whole life spent arriving
just as the dark gave up.`,
  },
  {
    key: 'after-lanterns', title: 'After the Lanterns', type: 'reflection', status: 'polished', tags: ['town', 'craft'], daysAgo: 171, projects: ['lantern-walk'],
    body: 'Forty people came on the walk. Someone’s grandfather remembered the real lamplighter, and told us he whistled. I wish I had known that before I wrote the poems; I would have let him whistle.',
  },
  {
    key: 'walk-map', title: 'Map of the Walk', type: 'image', status: 'polished', tags: ['town'], daysAgo: 186, projects: ['lantern-walk'],
    body: 'The four stops of the lantern walk, drawn for the back page of the zine.',
    art: demoPicture('map', '#3b2a12', '#170f06', '#f2c46d'), artMedium: 'Ink and gold pen',
  },

  // ---- Thursday Writing Circle ---------------------------------------------------------
  { key: 'prompt-room', title: 'The room at seven', body: 'Write the room you slept in when you were seven. Start with something on the floor.', type: 'prompt', status: 'polished', tags: ['prompts', 'memory'], daysAgo: 148, projects: ['circle'] },
  { key: 'prompt-tide', title: 'What the tide returned', body: 'Make a list of ten things the tide could bring back. Let the last one be impossible.', type: 'prompt', status: 'polished', tags: ['prompts', 'sea', 'lists'], daysAgo: 133, projects: ['circle'] },
  {
    key: 'teach-breath', title: 'Line breaks as breath', type: 'teaching', status: 'developing', tags: ['craft'], daysAgo: 119, projects: ['circle'],
    body: 'Read the poem aloud and break the line where you need to breathe, not where the sentence ends. Then try the opposite, and notice what changes.',
  },
  {
    key: 'teach-object', title: 'Start with an object', type: 'teaching', status: 'polished', tags: ['craft'], daysAgo: 104, projects: ['circle'],
    body: 'Bring something small that fits in your hand. Describe it for five minutes without saying what it is used for. Feelings arrive by themselves.',
  },
  { key: 'ritual', title: 'Five-minute opening', body: 'Pens down. Name one thing you noticed on the way here. Pens up. Write for five minutes without stopping, then underline one line.', type: 'ritual', status: 'polished', tags: ['prompts'], daysAgo: 99, projects: ['circle'] },
  {
    key: 'week-six', title: 'Notes after week six', type: 'reflection', status: 'seed', tags: ['craft'], daysAgo: 30, projects: ['circle'],
    body: 'The quiet ones write the longest. Next term: fewer prompts, longer silences, and a reading on the last night.',
  },

  // ---- Paper Kite Studio -----------------------------------------------------------------
  { key: 'kite-idea', title: 'The weekly zine', body: 'Every Sunday, gather the week’s morning notes into eight folded pages you can print and post to a friend.', type: 'idea', status: 'seed', tags: ['making'], daysAgo: 78, projects: ['kite'] },
  { key: 'kite-research', title: 'How people keep notebooks', body: 'Asked five friends how they keep notes. Four start strong in January. All of them leave the first page blank, in case.', type: 'research', status: 'developing', tags: ['making'], daysAgo: 66, projects: ['kite'] },
  {
    key: 'kite-fold', title: 'Fold pattern sketch', type: 'image', status: 'developing', tags: ['making'], daysAgo: 58, projects: ['kite'],
    body: 'One sheet, one cut, eight pages.',
    art: demoPicture('kite', '#1d3a52', '#0c1a26', '#9fd0f0'), artMedium: 'Pencil, scanned',
  },
  { key: 'kite-names', title: 'Name ideas', body: 'Paper Kite. Sunday Fold. Pocket Week. (Paper Kite still feels right: something small you let go of.)', type: 'note', status: 'seed', tags: ['making'], daysAgo: 47, projects: ['kite'] },

  // ---- Garden Almanac (resting) -----------------------------------------------------------
  { key: 'basil', title: 'Basil, week three', body: 'The basil leans toward the kitchen window like it wants to hear the radio.', type: 'note', status: 'seed', tags: ['garden'], daysAgo: 268, projects: ['almanac'] },
  { key: 'wind', title: 'Wind log', body: 'Balcony wind strongest around four in the afternoon. Moved the rosemary behind the chair; it sulked for a week and then forgave me.', type: 'research', status: 'developing', tags: ['garden'], daysAgo: 252, projects: ['almanac'] },
  { key: 'mint', title: 'Mint escapes', body: 'The mint has climbed out of its pot and into the thyme. There is a lesson here about borders that I am choosing to ignore.', type: 'note', status: 'seed', tags: ['garden', 'funny'], daysAgo: 233, projects: ['almanac'] },
  {
    key: 'rosemary', title: 'Rosemary', type: 'poem', status: 'developing', tags: ['garden', 'memory'], daysAgo: 220, projects: ['almanac', 'saltglass'],
    body: `Rosemary for remembering, they say,
so I keep it by the door
and brush it with my sleeve each morning,
and carry a little of the remembering out.`,
  },

  // ---- Loose: not yet in a Project --------------------------------------------------------
  { key: 'overheard', body: 'Overheard on the ferry: “You don’t cross water to get somewhere. You cross it to stop being where you were.”', type: 'fragment', status: 'seed', tags: ['ferry'], daysAgo: 9 },
  { key: 'loose-streetlights', body: 'Write about the way streetlights come on one at a time, as if checking with each other first.', type: 'prompt', status: 'seed', tags: ['light'], daysAgo: 6 },
  { key: 'lighthouse-voice', title: 'A song in the lighthouse’s voice', body: 'What if the lighthouse sang back? Lonely, proud, a bit funny about the gulls. Could close the second set.', type: 'idea', status: 'seed', tags: ['light'], daysAgo: 4 },
  { key: 'kettle', body: 'Home is the place where the kettle already knows how you take it.', type: 'fragment', status: 'seed', tags: ['home'], daysAgo: 2 },
  {
    key: 'harbour-sketch', title: 'Harbour at dusk', type: 'image', status: 'developing', tags: ['sea', 'light'], daysAgo: 14,
    body: 'Quick sketch from the sea wall before rehearsal.',
    art: demoPicture('harbour', '#3a3350', '#141020', '#f2c46d'), artMedium: 'Gouache',
  },
];

const LINKS: { from: string; to: string; kind: RelationshipKind }[] = [
  { from: 'saltglass', to: 'ferry-note', kind: 'continues' },
  { from: 'saltglass-2', to: 'saltglass', kind: 'variant' },
  { from: 'night-ferry', to: 'ferry-note', kind: 'continues' },
  { from: 'ferry-song', to: 'night-ferry', kind: 'continues' },
  { from: 'keeper', to: 'saltglass', kind: 'continues' },
  { from: 'harbour-song', to: 'keeper', kind: 'echoes' },
  { from: 'hymn', to: 'keeper', kind: 'continues' },
  { from: 'chorus-idea', to: 'hymn', kind: 'continues' },
  { from: 'inventory', to: 'prompt-tide', kind: 'continues' },
  { from: 'bottle-letter', to: 'inventory', kind: 'continues' },
  { from: 'rounds', to: 'lantern-walk', kind: 'continues' },
  { from: 'walk-map', to: 'street-by-street', kind: 'idea' },
  { from: 'kite-fold', to: 'kite-idea', kind: 'idea' },
  { from: 'harbour-sketch', to: 'harbour-song', kind: 'idea' },
  { from: 'tide-tables', to: 'rosemary', kind: 'echoes' },
  { from: 'lighthouse-voice', to: 'keeper', kind: 'related' },
];

/** Earlier drafts, so version history has something to show. Oldest first. */
const DRAFTS: { key: string; daysAgo: number; title: string; body: string }[] = [
  {
    key: 'saltglass', daysAgo: 288, title: 'Sea glass',
    body: `Every bottle the sea gives back
comes softened, frosted, unsure of its colour.`,
  },
  {
    key: 'saltglass', daysAgo: 284, title: 'Saltglass',
    body: `Every bottle the sea gives back
comes softened, frosted, unsure of its colour,
as if it had forgotten what it held.

The lighthouse turns its one slow thought
over and over the bay.`,
  },
  {
    key: 'night-ferry', daysAgo: 240, title: 'Night crossing',
    body: `We cross in the dark with our coats on
and nobody says the word home.`,
  },
];

export interface DemoJourney {
  project: string;
  book: string;
  song: string;
  setlist: string;
  portfolio: string;
}

const JOURNEY_KEY = 'demoJourney';

export async function demoJourney(): Promise<DemoJourney | null> {
  return ((await db.settings.get(JOURNEY_KEY))?.value as DemoJourney | undefined) ?? null;
}

/** Fills the (empty) demo library with the example creator's world. */
export async function seedExampleCreator(now = Date.now()): Promise<void> {
  const at = (daysAgo: number) => now - daysAgo * DAY;
  const picture = async (p: DemoPicture, name: string, daysAgo: number) => {
    const id = newId();
    await db.assets.add({ id, name, mime: 'image/svg+xml', dataUrl: p.dataUrl, width: p.width, height: p.height, bytes: p.dataUrl.length, createdAt: at(daysAgo), updatedAt: at(daysAgo) });
    return id;
  };

  // Projects, each with its cover.
  const project = new Map<string, string>();
  for (const p of PROJECTS) {
    const id = await createProject({ title: p.title, description: p.description, category: p.category, colour: p.colour, status: p.status });
    await db.projects.update(id, { coverAssetId: await picture(p.cover, `${p.title} cover`, p.daysAgo), createdAt: at(p.daysAgo), updatedAt: at(Math.min(...PIECES.filter((x) => x.projects?.includes(p.key)).map((x) => x.daysAgo))) });
    project.set(p.key, id);
  }

  // The writing (and pictures), back-dated across the months.
  const ids = await createMany(PIECES.map((p) => ({ title: p.title, body: p.body, type: p.type, status: p.status, tagNames: p.tags, notes: p.notes, source: { kind: 'sample' as const } })));
  const piece = new Map(PIECES.map((p, i) => [p.key, ids[i]]));
  for (const p of PIECES) {
    const patch: Partial<ContentItem> = { createdAt: at(p.daysAgo), updatedAt: at(Math.max(0, p.daysAgo - (p.status === 'polished' ? 6 : 1))) };
    if (p.art) {
      patch.assetId = await picture(p.art, p.title ?? 'Picture', p.daysAgo);
      patch.art = { medium: p.artMedium, madeOn: new Date(at(p.daysAgo)).toISOString().slice(0, 10) };
    }
    await db.content.update(piece.get(p.key)!, patch);
  }
  // Linking pieces to Projects and Works stamps them as just updated; the true times go back on at the end.
  const pieceTimes = PIECES.map((p) => ({ id: piece.get(p.key)!, createdAt: at(p.daysAgo), updatedAt: at(Math.max(0, p.daysAgo - (p.status === 'polished' ? 6 : 1))) }));
  const workTimes: { id: string; createdAt: number; updatedAt: number }[] = [];
  let gigProject = '';
  for (const p of PROJECTS) {
    const members = PIECES.filter((x) => x.projects?.includes(p.key)).map((x) => piece.get(x.key)!);
    await addItemsToProject(project.get(p.key)!, members);
  }

  for (const l of LINKS) await linkContent(piece.get(l.from)!, piece.get(l.to)!, l.kind);
  const linkTimes = await db.relationships.toArray();
  for (const r of linkTimes) {
    const t = Math.max((await db.content.get(r.fromId))!.createdAt, (await db.content.get(r.toId))!.createdAt);
    await db.relationships.update(r.id, { createdAt: t, updatedAt: t });
  }

  // Version history.
  await db.revisions.bulkAdd(DRAFTS.map((d) => ({ id: newId(), contentId: piece.get(d.key)!, title: d.title, body: d.body, createdAt: at(d.daysAgo) })));

  // Tags sorted into families: the built-in Theme family, and one of Juno's own.
  const tags = await ensureTags(['memory', 'love', 'time', 'sea', 'light', 'night', 'garden', 'home', 'ferry', 'town', 'craft', 'prompts', 'lists', 'band', 'dance', 'making', 'funny']);
  for (const t of ['memory', 'love', 'time', 'home']) await setTagFamily(tags.get(t)!, 'fam-theme');
  const placesFamily = newId();
  await db.tagFamilies.add({ id: placesFamily, name: 'Places', order: 10, createdAt: at(200), updatedAt: at(200) });
  for (const t of ['sea', 'ferry', 'town', 'garden']) await setTagFamily(tags.get(t)!, placesFamily);

  // Works, placed at the times they were put together.
  const place = async (bookId: string, keys: string[], sectionId: string | null, daysAgo: number) => {
    const entryIds = await addToBook(bookId, keys.map((k) => piece.get(k)!), sectionId);
    for (const [i, id] of entryIds.entries()) await db.entries.update(id, { createdAt: at(daysAgo - i), updatedAt: at(daysAgo - i) });
  };
  const sectionsOf = async (bookId: string) => new Map((await db.sections.where('bookId').equals(bookId).toArray()).map((s) => [s.title, s.id]));

  // In YOUrigin a Work is either its Project's own workspace (sharing its id) or a Project of its own.
  const book = await createBook({
    id: project.get('saltglass')!,
    title: 'Saltglass', subtitle: 'Poems from the night ferry', description: 'A first collection in two parts: leaving, and the light.',
    templateId: 'tpl-poetry', projectIds: [project.get('saltglass')!], author: EXAMPLE_CREATOR, copyrightPage: false, dedicationPage: false, acknowledgementsPage: false,
  });
  await db.books.update(book, { coverAssetId: await picture(demoPicture('waves', '#123a46', '#0b1d26', '#d6ad6d'), 'Saltglass cover', 90) });
  workTimes.push({ id: book, createdAt: at(150), updatedAt: at(20) });
  const bs = await sectionsOf(book);
  await place(book, ['dedication'], bs.get('Front Matter')!, 20);
  await place(book, ['saltglass', 'tide-tables', 'night-ferry'], bs.get('Part I')!, 140);
  await place(book, ['inventory'], bs.get('Interlude')!, 110);
  await place(book, ['keeper', 'rosemary'], bs.get('Part II')!, 70);
  // Still in the tray: chosen for the book, not yet placed.
  await place(book, ['bottle-letter', 'saltglass-2'], null, 25);
  for (const empty of ['Closing']) {
    const id = bs.get(empty);
    if (id) await db.sections.delete(id);
  }

  const album = await createBook({ id: project.get('lamplighters')!, title: 'Night Ferry', subtitle: 'The Lamplighters', description: 'The band’s debut album, recorded in the boathouse.', templateId: null, kind: 'album', shelf: 'Music', projectIds: [project.get('lamplighters')!] });
  workTimes.push({ id: album, createdAt: at(160), updatedAt: at(35) });
  const as = await sectionsOf(album);
  await place(album, ['harbour-song', 'ferry-song', 'kitchen-song', 'rope-song', 'hymn'], [...as.values()][0], 100);

  const gig = await createBook({ title: 'Friday at the Harbour Hall', description: 'Two sets and an encore.', templateId: null, kind: 'setlist', shelf: 'Music', projectIds: [project.get('lamplighters')!] });
  workTimes.push({ id: gig, createdAt: at(18), updatedAt: at(12) });
  await createProject({ id: gig, title: 'Friday at the Harbour Hall', description: 'The Lamplighters’ gig at the Harbour Hall: two sets and an encore, with rehearsal notes.', category: 'Music', colour: 'coral', status: 'building' });
  await db.projects.update(gig, { coverAssetId: await picture(demoPicture('harbour', '#4a2a22', '#1d0f0b', '#f6c08a'), 'Harbour Hall cover', 18), createdAt: at(18) });
  await addItemsToProject(gig, ['kitchen-song', 'ferry-song', 'rope-song', 'last-bus', 'harbour-song', 'hymn', 'rehearsal'].map((k) => piece.get(k)!));
  gigProject = gig;
  const gs = await sectionsOf(gig);
  const set2 = await addSection(gig, 'Set 2');
  const encore = await addSection(gig, 'Encore');
  await place(gig, ['kitchen-song', 'ferry-song', 'rope-song'], [...gs.values()][0], 16);
  await place(gig, ['last-bus', 'harbour-song'], set2, 14);
  await place(gig, ['hymn'], encore, 12);

  const zine = await createBook({ id: project.get('lantern-walk')!, title: 'Lantern Walk', subtitle: 'Five pieces for the autumn walk', templateId: 'tpl-poetry', projectIds: [project.get('lantern-walk')!], author: EXAMPLE_CREATOR, copyrightPage: false, dedicationPage: false, acknowledgementsPage: false });
  await db.books.update(zine, { coverAssetId: await picture(demoPicture('lantern', '#3b2a12', '#170f06', '#f2c46d'), 'Lantern Walk cover', 170) });
  workTimes.push({ id: zine, createdAt: at(182), updatedAt: at(170) });
  const zs = await sectionsOf(zine);
  await place(zine, ['lantern-walk', 'street-by-street', 'rounds'], zs.get('Part I')!, 178);
  await place(zine, ['after-lanterns', 'walk-map'], zs.get('Closing')!, 172);
  for (const empty of ['Front Matter', 'Interlude', 'Part II']) {
    const id = zs.get(empty);
    if (id) await db.sections.delete(id);
  }

  const circleBook = await createBook({ id: project.get('circle')!, title: 'Prompts for a Thursday', description: 'A handout of the circle’s favourite prompts and teachings.', templateId: 'tpl-journal', projectIds: [project.get('circle')!], author: EXAMPLE_CREATOR, copyrightPage: false, dedicationPage: false, acknowledgementsPage: false });
  workTimes.push({ id: circleBook, createdAt: at(95), updatedAt: at(30) });
  const cs = await sectionsOf(circleBook);
  await place(circleBook, ['ritual'], cs.get('Opening')!, 94);
  await place(circleBook, ['teach-breath', 'teach-object'], cs.get('Teaching')!, 92);
  await place(circleBook, ['prompt-room', 'prompt-tide'], cs.get('Prompts')!, 90);
  await place(circleBook, ['week-six'], cs.get('Reflection')!, 30);
  // Keep only the parts of the journal template this handout uses.
  for (const [title, id] of cs) if (!['Opening', 'Teaching', 'Prompts', 'Reflection'].includes(title)) await db.sections.delete(id);

  // Collections across Projects.
  await createCollection('Favourite lines', ['ferry-note', 'gulls', 'kettle', 'overheard', 'mint'].map((k) => piece.get(k)!), 'Small things worth keeping.');
  await createCollection('Ferry poems', ['ferry-note', 'night-ferry', 'ferry-song', 'overheard'].map((k) => piece.get(k)!), 'Everything written on, or about, the crossing.');

  // The assistant's pending suggestions: offered, never applied (accept or dismiss them).
  const suggest = (key: string, kind: 'tags' | 'type' | 'project', value: string, daysAgo: number) => ({
    id: newId(), contentId: piece.get(key)!, kind, value, state: 'pending' as const, provider: 'local', createdAt: at(daysAgo), updatedAt: at(daysAgo),
  });
  await db.suggestions.bulkAdd([
    suggest('overheard', 'tags', 'sea', 9),
    suggest('overheard', 'type', 'quote', 9),
    suggest('lighthouse-voice', 'project', project.get('lamplighters')!, 4),
    suggest('kettle', 'tags', 'memory', 2),
  ]);

  // A portfolio draft (publishing is off in the demo).
  const portfolio = await createPortfolio('creative', EXAMPLE_CREATOR);
  const proj = async (key: string) => (await db.projects.get(project.get(key)!))!;
  const pf = (await db.portfolios.get(portfolio))!;
  await updatePortfolio(portfolio, {
    title: 'Selected work',
    ownerLine: EXAMPLE_LINE,
    intro: 'I write poems about the sea and the small lights people keep for each other, and sing some of them with my band. This is the work I am proudest of so far.',
    items: [
      { ...pf.items[0], heading: 'Poems' },
      { ...itemFromWork((await db.books.get(book))!), description: 'My first collection, in two parts: leaving, and the light. Nearly finished.' },
      { ...itemFromPiece((await db.content.get(piece.get('night-ferry')!))!), textMode: 'full' },
      { ...itemFromProject(await proj('lantern-walk')), description: 'A finished zine of five pieces, written along the old lamplighter’s route and read aloud on the autumn walk.' },
      headingItem('Songs'),
      { ...itemFromProject(await proj('lamplighters')), description: 'Folk songs with my band. Our debut album, Night Ferry, is on the way.' },
      { ...itemFromPiece((await db.content.get(piece.get('harbour-song')!))!), textMode: 'full' },
      headingItem('Teaching'),
      { ...itemFromProject(await proj('circle')), description: 'A weekly writing circle: prompts, short teachings and a lot of quiet writing.' },
    ],
  });
  await db.portfolios.update(portfolio, { createdAt: at(26), updatedAt: at(8) });

  // Every record keeps the time it was really made and last worked on (linking above stamped some as "now").
  await db.transaction('rw', db.content, db.books, db.projects, db.collections, async () => {
    for (const t of pieceTimes) await db.content.update(t.id, { createdAt: t.createdAt, updatedAt: t.updatedAt });
    for (const t of workTimes) await db.books.update(t.id, { createdAt: t.createdAt, updatedAt: t.updatedAt });
    for (const p of PROJECTS) await db.projects.update(project.get(p.key)!, { updatedAt: at(Math.min(...PIECES.filter((x) => x.projects?.includes(p.key)).map((x) => x.daysAgo))) });
    await db.projects.update(gigProject, { updatedAt: at(12) });
    for (const c of await db.collections.toArray()) await db.collections.update(c.id, { createdAt: at(120), updatedAt: at(2) });
  });

  await setSetting('onboarded', true);
  await setSetting('craft', 'words');
  const journey: DemoJourney = { project: project.get('saltglass')!, book, song: piece.get('harbour-song')!, setlist: gig, portfolio };
  await db.settings.put({ key: JOURNEY_KEY, value: journey });
}
