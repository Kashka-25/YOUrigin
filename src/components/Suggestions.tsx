import { useLiveQuery } from 'dexie-react-hooks';
import { Sparkles } from 'lucide-react';
import { db } from '../db/db';
import { acceptSuggestion, dismissSuggestion } from '../db/suggestions';
import { SuggestedChip } from './ui';
import { TYPE_LABEL } from '../domain/constants';
import type { ContentType } from '../domain/types';
import { providerFor } from '../ai';
import { recordSuggestions } from '../db/suggestions';
import type { ContentItem } from '../domain/types';
import { suggestProjects } from '../domain/projectSuggest';
import type { AIContext } from '../ai';
import type { Settings } from '../db/settings';

/** Pending AI suggestions for one piece — always opt-in, visually distinct. */
export function PendingSuggestions({ contentId, label = true }: { contentId: string; label?: boolean }) {
  const pending = useLiveQuery(
    () =>
      db.suggestions
        .where('contentId')
        .equals(contentId)
        .filter((s) => s.state === 'pending')
        .toArray(),
    [contentId],
  );
  const projects = useLiveQuery(() => db.projects.toArray(), []);
  const projectTitle = new Map((projects ?? []).map((p) => [p.id, p.title]));
  // A Project suggestion whose Project has since been deleted has nothing to offer.
  const shown = (pending ?? []).filter((s) => s.kind !== 'project' || projectTitle.has(s.value));
  if (!shown.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {label && (
        <span className="inline-flex items-center gap-1 text-xs text-ai">
          <Sparkles size={12} aria-hidden /> Suggested:
        </span>
      )}
      {shown.map((s) => (
        <SuggestedChip
          key={s.id}
          label={
            s.kind === 'tags'
              ? `#${s.value}`
              : s.kind === 'project'
                ? `Project: ${projectTitle.get(s.value)}`
                : `Type: ${TYPE_LABEL[s.value as ContentType] ?? s.value}`
          }
          onAccept={() => void acceptSuggestion(s.id)}
          onDismiss={() => void dismissSuggestion(s.id)}
        />
      ))}
    </div>
  );
}

/** Ask the active provider for tag + type suggestions and store them as pending. */
export async function suggestFor(item: ContentItem, ctx: AIContext, settings: Settings | undefined): Promise<void> {
  const provider = providerFor(settings);
  try {
    const [tags, type] = await Promise.all([provider.suggestTags(item, ctx), provider.classifyContent(item)]);
    await recordSuggestions(item.id, 'tags', tags, provider.id);
    if (type !== item.type) await recordSuggestions(item.id, 'type', [type], provider.id);
  } catch (e) {
    console.warn('Suggestions unavailable', e);
  }
}

/**
 * Notes shared in from the phone: which Projects might they belong to?
 * Worked out on the device; stored as pending suggestions only.
 */
export async function suggestProjectsFor(item: ContentItem): Promise<void> {
  try {
    const [library, projects] = await Promise.all([db.content.toArray(), db.projects.toArray()]);
    const found = suggestProjects(item, library, projects);
    await recordSuggestions(item.id, 'project', found.map((f) => f.projectId), 'local');
  } catch (e) {
    console.warn('Project suggestions unavailable', e);
  }
}
