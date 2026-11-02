// Share to YOUrigin: Android's Share menu POSTs text, links and images to ./share-target.
// The service worker keeps them in a small cache "inbox" and opens Gathering, which
// takes them out (src/io/shareInbox.ts). Imported into the generated worker by Workbox.
const SHARE_INBOX = 'yourigin-share-inbox';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share-target')) return;
  event.respondWith(
    (async () => {
      const home = new URL('./', self.registration.scope);
      try {
        const form = await event.request.formData();
        const files = form.getAll('files').filter((f) => typeof f !== 'string' && f.size > 0);
        const cache = await caches.open(SHARE_INBOX);
        // One share at a time: a new share replaces anything Gathering never picked up.
        for (const old of await cache.keys()) await cache.delete(old);
        await cache.put(
          new URL('inbox/meta', home).href,
          new Response(
            JSON.stringify({
              title: String(form.get('title') || ''),
              text: String(form.get('text') || ''),
              url: String(form.get('url') || ''),
              files: files.length,
              at: Date.now(),
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
        );
        for (const [i, f] of files.entries())
          await cache.put(
            new URL(`inbox/file-${i}`, home).href,
            new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || `shared-${i + 1}`) } }),
          );
        return Response.redirect(new URL('#/?shared=1', home).href, 303);
      } catch {
        return Response.redirect(new URL('#/?shared=failed', home).href, 303);
      }
    })(),
  );
});
