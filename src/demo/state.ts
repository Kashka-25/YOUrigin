import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureBuiltIns } from '../db/db';
import { DEMO, DEMO_DB_NAME } from './mode';
import { seedExampleCreator } from './seed';

export type DemoChoice = 'example' | 'blank';
const KEY = 'demo';

/** null: the visitor hasn't chosen yet; undefined: still loading. */
export function useDemoChoice(): DemoChoice | null | undefined {
  return useLiveQuery(async () => ((await db.settings.get(KEY))?.value as DemoChoice | undefined) ?? null, []);
}

/** Only ever the demo's own database. */
function assertDemoDb(): void {
  if (!DEMO || db.name !== DEMO_DB_NAME) throw new Error('Demo actions only run in the demo.');
}

export async function startDemo(choice: DemoChoice): Promise<void> {
  assertDemoDb();
  if (choice === 'example' && (await db.content.count()) === 0) await seedExampleCreator();
  await db.settings.put({ key: KEY, value: choice });
}

/** Wipes the demo database (never the real one) and starts again from the welcome screen. */
export async function resetDemo(): Promise<void> {
  assertDemoDb();
  db.close();
  await db.delete();
  await db.open();
  await ensureBuiltIns();
}
