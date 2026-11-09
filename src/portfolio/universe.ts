// Export a portfolio as the starter pack Creative Universe reads at build time
// (its `npm run content:import`). The format is YOUrigin's own starter format, so
// what Creative Universe already understands keeps working; three optional fields
// per Project carry the new link: `realm`, `slug` and `changes`.
//
// Only what the portfolio shows goes out: its headings, its Project cards and the
// words written for them, each Project's public details and cover, and the change
// notes kept on the Project. Never pieces, notes to self or anything private.
// Pure (no database, no network), so it can be tested.

import type { Project } from '../domain/types';
import { slugify } from '../domain/universe';
import { normalizeHttps, type Portfolio } from './model';
import { STARTER_FORMAT } from './starter';

export interface UniverseChange {
  /** YYYY-MM-DD */
  date: string;
  text: string;
}

export interface UniverseProject {
  title: string;
  category: string;
  colour?: string;
  status: string;
  description: string;
  portfolioDescription: string;
  link?: string;
  cover?: string;
  realm?: string;
  slug?: string;
  changes?: UniverseChange[];
}

export interface UniversePack {
  format: typeof STARTER_FORMAT;
  key: string;
  title: string;
  purpose: string;
  theme: string;
  ownerName: string;
  ownerLine: string;
  intro: string;
  /** Where it came from and when, for Creative Universe's records. */
  source: 'yourigin';
  exportedAt: string;
  sections: { heading: string; projects: UniverseProject[] }[];
}

export interface UniverseExport {
  pack: UniversePack;
  /** Items in the portfolio that aren't Projects: Creative Universe's pack holds Projects only. */
  skipped: number;
  /** Project cards whose Project no longer exists. */
  missing: number;
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function buildUniversePack(
  p: Portfolio,
  projects: Map<string, Project>,
  /** A Project's cover as a data: URL, when it has one. */
  coverOf: (project: Project) => string | undefined,
  now = Date.now(),
): UniverseExport {
  const sections: UniversePack['sections'] = [];
  let current: UniversePack['sections'][number] | null = null;
  let skipped = 0;
  let missing = 0;
  for (const item of p.items) {
    if (item.kind === 'heading') {
      current = { heading: item.heading.trim() || p.title, projects: [] };
      sections.push(current);
      continue;
    }
    if (item.kind !== 'project') {
      skipped++;
      continue;
    }
    const project = projects.get(item.sourceId);
    if (!project) {
      missing++;
      continue;
    }
    if (!current) {
      current = { heading: p.title, projects: [] };
      sections.push(current);
    }
    const title = item.heading.trim() || project.title;
    const out: UniverseProject = {
      title,
      category: project.category,
      ...(project.colour ? { colour: project.colour } : {}),
      status: project.status,
      description: project.description,
      portfolioDescription: item.description,
    };
    const link = item.destinationUrl ? normalizeHttps(item.destinationUrl) : null;
    if (link) out.link = link;
    const cover = item.image === 'none' ? undefined : coverOf(project);
    if (cover) out.cover = cover;
    if (project.universe) {
      out.realm = project.universe.realm;
      // Only an address that differs from the title's own needs saying.
      if (project.universe.slug && project.universe.slug !== slugify(title)) out.slug = project.universe.slug;
    }
    const changes = (project.changeNotes ?? []).filter((n) => n.text.trim()).sort((a, b) => b.at - a.at);
    if (changes.length) out.changes = changes.map((n) => ({ date: day(n.at), text: n.text.trim() }));
    current.projects.push(out);
  }
  return {
    pack: {
      format: STARTER_FORMAT,
      key: p.starterKey || `yourigin-${p.id}`,
      title: p.title,
      purpose: p.purpose,
      theme: p.theme,
      ownerName: p.ownerName,
      ownerLine: p.ownerLine,
      intro: p.intro,
      source: 'yourigin',
      exportedAt: new Date(now).toISOString(),
      sections: sections.filter((s) => s.projects.length),
    },
    skipped,
    missing,
  };
}

/** "cassidy-ventures-v1" → "cassidy-ventures.json": the same name as the starter file it replaces. */
export function universeFileName(pack: UniversePack): string {
  return `${slugify(pack.key).replace(/-v\d+$/, '') || 'portfolio'}.json`;
}
