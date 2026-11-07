import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { newId } from '../domain/text';
import { newPortfolio, headingItem, itemFromProject, type Portfolio, type PortfolioItem, type PortfolioPurpose } from '../portfolio/model';
import type { Project, ProjectColour, ProjectStatus } from '../domain/types';

// Portfolios are private drafts on this device until published (phase 2).
// These are the only functions that write them.

export async function createPortfolio(purpose: PortfolioPurpose, ownerName = ''): Promise<string> {
  const p = newPortfolio(purpose, ownerName);
  await db.portfolios.add(p);
  return p.id;
}

export type PortfolioPatch = Partial<Omit<Portfolio, 'id' | 'createdAt' | 'updatedAt' | 'publication'>>;

/** Edits the draft. What's published only changes when it's published again. */
export async function updatePortfolio(id: string, patch: PortfolioPatch): Promise<void> {
  await db.portfolios.update(id, { ...patch, updatedAt: Date.now() });
}

export async function addPortfolioItems(id: string, items: PortfolioItem[]): Promise<void> {
  await db.transaction('rw', db.portfolios, async () => {
    const p = await db.portfolios.get(id);
    if (!p) throw new Error('This portfolio no longer exists.');
    await db.portfolios.update(id, { items: [...p.items, ...items], updatedAt: Date.now() });
  });
}

interface StarterProject {
  title: string;
  category: string;
  colour: ProjectColour;
  status: ProjectStatus;
  description: string;
  portfolioDescription: string;
  section: string;
}

const STARTER_PROJECTS: StarterProject[] = [
  {
    title: 'YOU',
    category: 'Human development',
    colour: 'jade',
    status: 'building',
    section: 'Human development & digital ecosystems',
    description: 'A human development and community ecosystem bringing together personal growth, meaningful connection and shared experiences. Its wider vision includes a social community, events, a therapist directory, a marketplace, guided journeys and a playful system for recognising personal growth.',
    portfolioDescription: 'A human development and community ecosystem designed to help people turn self-understanding into lived experience. YOU brings together community, events, guided personal-development journeys, a therapist directory, a marketplace and an evolving avatar experience. The aim is to make growth feel welcoming, practical and connected rather than prescriptive.',
  },
  {
    title: 'YOUrigin',
    category: 'Creative technology',
    colour: 'ochre',
    status: 'building',
    section: 'Human development & digital ecosystems',
    description: 'A personal creative operating environment for capturing, organising and developing ideas, writing, lyrics, research, Works and larger Projects. It is being shaped as a connected home for a person’s creative life.',
    portfolioDescription: 'A personal creative operating environment that gives ideas, writing, lyrics, research and works a place to grow. YOUrigin connects quick capture with a structured library of Projects and Works, helping creative material move from fleeting note to developed body of work.',
  },
  {
    title: 'Hopeium',
    category: 'Wellbeing & digital experience',
    colour: 'lavender',
    status: 'idea',
    section: 'Human development & digital ecosystems',
    description: 'An early-stage, human-centred wellbeing and therapy concept exploring a warm, welcoming digital home for personal growth. The design direction favours simplicity, friendliness and emotional ease.',
    portfolioDescription: 'An early-stage wellbeing concept exploring how a digital experience can feel like a warm, welcoming home for human growth. Its visual direction is intentionally simple, friendly and calm, placing emotional ease ahead of immersive complexity.',
  },
  {
    title: 'Atlantean Gardens',
    category: 'Worldbuilding & botanical design',
    colour: 'moss',
    status: 'building',
    section: 'Creative ventures & worlds',
    description: 'A botanical brand and imaginative world built around characters, strain identities, collectible cards, packaging and an interactive Atlas of seven distinct realms.',
    portfolioDescription: 'A botanical brand expressed through an interconnected imaginative world. The project combines character design, strain identities, collectible cards, packaging and an interactive Atlas spanning seven distinct realms — bringing product identity and worldbuilding into one coherent experience.',
  },
  {
    title: 'Sweet Vital Nectar',
    category: 'Fragrance',
    colour: 'rose',
    status: 'building',
    section: 'Creative ventures & worlds',
    description: 'A fragrance venture centred on perfume and cologne roll-ons, with a warm, sensory brand identity and a direct-to-customer product offering.',
    portfolioDescription: 'A fragrance venture built around personal scent and sensory expression, with perfume and cologne roll-ons at its centre. The brand explores a warm, intimate product experience and a clear, approachable offering.',
  },
  {
    title: 'Rhythm Relics',
    category: 'Personalised gifts & design',
    colour: 'coral',
    status: 'building',
    section: 'Creative ventures & worlds',
    description: 'A personalised acrylic song-plaque product line that turns meaningful music into a tangible keepsake.',
    portfolioDescription: 'A personalised keepsake concept that turns meaningful songs into tangible objects. Rhythm Relics centres on acrylic song plaques, combining music, memory and custom design in a giftable product.',
  },
  {
    title: 'Empatherapy',
    category: 'Therapeutic wellbeing',
    colour: 'teal',
    status: 'building',
    section: 'Healing & wellbeing',
    description: 'A therapeutic and wellbeing venture founded by Cassidy Dugan, with a healing-fund commitment directing 10% of session revenue to the Empatherapy Healing Fund.',
    portfolioDescription: 'A therapeutic wellbeing venture founded by Cassidy Dugan, grounded in empathy, personal development and accessible support. The model includes a community-minded commitment: 10% of session revenue is directed to the Empatherapy Healing Fund.',
  },
];

const normaliseTitle = (value: string) => value.trim().toLocaleLowerCase();

/**
 * Creates a first portfolio from known venture information without replacing
 * existing Projects or editing an existing portfolio. Safe to run repeatedly:
 * matching Projects are reused and missing portfolio cards are appended once.
 */
export async function createStarterPortfolio(): Promise<{ portfolioId: string; createdProjects: number; addedItems: number }> {
  return db.transaction('rw', db.projects, db.portfolios, async () => {
    const [existingProjects, existingPortfolios] = await Promise.all([
      db.projects.toArray(),
      db.portfolios.toArray(),
    ]);
    const projectByTitle = new Map(existingProjects.map((project) => [normaliseTitle(project.title), project]));
    const now = Date.now();
    const resolved: Array<{ project: Project; seed: StarterProject }> = [];
    let createdProjects = 0;

    for (const seed of STARTER_PROJECTS) {
      let project = projectByTitle.get(normaliseTitle(seed.title));
      if (!project) {
        project = {
          id: newId(),
          title: seed.title,
          description: seed.description,
          category: seed.category,
          colour: seed.colour,
          status: seed.status,
          createdAt: now,
          updatedAt: now,
        };
        await db.projects.add(project);
        projectByTitle.set(normaliseTitle(seed.title), project);
        createdProjects += 1;
      }
      resolved.push({ project, seed });
    }

    const portfolioTitle = 'Cass Dugan — Selected Ventures & Creative Work';
    let portfolio = existingPortfolios.find((item) => normaliseTitle(item.title) === normaliseTitle(portfolioTitle));
    const isNewPortfolio = !portfolio;
    if (!portfolio) {
      portfolio = newPortfolio('business', 'Cass Dugan', now);
      portfolio.title = portfolioTitle;
      portfolio.theme = 'venture';
      portfolio.ownerLine = 'Founder · Creative builder · Human development';
      portfolio.intro = 'I build projects at the intersection of human development, creativity, technology and meaningful experiences. This portfolio brings together a selection of ventures and worlds I have been developing — from digital ecosystems that support personal growth to imaginative brands, products and wellbeing concepts.';
      portfolio.items = [];
    }

    const existingKeys = new Set(portfolio.items.filter((item) => item.kind === 'project').map((item) => item.sourceId));
    const nextItems: PortfolioItem[] = [...portfolio.items];
    let currentSection = '';
    let addedItems = 0;
    for (const { project, seed } of resolved) {
      if (existingKeys.has(project.id)) continue;
      if (seed.section !== currentSection) {
        nextItems.push(headingItem(seed.section));
        currentSection = seed.section;
      }
      const item = itemFromProject(project);
      item.description = seed.portfolioDescription;
      item.layoutSpan = 1;
      item.imageShape = 'landscape';
      nextItems.push(item);
      existingKeys.add(project.id);
      addedItems += 1;
    }

    if (isNewPortfolio) {
      portfolio.items = nextItems;
      await db.portfolios.add(portfolio);
    } else if (addedItems > 0) {
      portfolio.items = nextItems;
      await db.portfolios.update(portfolio.id, { items: nextItems, updatedAt: now });
    }

    return { portfolioId: portfolio.id, createdProjects, addedItems };
  });
}

/** A copy is always a new private draft, even when the original is published. */
export async function duplicatePortfolio(id: string): Promise<string> {
  const p = await db.portfolios.get(id);
  if (!p) throw new Error('This portfolio no longer exists.');
  const now = Date.now();
  const copy: Portfolio = {
    ...p,
    id: newId(),
    title: `${p.title} (copy)`.slice(0, 120),
    items: p.items.map((i) => ({ ...i, id: newId() })),
    publication: null,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.portfolios.add(copy);
  return copy.id;
}

/** Deletes a draft. A published portfolio has to be unpublished first, so no live link is left behind. */
export async function deletePortfolio(id: string): Promise<void> {
  const p = await db.portfolios.get(id);
  if (p?.publication) throw new Error('Unpublish this portfolio before deleting it, so its link stops working.');
  await db.portfolios.delete(id);
}

export function usePortfolios(): Portfolio[] | undefined {
  return useLiveQuery(() => db.portfolios.orderBy('updatedAt').reverse().toArray(), []);
}

/** undefined while loading, null when it doesn't exist. */
export function usePortfolio(id: string | undefined): Portfolio | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.portfolios.get(id)) ?? null) : null), [id]);
}
