/** What the phone's Share menu sent to YOUrigin (see public/share-target.js). */
export type SharedInbox = { text: string; files: File[] };

// Same name as in public/share-target.js.
const SHARE_INBOX = 'yourigin-share-inbox';

/**
 * Apps fill title/text/url differently (a browser sends the page title and its link,
 * a notes app only text, some put the link inside the text). Keep each part once.
 */
export function composeShared({ title = '', text = '', url = '' }: { title?: string; text?: string; url?: string }): string {
  const t = text.trim();
  const parts: string[] = [];
  if (title.trim() && !t.includes(title.trim())) parts.push(title.trim());
  if (t) parts.push(t);
  if (url.trim() && !t.includes(url.trim())) parts.push(url.trim());
  return parts.join('\n\n');
}

/** Take what was shared (once): it is removed from the inbox as it is read. */
export async function takeSharedInbox(): Promise<SharedInbox | null> {
  if (typeof caches === 'undefined' || !(await caches.has(SHARE_INBOX))) return null;
  const cache = await caches.open(SHARE_INBOX);
  const keys = await cache.keys();
  const metaKey = keys.find((k) => k.url.endsWith('/inbox/meta'));
  if (!metaKey) {
    await caches.delete(SHARE_INBOX);
    return null;
  }
  const meta = (await (await cache.match(metaKey))!.json()) as { title?: string; text?: string; url?: string; files?: number };
  const files: File[] = [];
  for (let i = 0; i < (meta.files ?? 0); i++) {
    const key = keys.find((k) => k.url.endsWith(`/inbox/file-${i}`));
    const res = key && (await cache.match(key));
    if (!res) continue;
    const blob = await res.blob();
    files.push(new File([blob], decodeURIComponent(res.headers.get('x-name') ?? `shared-${i + 1}`), { type: blob.type }));
  }
  await caches.delete(SHARE_INBOX);
  return { text: composeShared(meta), files };
}
