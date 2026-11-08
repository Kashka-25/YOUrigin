import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureBuiltIns } from './db';
import { createContent } from './content';
import { addItemsToProject, createProject, deleteProject } from './projectRecords';
import { acceptSuggestion, dismissSuggestion } from './suggestions';
import { suggestProjectsFor } from '../components/Suggestions';
import { suggestProjects } from '../domain/projectSuggest';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureBuiltIns();
});

const note = (body: string, tagNames: string[] = []) => createContent({ body, type: 'note', status: 'seed', tagNames, source: { kind: 'capture' } });
const pending = async (contentId: string) =>
  (await db.suggestions.where('contentId').equals(contentId).toArray()).filter((s) => s.kind === 'project' && s.state === 'pending');

async function garden() {
  const gardens = await createProject({ title: 'Atlantean Gardens', description: 'Botanical blends, seeds and the greenhouse.' });
  const band = await createProject({ title: 'Rhythm Relics', description: 'Vintage drums and the gig van.' });
  const a = await note('Seed packets for the greenhouse: basil, lavender, chamomile blends.', ['botanical']);
  const b = await note('Greenhouse watering rota and seed trays for spring.', ['botanical']);
  const c = await note('Snare drum restoration, the gig on Friday, drum heads to order.', ['drums']);
  await addItemsToProject(gardens, [a, b]);
  await addItemsToProject(band, [c]);
  return { gardens, band };
}

describe('Project suggestions for shared-in notes', () => {
  it('finds the Project whose pieces are closest, and only suggests', async () => {
    const { gardens } = await garden();
    const id = await note('More lavender seed for the greenhouse trays.');
    const item = (await db.content.get(id))!;
    const found = suggestProjects(item, await db.content.toArray(), await db.projects.toArray());
    expect(found[0]?.projectId).toBe(gardens);

    await suggestProjectsFor(item);
    expect((await pending(id)).map((s) => s.value)).toContain(gardens);
    // Nothing is linked until accepted.
    expect((await db.content.get(id))!.projectIds ?? []).toEqual([]);
  });

  it('recognises a Project named in the note, even a new empty one', async () => {
    const lighthouse = await createProject({ title: 'IntoTheLighthouse' });
    const id = await note('Idea for IntoTheLighthouse: a night-time onboarding screen.');
    const found = suggestProjects((await db.content.get(id))!, await db.content.toArray(), await db.projects.toArray());
    expect(found.map((f) => f.projectId)).toEqual([lighthouse]);
  });

  it('suggests nothing for an unrelated note, or for Projects it already belongs to', async () => {
    const { gardens } = await garden();
    const lonely = await note('Phone bill due on Tuesday.');
    expect(suggestProjects((await db.content.get(lonely))!, await db.content.toArray(), await db.projects.toArray())).toEqual([]);

    const inside = await note('Lavender seed for the greenhouse.');
    await addItemsToProject(gardens, [inside]);
    const found = suggestProjects((await db.content.get(inside))!, await db.content.toArray(), await db.projects.toArray());
    expect(found.map((f) => f.projectId)).not.toContain(gardens);
  });

  it('accepting links the note to the Project; dismissing leaves it alone', async () => {
    const { gardens } = await garden();
    const id = await note('Lavender seed for the greenhouse trays.');
    await suggestProjectsFor((await db.content.get(id))!);
    const [s] = await pending(id);
    await acceptSuggestion(s.id);
    expect((await db.content.get(id))!.projectIds).toEqual([gardens]);

    const other = await note('Chamomile seed for the greenhouse.');
    await suggestProjectsFor((await db.content.get(other))!);
    const [t] = await pending(other);
    await dismissSuggestion(t.id);
    expect((await db.content.get(other))!.projectIds ?? []).toEqual([]);
    // A dismissed Project is not suggested again for that note.
    await suggestProjectsFor((await db.content.get(other))!);
    expect(await pending(other)).toEqual([]);
  });

  it('a suggestion for a deleted Project is dropped, not applied', async () => {
    const { gardens } = await garden();
    const id = await note('Lavender seed for the greenhouse trays.');
    await suggestProjectsFor((await db.content.get(id))!);
    const [s] = await pending(id);
    await deleteProject(gardens);
    await acceptSuggestion(s.id);
    expect((await db.content.get(id))!.projectIds ?? []).toEqual([]);
    expect((await db.suggestions.get(s.id))!.state).toBe('dismissed');
  });
});
