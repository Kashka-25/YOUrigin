// The demo's library: Cassidy's real projects, as Creative Universe presents them
// (github.com/Kashka-25/creative-universe), with its pictures (./pictures.ts) and
// notes written for the demo around them. Project names, one-line descriptions, lesson
// titles, pictures and links are the public ones; the poems and spoken word are
// Cassidy's, approved for the demo (./writing.ts); the rest is example content. Written only into the demo database (see ./mode.ts), from the
// same fixed content every time; dates are counted back from the moment the demo starts.

import { db } from '../db/db';
import { createMany } from '../db/content';
import { addSection, addToBook, createBook } from '../db/books';
import { createCollection, linkContent } from '../db/collections';
import { addItemsToProject, createProject } from '../db/projectRecords';
import { ensureTags, setTagFamily } from '../db/tags';
import { setSetting } from '../db/settings';
import { createPortfolio, updatePortfolio } from '../db/portfolios';
import { createPost } from '../db/posts';
import { headingItem, itemFromPiece, itemFromProject, itemFromWork } from '../portfolio/model';
import { statusPatch, type PostFormat, type PostStatus, type PostWorld } from '../posts/model';
import { newId } from '../domain/text';
import { universeWorkUrl } from '../domain/universe';
import type { ContentItem, ProjectColour, ProjectStatus, RelationshipKind, UniverseRealm } from '../domain/types';
import { demoPicture, type DemoPicture } from './art';
import { loadPicture, type RealPicture } from './pictures';
import { JOURNEY, SET_LIST, YOULOGY, YOULOGY_DRAFTS, YOULOGY_LINKS, type WritingPiece } from './writing';

export const DEMO_CREATOR = 'Cassidy Rae';
export const DEMO_CREATOR_LINE = 'Digital creator and dream supporter';

const DAY = 86_400_000;

const real = (name: RealPicture['real'], fallback: DemoPicture): RealPicture => ({ real: name, fallback });

export type Piece = WritingPiece & {
  /** For pictures. */
  art?: DemoPicture | RealPicture;
  artMedium?: string;
};

type ProjectDef = {
  key: string;
  title: string;
  description: string;
  category: string;
  colour: ProjectColour;
  status: ProjectStatus;
  cover: RealPicture;
  daysAgo: number;
  /** A Creation this one sits inside. */
  parent?: string;
  /** Its page in Creative Universe, and its live site where there is one. */
  universe?: { realm: UniverseRealm; slug: string };
  live?: string;
};

// The projects Cassidy chose to show (22 Nov 2026), in Creative Universe's words.
export const PROJECTS: ProjectDef[] = [
  {
    key: 'you', title: 'YOU', category: 'App', colour: 'jade', status: 'building', daysAgo: 300,
    description: 'The Living Biography: a calm, private place to journal, grow habits and goals, and watch your life take shape in moments, chapters and values.',
    cover: real('you', demoPicture('sun', '#173c35', '#0a1a17', '#8fd3b5')),
    universe: { realm: 'digital', slug: 'you' }, live: 'https://yourownuniverse.life/',
  },
  {
    key: 'yourigin', title: 'YOUrigin', category: 'App', colour: 'ochre', status: 'building', daysAgo: 250,
    description: 'A personal creative operating environment for ideas, writing, lyrics, research, Projects and Works.',
    cover: real('yourigin', demoPicture('orbit', '#3a2a12', '#170f06', '#d6ad6d')),
    universe: { realm: 'digital', slug: 'yourigin' }, live: 'https://kashka-25.github.io/YOUrigin/',
  },
  {
    key: 'empatherapy', title: 'Empatherapy', category: 'Wellbeing', colour: 'teal', status: 'idea', daysAgo: 150,
    description: 'Discover new pathways to yourself. Seekers meet Alchemists, explore unfamiliar practices, and find a little light.',
    cover: real('empatherapy', demoPicture('window', '#123a46', '#0b1d26', '#9fd8d0')),
    universe: { realm: 'ventures', slug: 'empatherapy' },
  },
  {
    key: 'itl', title: 'IntoTheLighthouse', category: 'Wellbeing', colour: 'lavender', status: 'building', daysAgo: 210,
    description: 'A human-centred wellbeing and therapy concept: a warm home for growth.',
    cover: real('intothelighthouse', demoPicture('lighthouse', '#2b2343', '#120e1e', '#f2c46d')),
    universe: { realm: 'ventures', slug: 'intothelighthouse' }, live: 'https://kashka-25.github.io/IntoTheLighthouse/',
  },
  {
    key: 'freeflow', title: 'The Art of Free Flow', category: 'Music', colour: 'rose', status: 'complete', daysAgo: 280,
    description: 'An invitation to let go, find your rhythm, and discover the freedom of spontaneous expression: a free course in seven lessons.',
    cover: real('the-art-of-free-flow', demoPicture('flow', '#4a1f2c', '#1f0e16', '#f0b58a')),
    universe: { realm: 'music', slug: 'the-art-of-free-flow' }, live: 'https://kashka-25.github.io/the-art-of-free-flow/',
  },
  {
    key: 'youlogy', title: 'My Living YOUlogy', category: 'Music', colour: 'amber', status: 'building', daysAgo: 160,
    description: 'An evening of music, reflection & presence: my first concert, its invitation website, and the spoken word that opens it.',
    cover: real('my-living-youlogy', demoPicture('lantern', '#3b2a12', '#170f06', '#f2c46d')),
    universe: { realm: 'music', slug: 'my-living-youlogy' }, live: 'https://kashka-25.github.io/living-youlogy/',
  },
];

const PIECES: Piece[] = [
  // ---- YOU -----------------------------------------------------------------------------
  { key: 'you-tagline', body: 'Your life, written as you live it.', type: 'fragment', status: 'polished', tags: ['journal'], daysAgo: 296, projects: ['you'] },
  {
    key: 'you-pillars', title: 'Eight Pillars', type: 'note', status: 'polished', tags: ['growth', 'design'], daysAgo: 281, projects: ['you'],
    body: 'Everything you do grows one of eight Pillars of your life. A habit, a goal, a dream: each one feeds a Pillar, so you can see where life is growing and where it is asking for care.',
  },
  {
    key: 'you-north', title: 'True North', type: 'idea', status: 'developing', tags: ['growth'], daysAgo: 262, projects: ['you'],
    body: 'Values and a personal True North keep you pointed where you mean to go. Ask for them gently, early on, and let them change as you do.',
  },
  {
    key: 'you-kind', title: 'Kind by design', type: 'reflection', status: 'polished', tags: ['kindness', 'design'], daysAgo: 238, projects: ['you'],
    notes: 'Goes on the welcome screen.',
    body: 'A missed day is never held against you. No streaks that shame, no red numbers. If the app is kind, people come back to it, and to themselves.',
  },
  {
    key: 'you-ai', title: 'Reflections only if you say yes', type: 'note', status: 'polished', tags: ['privacy'], daysAgo: 176, projects: ['you'],
    body: 'Gentle AI reflections are there only if you say yes: off to begin with, explained in one plain sentence, and easy to turn off again.',
  },
  {
    key: 'you-phone', title: 'Made for the phone', type: 'research', status: 'developing', tags: ['phone'], daysAgo: 131, projects: ['you'],
    body: 'Most journaling happens in bed, on a bus, in a queue. It has to open fast and keep working with no signal at all.',
  },
  {
    key: 'you-chapters', title: 'Moments and chapters', type: 'idea', status: 'seed', tags: ['journal', 'growth'], daysAgo: 41, projects: ['you'],
    body: 'Gather the moments of a life into chapters, so you can look back and see who you are becoming. A highlight in the journal could become a moment with one tap.',
  },
  {
    key: 'you-screen', title: 'The eight Pillars', type: 'image', status: 'polished', tags: ['design'], daysAgo: 222, projects: ['you'],
    body: 'The YOU page: the eight Pillars of life drawn as petals around a golden centre (example data).',
    art: real('you-pillars', demoPicture('sun', '#173c35', '#0a1a17', '#8fd3b5')), artMedium: 'App screen',
  },
  {
    key: 'you-yournal', title: 'YOUrnal', type: 'image', status: 'polished', tags: ['journal', 'design'], daysAgo: 190, projects: ['you'],
    body: 'The YOUrnal: dated entries with moods and tags (example data).',
    art: real('you-yournal', demoPicture('notes', '#173c35', '#0a1a17', '#8fd3b5')), artMedium: 'App screen',
  },

  // ---- YOUrigin --------------------------------------------------------------------------
  {
    key: 'yo-land', title: 'Somewhere to land', type: 'idea', status: 'polished', tags: ['design'], daysAgo: 246, projects: ['yourigin'],
    body: 'Ideas, writing, lyrics and research need somewhere to land the moment they arrive. Capture first; sort later, or never.',
  },
  {
    key: 'yo-once', title: 'Content exists once', type: 'note', status: 'polished', tags: ['design'], daysAgo: 228, projects: ['yourigin'],
    body: 'A piece lives in one place. Projects, Works and portfolios point to it; they never copy it. Change a line once and it changes everywhere it is used.',
  },
  {
    key: 'yo-grow', title: 'From one line to a Work', type: 'reflection', status: 'developing', tags: ['growth'], daysAgo: 168, projects: ['yourigin'],
    body: 'Most of what I make starts as one line on my phone. The app should let that line grow into a Project and then a finished Work without ever being retyped.',
  },
  {
    key: 'yo-share', title: 'Notes from the phone', type: 'research', status: 'developing', tags: ['phone'], daysAgo: 122, projects: ['yourigin'],
    body: 'Notes shared in from the phone should arrive with a suggestion of which Project they belong to. A suggestion, never a move: the assistant proposes, I decide.',
  },
  {
    key: 'yo-private', title: 'Private by design', type: 'note', status: 'polished', tags: ['privacy'], daysAgo: 88, projects: ['yourigin'],
    body: 'Works offline, keeps everything on the device, and syncs only end-to-end encrypted. The words never reach a server in a form anyone else can read.',
  },
  {
    key: 'yo-demo', title: 'Open the door', type: 'idea', status: 'polished', tags: ['design'], daysAgo: 35, projects: ['yourigin'],
    body: 'Let visitors from Creative Universe try it with example data that stays in their own browser. No sign-up, nothing sent anywhere.',
  },
  {
    key: 'yo-map', title: 'Map of the codex', type: 'image', status: 'developing', tags: ['design'], daysAgo: 52, projects: ['yourigin'],
    body: 'Capture in the middle; Projects, Works and portfolios around it, like planets.',
    art: demoPicture('orbit', '#3a2a12', '#170f06', '#d6ad6d'), artMedium: 'Ink, scanned',
  },

  // ---- Empatherapy ----------------------------------------------------------------------
  {
    key: 'emp-vision', title: 'New pathways to yourself', type: 'idea', status: 'developing', tags: ['healing'], daysAgo: 148, projects: ['empatherapy'],
    body: 'A place to discover new pathways to yourself. Seekers meet Alchemists, explore unfamiliar practices, and find a little light.',
  },
  {
    key: 'emp-names', title: 'Seekers and Alchemists', type: 'note', status: 'developing', tags: ['healing', 'design'], daysAgo: 133, projects: ['empatherapy'],
    body: 'Seekers: anyone looking. Alchemists: the practitioners who walk with them. The names should feel like an invitation, not a directory.',
  },
  {
    key: 'emp-discovery', title: 'A gentle discovery tool', type: 'idea', status: 'seed', tags: ['healing'], daysAgo: 104, projects: ['empatherapy'],
    body: 'A few kind questions instead of a search box, and then three practices you may never have tried.',
  },
  {
    key: 'emp-window', title: 'Your journey starts somewhere', type: 'image', status: 'developing', tags: ['design'], daysAgo: 99, projects: ['empatherapy'],
    body: 'The vision home page: Begin your discovery and Explore Alchemists, beside a drawn window with a plant and a cup of tea.',
    art: real('empatherapy-v2-home', demoPicture('window', '#123a46', '#0b1d26', '#9fd8d0')), artMedium: 'Website screen',
  },
  {
    key: 'emp-paths', title: 'A few paths to explore', type: 'image', status: 'seed', tags: ['healing', 'design'], daysAgo: 90, projects: ['empatherapy'],
    body: 'The discovery results, with the reasons for each suggestion explained (a made-up example Alchemist).',
    art: real('empatherapy-v2-discover', demoPicture('window', '#123a46', '#0b1d26', '#9fd8d0')), artMedium: 'Website screen',
  },
  {
    key: 'emp-care', title: 'When someone simply needs care', type: 'reflection', status: 'seed', tags: ['healing', 'kindness'], daysAgo: 30, projects: ['empatherapy', 'itl'],
    body: 'Not everyone arrives curious. Some arrive hurting. For them the door should open straight onto IntoTheLighthouse.',
  },

  // ---- IntoTheLighthouse ------------------------------------------------------------------
  {
    key: 'itl-home', title: 'A warm home for growth', type: 'idea', status: 'polished', tags: ['healing'], daysAgo: 206, projects: ['itl'],
    body: 'A human-centred wellbeing and therapy space that feels welcoming from the first moment.',
  },
  {
    key: 'itl-kind', title: 'Kindness before distance', type: 'reflection', status: 'polished', tags: ['healing', 'kindness'], daysAgo: 190, projects: ['itl'],
    body: 'Simplicity and kindness ahead of clinical distance. Every screen should feel like someone left a light on for you.',
  },
  {
    key: 'itl-support', title: 'Get support now', type: 'note', status: 'polished', tags: ['healing', 'design'], daysAgo: 184, projects: ['itl'],
    body: 'One button on the first screen, always in the same place, for anyone who needs help today.',
  },
  {
    key: 'itl-name', title: 'A new name', type: 'note', status: 'polished', tags: ['healing'], daysAgo: 66, projects: ['itl'],
    body: 'HOPEIUM is now IntoTheLighthouse, I.T.L for short. A place you walk into, and are welcomed in.',
  },
  {
    key: 'itl-mark', title: 'Home page', type: 'image', status: 'polished', tags: ['design', 'light'], daysAgo: 196, projects: ['itl'],
    body: 'The wordmark with a lighthouse as the i of Lighthouse, over a dusk mountain scene, with a Get support now button.',
    art: real('intothelighthouse-home', demoPicture('lighthouse', '#2b2343', '#120e1e', '#f2c46d')), artMedium: 'Website screen',
  },
  {
    key: 'itl-dusk', title: 'How would you like to reach out?', type: 'image', status: 'polished', tags: ['healing'], daysAgo: 186, projects: ['itl'],
    body: 'The support page: book a session, or ask for the next available time.',
    art: real('intothelighthouse-support', demoPicture('mountains', '#3a3350', '#141020', '#f2c46d')), artMedium: 'Website screen',
  },
  {
    key: 'itl-beam', title: 'Your safety comes first', type: 'image', status: 'polished', tags: ['healing'], daysAgo: 58, projects: ['itl'],
    body: 'The safety page, with emergency numbers for the UK, Ireland, the US, Canada and Australia.',
    art: real('intothelighthouse-safety', demoPicture('lighthouse', '#1d3a52', '#0c1a26', '#9fd0f0')), artMedium: 'Website screen',
  },

  // ---- The Art of Free Flow: the course (lesson titles and lines from the course site) ----
  {
    key: 'ff-why', title: 'What freestyle is', type: 'reflection', status: 'polished', tags: ['freestyle', 'voice'], daysAgo: 276, projects: ['freeflow'],
    body: 'Freestyle is the art of allowing expression to move through you without needing to know exactly where it is going.',
  },
  { key: 'ff-1', title: 'Introduction to Free Flow: Light Language', body: 'Invite sound to leave your body. There’s no need to control it.', type: 'teaching', status: 'polished', tags: ['freestyle', 'voice'], daysAgo: 268, projects: ['freeflow'] },
  { key: 'ff-2', title: 'Adding the Words', body: 'Play and have fun. Experiment with different voices, accents and characters.', type: 'teaching', status: 'polished', tags: ['freestyle', 'voice'], daysAgo: 266, projects: ['freeflow'] },
  { key: 'ff-3', title: 'Stringing Language Together', body: 'Let your words do what words do. We’re not aiming for perfection; we’re aiming for continuation.', type: 'teaching', status: 'polished', tags: ['freestyle'], daysAgo: 263, projects: ['freeflow'] },
  { key: 'ff-4', title: 'Squeezing the Juice', body: 'Bring your body to life, and watch your voice come alive.', type: 'teaching', status: 'polished', tags: ['freestyle', 'voice'], daysAgo: 259, projects: ['freeflow'] },
  { key: 'ff-5', title: 'Trusting Your Instincts', body: 'Let the emotions drive and the body be the vehicle.', type: 'teaching', status: 'polished', tags: ['freestyle'], daysAgo: 255, projects: ['freeflow'] },
  { key: 'ff-6', title: 'Putting It Together: Developing Your Flow', body: 'Mix it all together. Slip and fall, stumble and roar.', type: 'teaching', status: 'polished', tags: ['freestyle'], daysAgo: 252, projects: ['freeflow'] },
  { key: 'ff-7', title: 'Anchors of Freedom', body: 'Writing lyrics, poems and journals fills your freestyle cabinet with usable tools.', type: 'teaching', status: 'polished', tags: ['freestyle', 'journal'], daysAgo: 248, projects: ['freeflow'] },
  {
    key: 'ff-warmup', title: 'One-minute warm-up', type: 'ritual', status: 'polished', tags: ['freestyle', 'voice'], daysAgo: 244, projects: ['freeflow'],
    body: 'Shake out your hands. Hum one long note. Then say the first word you see and keep going for a minute without stopping.',
  },
  {
    key: 'ff-objects', title: 'Three things in the room', type: 'prompt', status: 'polished', tags: ['freestyle'], daysAgo: 240, projects: ['freeflow'],
    body: 'Pick three things you can see and freestyle a verse that joins them. Don’t stop to fix a line.',
  },
  {
    key: 'ff-filming', title: 'Filming the lessons', type: 'note', status: 'polished', tags: ['freestyle'], daysAgo: 214, projects: ['freeflow'],
    body: 'Seven short videos, one idea each, filmed in one take where possible. The stumbles stay in: they are part of the lesson.',
  },
  {
    key: 'ff-after', title: 'After the course went live', type: 'reflection', status: 'developing', tags: ['freestyle', 'growth'], daysAgo: 96, projects: ['freeflow'],
    body: 'People write to say lesson one felt silly and then freeing. That is exactly the order it should happen in.',
  },
  {
    key: 'ff-cover', title: 'Course cover', type: 'image', status: 'polished', tags: ['freestyle', 'design'], daysAgo: 220, projects: ['freeflow'],
    body: 'The guide in an orange beanie and dungarees, sitting on a cloud with a microphone, the sun and music notes behind him.',
    art: real('the-art-of-free-flow', demoPicture('flow', '#4a1f2c', '#1f0e16', '#f0b58a')), artMedium: 'Illustration',
  },

  // ---- My Living YOUlogy: Cassidy's spoken word (see ./writing.ts) ------------------------
  ...YOULOGY,
  {
    key: 'yl-invite', title: 'The invitation', type: 'image', status: 'polished', tags: ['light'], daysAgo: 158, projects: ['youlogy'],
    body: 'The opening screen of the invitation website: a lit candle above the title, with “With Cassidy” and “Enter” below.',
    art: real('living-youlogy-home', demoPicture('lantern', '#3b2a12', '#170f06', '#f2c46d')), artMedium: 'Website screen',
  },
  {
    key: 'yl-evening', title: 'An evening of music, reflection & presence', type: 'image', status: 'polished', tags: ['voice'], daysAgo: 155, projects: ['youlogy'],
    body: 'The invitation’s welcome to the evening.',
    art: real('living-youlogy-evening', demoPicture('lantern', '#3b2a12', '#170f06', '#f2c46d')), artMedium: 'Website screen',
  },
  {
    key: 'yl-order', title: 'Running order', type: 'note', status: 'developing', tags: ['voice'], daysAgo: 110, projects: ['youlogy'],
    body: 'The spoken word opens the evening in its own parts, with the heartbeat rhythm coming in under Ships, and ends on the welcome before the first song.',
  },

  // ---- Loose: not yet in a Project --------------------------------------------------------
  { key: 'loose-journal-book', title: 'Course journal', body: 'What if the Free Flow course had a journal you could keep here, one page per lesson?', type: 'idea', status: 'seed', tags: ['freestyle', 'journal'], daysAgo: 9 },
  { key: 'loose-light', body: 'Leave a light on for someone today.', type: 'fragment', status: 'seed', tags: ['light'], daysAgo: 6 },
  { key: 'loose-gathering', title: 'A gathering for Seekers', body: 'An evening where Seekers try three practices in one room, and nobody has to explain why they came.', type: 'idea', status: 'seed', tags: ['healing'], daysAgo: 4 },
  { key: 'loose-voice', body: 'Your voice already knows the way; it is waiting for you to stop editing.', type: 'fragment', status: 'seed', tags: ['voice'], daysAgo: 2 },
  {
    key: 'loose-sketch', title: 'Sun over the studio', type: 'image', status: 'developing', tags: ['light'], daysAgo: 14,
    body: 'Morning sketch before the first lesson was filmed.',
    art: demoPicture('sun', '#4a2a22', '#1d0f0b', '#f6c08a'), artMedium: 'Watercolour',
  },
];

const LINKS: { from: string; to: string; kind: RelationshipKind }[] = [
  { from: 'you-chapters', to: 'you-kind', kind: 'related' },
  { from: 'you-north', to: 'you-pillars', kind: 'continues' },
  { from: 'you-screen', to: 'you-pillars', kind: 'idea' },
  { from: 'yo-grow', to: 'yo-land', kind: 'continues' },
  { from: 'yo-once', to: 'yo-land', kind: 'continues' },
  { from: 'yo-share', to: 'yo-grow', kind: 'continues' },
  { from: 'yo-map', to: 'yo-once', kind: 'idea' },
  { from: 'yo-demo', to: 'yo-private', kind: 'related' },
  { from: 'emp-names', to: 'emp-vision', kind: 'continues' },
  { from: 'emp-discovery', to: 'emp-vision', kind: 'continues' },
  { from: 'emp-care', to: 'itl-home', kind: 'related' },
  { from: 'itl-kind', to: 'you-kind', kind: 'echoes' },
  { from: 'itl-beam', to: 'itl-mark', kind: 'variant' },
  { from: 'ff-objects', to: 'ff-3', kind: 'continues' },
  { from: 'ff-warmup', to: 'ff-1', kind: 'continues' },
  { from: 'ff-cover', to: 'ff-why', kind: 'idea' },
  { from: 'loose-journal-book', to: 'ff-7', kind: 'related' },
  { from: 'loose-light', to: 'itl-kind', kind: 'echoes' },
  ...YOULOGY_LINKS,
];

/** Earlier drafts, so version history has something to show. Oldest first. */
const DRAFTS: { key: string; daysAgo: number; title: string; body: string }[] = [
  { key: 'yo-land', daysAgo: 249, title: 'Landing place', body: 'Ideas need somewhere to land.' },
  { key: 'yo-land', daysAgo: 247, title: 'Somewhere to land', body: 'Ideas, writing, lyrics and research need somewhere to land the moment they arrive.' },
  ...YOULOGY_DRAFTS,
];

export interface DemoJourney {
  project: string;
  /** A poem with a family of drafts, for the Lineage plate. */
  poem: string;
  book: string;
  song: string;
  setlist: string;
  portfolio: string;
}

const JOURNEY_KEY = 'demoJourney';

export async function demoJourney(): Promise<DemoJourney | null> {
  return ((await db.settings.get(JOURNEY_KEY))?.value as DemoJourney | undefined) ?? null;
}

type PostDef = { daysAgo: number; scheduledIn: number | null; status: PostStatus; format: PostFormat; world: PostWorld; hook: string; caption: string; hashtags: string[]; altText: string; cta: string; link: string; pieces: string[]; picture: string; notes?: string };

// Instagram posts planned here. Nothing posts from the app, and nothing at all is sent in the demo.
const POSTS: PostDef[] = [
  {
    daysAgo: 20, scheduledIn: null, status: 'posted', format: 'single-image', world: 'music-sound', picture: 'ff-cover', pieces: ['ff-why', 'ff-1'],
    hook: 'Freestyle is a door, not a test',
    caption: 'The Art of Free Flow is out: seven short lessons in letting your voice move without knowing where it’s going. Free, at your own pace. Lesson one starts with sound, no words needed.',
    hashtags: ['freestyle', 'freeflow', 'voice'], altText: '', cta: 'Start lesson one: link in bio', link: 'https://kashka-25.github.io/the-art-of-free-flow/',
  },
  {
    daysAgo: 6, scheduledIn: 2, status: 'approved', format: 'carousel', world: 'digital-homes', picture: 'yo-map', pieces: ['yo-land', 'yo-once', 'yo-demo'],
    hook: 'Where do your ideas land?',
    caption: 'YOUrigin is where my lines, lyrics and research land the moment they arrive, then grow into Projects and finished Works. It’s in beta, and there’s a demo you can open right now: nothing leaves your browser.',
    hashtags: ['creativeprocess', 'writersofinstagram', 'yourigin'], altText: 'A hand-drawn map: a golden centre with planets circling it.', cta: 'Try the demo: link in bio', link: 'https://kashka-25.github.io/YOUrigin/?demo',
    notes: 'Slide 3: show the Capture screen.',
  },
  {
    daysAgo: 3, scheduledIn: 5, status: 'draft', format: 'quote-card', world: 'healing', picture: 'itl-mark', pieces: ['itl-kind'],
    hook: 'Someone left a light on for you',
    caption: 'IntoTheLighthouse is a warm home for growth: wellbeing and therapy with simplicity and kindness ahead of clinical distance. Still being built.',
    hashtags: ['wellbeing', 'intothelighthouse'], altText: '', cta: '', link: 'https://kashka-25.github.io/IntoTheLighthouse/',
  },
  {
    daysAgo: 1, scheduledIn: null, status: 'idea', format: 'story', world: 'digital-homes', picture: 'you-screen', pieces: ['you-kind'],
    hook: 'A missed day is never held against you',
    caption: 'YOU, the Living Biography, is in beta.',
    hashtags: [], altText: '', cta: '', link: 'https://yourownuniverse.life/',
  },
];

/** Fills the (empty) demo library with Cassidy's projects. */
export async function seedExampleCreator(now = Date.now()): Promise<void> {
  const at = (daysAgo: number) => now - daysAgo * DAY;
  const picture = async (source: DemoPicture | RealPicture, name: string, daysAgo: number) => {
    const p = await loadPicture(source);
    const id = newId();
    await db.assets.add({ id, name, mime: p.mime, dataUrl: p.dataUrl, width: p.width, height: p.height, bytes: p.dataUrl.length, createdAt: at(daysAgo), updatedAt: at(daysAgo) });
    return id;
  };
  const newest = (key: string) => Math.min(...PIECES.filter((x) => x.projects?.includes(key)).map((x) => x.daysAgo));

  // Projects, each with its cover; branches inside their parent.
  const project = new Map<string, string>();
  for (const p of PROJECTS) {
    const id = await createProject({ title: p.title, description: p.description, category: p.category, colour: p.colour, status: p.status, parentId: p.parent ? project.get(p.parent) : undefined });
    await db.projects.update(id, { coverAssetId: await picture(p.cover, `${p.title} cover`, p.daysAgo), ...(p.universe ? { universe: p.universe } : {}) });
    project.set(p.key, id);
  }

  // The writing, notes and pictures, back-dated across the months.
  const ids = await createMany(PIECES.map((p) => ({ title: p.title, body: p.body, type: p.type, status: p.status, tagNames: p.tags, notes: p.notes, source: { kind: 'sample' as const } })));
  const piece = new Map(PIECES.map((p, i) => [p.key, ids[i]]));
  const pieceTime = (p: Piece) => ({ createdAt: at(p.daysAgo), updatedAt: at(Math.max(0, p.daysAgo - (p.status === 'polished' ? 6 : 1))) });
  for (const p of PIECES) {
    const patch: Partial<ContentItem> = pieceTime(p);
    if (p.art) {
      patch.assetId = await picture(p.art, p.title ?? 'Picture', p.daysAgo);
      patch.art = { medium: p.artMedium, madeOn: new Date(at(p.daysAgo)).toISOString().slice(0, 10) };
    }
    await db.content.update(piece.get(p.key)!, patch);
  }
  const workTimes: { id: string; createdAt: number; updatedAt: number }[] = [];
  for (const p of PROJECTS) {
    const members = PIECES.filter((x) => x.projects?.includes(p.key)).map((x) => piece.get(x.key)!);
    await addItemsToProject(project.get(p.key)!, members);
  }

  for (const l of LINKS) await linkContent(piece.get(l.from)!, piece.get(l.to)!, l.kind);
  for (const r of await db.relationships.toArray()) {
    const t = Math.max((await db.content.get(r.fromId))!.createdAt, (await db.content.get(r.toId))!.createdAt);
    await db.relationships.update(r.id, { createdAt: t, updatedAt: t });
  }

  // Version history.
  await db.revisions.bulkAdd(DRAFTS.map((d) => ({ id: newId(), contentId: piece.get(d.key)!, title: d.title, body: d.body, createdAt: at(d.daysAgo) })));

  // Tags sorted into families: the built-in Theme family, and one for the craft.
  const tags = await ensureTags([...new Set(PIECES.flatMap((p) => p.tags))]);
  for (const t of ['growth', 'kindness', 'light', 'healing', 'love', 'home', 'time'].filter((t) => tags.has(t))) await setTagFamily(tags.get(t)!, 'fam-theme');
  const craftFamily = newId();
  await db.tagFamilies.add({ id: craftFamily, name: 'Craft', order: 10, createdAt: at(200), updatedAt: at(200) });
  for (const t of ['freestyle', 'voice', 'journal', 'design'].filter((t) => tags.has(t))) await setTagFamily(tags.get(t)!, craftFamily);

  // Works, placed at the times they were put together.
  const place = async (bookId: string, keys: string[], sectionId: string | null, daysAgo: number) => {
    const entryIds = await addToBook(bookId, keys.map((k) => piece.get(k)!), sectionId);
    for (const [i, id] of entryIds.entries()) await db.entries.update(id, { createdAt: at(daysAgo - i), updatedAt: at(daysAgo - i) });
  };
  const sectionsOf = async (bookId: string) => new Map((await db.sections.where('bookId').equals(bookId).toArray()).map((s) => [s.title, s.id]));
  const keepSections = async (bookId: string, keep: string[]) => {
    for (const [title, id] of await sectionsOf(bookId)) if (!keep.includes(title)) await db.sections.delete(id);
  };

  // In YOUrigin a Work is its Project's own workspace (sharing its id).
  // The course, as a workbook.
  const course = await createBook({
    id: project.get('freeflow')!, title: 'The Art of Free Flow', subtitle: 'Seven lessons in freestyle', description: 'The course as a workbook: why freestyle, the seven lessons, a warm-up and a prompt to practise with.',
    templateId: 'tpl-journal', projectIds: [project.get('freeflow')!], author: DEMO_CREATOR, copyrightPage: false, dedicationPage: false, acknowledgementsPage: false,
  });
  await db.books.update(course, { coverAssetId: (await db.projects.get(course))!.coverAssetId });
  workTimes.push({ id: course, createdAt: at(250), updatedAt: at(210) });
  const fs = await sectionsOf(course);
  await place(course, ['ff-why'], fs.get('Opening')!, 248);
  await place(course, ['ff-1', 'ff-2', 'ff-3', 'ff-4', 'ff-5', 'ff-6', 'ff-7'], fs.get('Teaching')!, 246);
  await place(course, ['ff-warmup'], fs.get('Ritual')!, 240);
  await place(course, ['ff-objects'], fs.get('Prompts')!, 238);
  await keepSections(course, ['Opening', 'Teaching', 'Ritual', 'Prompts']);

  // My Living YOUlogy's set list: the spoken word, in the order of its own parts.
  const gig = await createBook({ id: project.get('youlogy')!, title: 'My Living YOUlogy', subtitle: 'The spoken word', description: 'The introduction to the evening, part by part.', templateId: null, kind: 'setlist', shelf: 'Music', projectIds: [project.get('youlogy')!] });
  await db.books.update(gig, { coverAssetId: (await db.projects.get(gig))!.coverAssetId });
  workTimes.push({ id: gig, createdAt: at(130), updatedAt: at(110) });
  const [firstSet] = [...(await sectionsOf(gig)).values()];
  for (const [i, [name, keys]] of SET_LIST.entries()) {
    const sectionId = i === 0 ? firstSet : await addSection(gig, name);
    if (i === 0) await db.sections.update(sectionId, { title: name });
    await place(gig, keys, sectionId, 126 - i * 3);
  }

  // YOUrigin's own ideas board.
  const board = await createBook({ id: project.get('yourigin')!, title: 'Roadmap ideas', description: 'What YOUrigin could grow into next.', templateId: null, kind: 'ideas', projectIds: [project.get('yourigin')!] });
  workTimes.push({ id: board, createdAt: at(120), updatedAt: at(35) });
  await place(board, ['yo-share', 'yo-demo', 'yo-grow'], null, 34);

  // IntoTheLighthouse's screens, as a series.
  const sketches = await createBook({ id: project.get('itl')!, title: 'The website', subtitle: 'IntoTheLighthouse', description: 'Home, reaching out, and safety first.', templateId: null, kind: 'series', shelf: 'Art', projectIds: [project.get('itl')!] });
  await db.books.update(sketches, { coverAssetId: (await db.projects.get(sketches))!.coverAssetId });
  workTimes.push({ id: sketches, createdAt: at(190), updatedAt: at(58) });
  await place(sketches, ['itl-mark', 'itl-dusk', 'itl-beam'], null, 58);

  // Collections across Projects.
  await createCollection('Digital homes', ['you-kind', 'you-pillars', 'yo-land', 'yo-once', 'yo-private'].map((k) => piece.get(k)!), 'What the apps are for, in a few lines.');
  await createCollection('Places to heal', ['emp-vision', 'emp-care', 'itl-home', 'itl-kind', 'loose-light'].map((k) => piece.get(k)!), 'Empatherapy and IntoTheLighthouse, side by side.');

  // The assistant's pending suggestions: offered, never applied (accept or dismiss them).
  const suggest = (key: string, kind: 'tags' | 'type' | 'project', value: string, daysAgo: number) => ({
    id: newId(), contentId: piece.get(key)!, kind, value, state: 'pending' as const, provider: 'local', createdAt: at(daysAgo), updatedAt: at(daysAgo),
  });
  await db.suggestions.bulkAdd([
    suggest('loose-journal-book', 'project', project.get('freeflow')!, 9),
    suggest('loose-gathering', 'project', project.get('empatherapy')!, 4),
    suggest('loose-voice', 'tags', 'freestyle', 2),
    suggest('loose-voice', 'type', 'quote', 2),
    suggest('yl-no-book', 'project', project.get('youlogy')!, 3),
  ]);

  // Posts, each with its picture.
  for (const p of POSTS) {
    const art = PIECES.find((x) => x.key === p.picture)!;
    const assetId = (await db.content.get(piece.get(p.picture)!))!.assetId!;
    const day = new Date(at(-(p.scheduledIn ?? 0)));
    day.setHours(18, 30, 0, 0);
    await createPost({
      createdAt: at(p.daysAgo), updatedAt: at(Math.max(0, p.daysAgo - 1)),
      ...statusPatch(p.status, at(Math.max(0, p.daysAgo - 1))),
      scheduledAt: p.status === 'posted' ? at(p.daysAgo - 1) : p.scheduledIn === null ? null : day.getTime(),
      format: p.format, world: p.world, hook: p.hook, caption: p.caption, hashtags: p.hashtags, altText: p.altText || art.body, cta: p.cta, link: p.link,
      pieceIds: p.pieces.map((k) => piece.get(k)!), media: [{ kind: 'asset', assetId }], notes: p.notes ?? '',
    });
  }

  // A portfolio draft (publishing is off in the demo).
  const portfolio = await createPortfolio('creative', DEMO_CREATOR);
  const proj = async (key: string) => (await db.projects.get(project.get(key)!))!;
  const card = async (key: string, description: string) => {
    const def = PROJECTS.find((p) => p.key === key)!;
    return { ...itemFromProject(await proj(key)), description, destinationUrl: def.live ?? universeWorkUrl(def.universe!.slug) };
  };
  const pf = (await db.portfolios.get(portfolio))!;
  await updatePortfolio(portfolio, {
    title: 'Selected ventures',
    ownerLine: DEMO_CREATOR_LINE,
    intro: 'My main intention is supporting people in freeing their dreams. I’m here to encourage you that anything is possible, and to support you in bringing your creation to life, whether that’s a digital home for your idea, a world to step into or a place to heal.',
    items: [
      { ...pf.items[0], heading: 'Digital homes' },
      await card('you', 'Your life, written as you live it: a calm, private place to journal and grow, kind by design.'),
      await card('yourigin', 'Ideas, writing, lyrics and research land here the moment they arrive, then grow into Projects and finished Works.'),
      headingItem('Places to heal'),
      await card('itl', 'A warm home for growth, with simplicity and kindness ahead of clinical distance.'),
      await card('empatherapy', 'A vision in progress: Seekers meet Alchemists and find new pathways to themselves.'),
      headingItem('Music & sound'),
      await card('freeflow', 'A free course in seven lessons: let go, find your rhythm, and discover the freedom of spontaneous expression.'),
      { ...itemFromWork((await db.books.get(course))!), description: 'The course as a workbook: seven lessons, a warm-up and a prompt to practise with.' },
      await card('youlogy', 'My first concert: an evening of music, reflection & presence, opened with spoken word.'),
      { ...itemFromPiece((await db.content.get(piece.get(JOURNEY.poem)!))!), textMode: 'full' },
    ],
  });
  await db.portfolios.update(portfolio, { createdAt: at(26), updatedAt: at(8) });

  // Change notes on every Project, newest first (they travel to Creative Universe).
  const notes: Record<string, [number, string][]> = {
    you: [
      [41, 'Sketched moments and chapters: a journal highlight becomes a moment in one tap.'],
      [176, 'AI reflections are now opt-in only.'],
      [281, 'The eight Pillars are in.'],
    ],
    yourigin: [
      [35, 'The demo is open to every visitor from Creative Universe, with example data only.'],
      [88, 'Sync is end-to-end encrypted.'],
      [228, 'Content exists once: Projects, Works and portfolios link to it.'],
    ],
    empatherapy: [[104, 'First idea for the gentle discovery tool.']],
    itl: [
      [66, 'HOPEIUM is now IntoTheLighthouse (I.T.L).'],
      [184, 'The home page has its “Get support now” button.'],
    ],
    youlogy: [
      [110, 'The spoken-word introduction is in the set list.'],
      [155, 'The invitation website is live.'],
    ],
    freeflow: [
      [96, 'The course is live and free.'],
      [214, 'All seven lessons filmed.'],
      [268, 'Started the course with Light Language.'],
    ],
  };
  for (const [key, list] of Object.entries(notes))
    await db.projects.update(project.get(key)!, { changeNotes: list.map(([d, text]) => ({ id: newId(), at: at(d), text })) });

  // Every record keeps the time it was really made and last worked on (linking above stamped some as "now").
  await db.transaction('rw', db.content, db.books, db.projects, db.collections, async () => {
    for (const p of PIECES) await db.content.update(piece.get(p.key)!, pieceTime(p));
    for (const t of workTimes) await db.books.update(t.id, { createdAt: t.createdAt, updatedAt: t.updatedAt });
    for (const p of PROJECTS) await db.projects.update(project.get(p.key)!, { createdAt: at(p.daysAgo), updatedAt: at(newest(p.key)) });
    for (const c of await db.collections.toArray()) await db.collections.update(c.id, { createdAt: at(120), updatedAt: at(2) });
  });

  await setSetting('onboarded', true);
  await setSetting('craft', 'words');
  const journey: DemoJourney = { project: project.get('freeflow')!, poem: piece.get(JOURNEY.poem)!, book: course, song: piece.get(JOURNEY.song)!, setlist: gig, portfolio };
  await db.settings.put({ key: JOURNEY_KEY, value: journey });
}
