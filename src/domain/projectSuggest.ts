import type { ContentItem, Project } from './types';
import { buildIndex, mostSimilar, similarity } from './similarity';

export interface ProjectSuggestion {
  projectId: string;
  score: number;
}

/** A word-for-word mention of a Project's name ("for Rhythm Relics: …") is the strongest hint there is. */
function mentions(text: string, title: string): boolean {
  const norm = (s: string) => ` ${s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const t = norm(title);
  return t.trim().length >= 3 && norm(text).includes(t);
}

/**
 * Which Projects might a new note belong to? Only a suggestion: nothing is linked
 * until Cassidy accepts it. Each Project is judged by
 *  - how close the note is to the pieces already in it (its three nearest), and
 *  - how close it is to the Project's own words (title, description, its pieces' tags),
 * with a strong boost when the note names the Project.
 */
export function suggestProjects(
  note: ContentItem,
  library: ContentItem[],
  projects: Pick<Project, 'id' | 'title' | 'description'>[],
  { limit = 2, threshold = 0.12 }: { limit?: number; threshold?: number } = {},
): ProjectSuggestion[] {
  const already = new Set(note.projectIds ?? []);
  const live = library.filter((i) => i.id !== note.id && !i.deletedAt && !i.archived);
  const candidates = projects.filter((p) => !already.has(p.id));
  if (!candidates.length) return [];

  const members = new Map<string, ContentItem[]>();
  for (const item of live) for (const pid of item.projectIds ?? []) members.set(pid, [...(members.get(pid) ?? []), item]);

  // Each Project also gets a stand-in "piece" made of its own words, so a brand-new Project can still be found.
  const standIn = (p: (typeof candidates)[number]): ContentItem => {
    const own = members.get(p.id) ?? [];
    return {
      ...note,
      id: `project:${p.id}`,
      title: p.title,
      body: [p.description, ...own.map((i) => i.title)].join('\n'),
      tagIds: [...new Set(own.flatMap((i) => i.tagIds))],
      projectIds: [],
    };
  };
  const index = buildIndex([note, ...live, ...candidates.map(standIn)]);
  const text = `${note.title}\n${note.body}`;

  const out: ProjectSuggestion[] = [];
  for (const p of candidates) {
    const own = (members.get(p.id) ?? []).map((i) => i.id);
    const nearest = mostSimilar(index, note.id, own, 3, 0);
    const pieces = nearest.length ? nearest.reduce((sum, n) => sum + n.score, 0) / nearest.length : 0;
    const words = similarity(index, note.id, `project:${p.id}`);
    let score = 0.6 * pieces + 0.4 * words;
    if (mentions(text, p.title)) score += 0.5;
    if (score >= threshold) out.push({ projectId: p.id, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
