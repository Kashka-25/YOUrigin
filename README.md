# YOUrigin — Your Creative Codex

> Where your ideas become something.

YOUrigin is a personal creative studio for turning poems, fragments, ideas, reflections, teachings, prompts and notes into structured books.

**Capture first. Organise second. Structure third. Refine last.**

It's a local-first, installable web app (PWA). It runs offline on an Android phone and a Windows laptop, and your writing never leaves the device unless you export it.

---

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 (or the next free port)
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run dev:lan` | Same, reachable from your phone on the same Wi‑Fi (no offline install over plain http) |
| `npm run build` | Type-check + production build into `dist/` (includes the offline service worker) |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` / `npm run lint` / `npm test` | Quality checks |
| `npm run icons` | Re-render PNG app icons from `public/icon.svg` |

**No environment variables are required.** (Sync uses the public Supabase URL and publishable key in `src/sync/config.ts`; override them with `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`.) The optional Claude API key is entered in *Settings → Creative assistant*. It's stored only on that device and never included in backups.

## Using it on your phone and laptop

The installable, offline app needs to be served over **HTTPS**. Build once and host the `dist/` folder on any static host, for example Netlify, Cloudflare Pages or GitHub Pages. The app uses relative paths and hash routing, so it works from any URL or sub-folder without extra configuration.

Then:

- **Samsung / Android:** open the URL in Chrome or Samsung Internet → menu → *Install app* / *Add to Home screen*.
- **Windows laptop:** open it in Edge or Chrome → install icon in the address bar.

Once installed, the app opens and works with no connection.

**Sync between devices:** *Settings → Sync between devices*. Sign in, then choose a sync passphrase on your first device and enter the same one on each other device. See [Sync](#sync) below. Without sync, you can still move work with *Download full backup* on one device and *Merge a backup* on the other.

## What's in V1

- **Gathering:** a distraction-free capture box. Typing `#tags` on their own line turns them into tags. Status and type are optional. Ctrl+Enter captures, Undo is available, and the draft survives a refresh. *Split on `---` / blank lines* captures many pieces at once.
- **Library:** search (words + `#tags`), filters for status, type, multi-tag intersection, book, collection, unclaimed and archived, plus sorting. Multi-select with shift-range selection and bulk actions: tag/untag, status, type, add to book/collection, archive, trash. Every bulk action can be undone.
- **Three creative states:** ● Seed / ◐ Developing / ◆ Polished. Each is always shown with a symbol and label, never colour alone.
- **Pieces:** autosave with a visible save state, title/type/status/tags/notes, book and collection membership, connections, and a version history with restore.
- **Books:** templates (Journal, Poetry Collection, Essay/Philosophy, Codex, Custom, YOU Journal), all editable, plus "save structure as template".
  - Drag-and-drop sections and pieces (mouse, touch and keyboard), a tray for claimed-but-unplaced pieces, and a material shelf.
  - The dashboard computes structure, writing and editing progress from real data and suggests a next best action.
- **Manuscript mode:** reads like a book, with a title page, contents and section breaks. Print or save as PDF.
- **Orphans:** unclaimed material, with suggested relationships and possible books and collections. Pattern clusters ("You have 8 pieces circling #grief") and repeated phrases. "Keep unassigned" is available.
- **Tags:** usage counts, rename (merges if the name exists), delete, families (Element, Theme, Archetype, Project, Material + your own), and multi-select to view an intersection.
- **Book Map:** a calm relationship graph of tags, books and collections.
- **Collections:** lightweight groupings that can become books.
- **Import:** many `.txt`, `.md` and `.docx` files at once. Optional splitting of one file into many pieces. The original text is preserved exactly.
- **Export:** book → Markdown / JSON / print-PDF; library → Markdown; full JSON backup with merge or replace.
- **Safety:** soft delete to Trash, confirmation before anything destructive, Undo toasts, revision history, and a request for persistent storage so the browser doesn't evict data.
- **Shortcuts:** Ctrl/⌘K or `/` for search; `N` or Alt+N for a new brain dump; Ctrl+Enter to capture.

## Importing a whole manuscript

Drop in one Word document (or .txt / .md) holding a whole collection or journal, and YOUrigin finds where each piece begins. It uses, in order of preference:

1. Word headings, or bold title lines.
2. Page breaks.
3. Separator lines (`***`, `⁂`…).
4. ALL-CAPS or numbered titles.
5. Blank-line gaps.

Chapters are recognised from the top heading level or "Chapter / Introduction / Closing…" lines. In the review list you can join, cut, rename or skip pieces before anything is saved. Each piece's type is guessed (prompts, rituals, reflections, poems…).

**Also build this as a book** creates the book with the chapters as sections and every piece placed in order. The text is always imported exactly as written.

## Design & print

Open a book → **Design & print**. Paged.js (CSS Paged Media) lays the book out as real pages, shown as spreads. Changes save automatically, and print or save as PDF at the true trim size.

The Design panel covers:

- **Page size and margins:** trim size, margins, mirrored gutters.
- **Typography:** EB Garamond / Cormorant Garamond / Newsreader, Cinzel headings, size, line spacing, poem and title alignment.
- **Chapters and flow:** chapter opening style and ornament, each piece on a new page, chapters on right-hand pages.
- **Running heads and page numbers:** book title on left pages, chapter on right pages.
- **Front pages:** title page, author, copyright, dedication, contents with page numbers.
- **Journals:** ruled writing lines after prompts, from 6 lines up to a full page.
- **Artwork:** a cover image, chapter-opener images, and image pieces placed anywhere (own page, full bleed, or between pieces).
- **Print services:** an optional 0.125in bleed with crop marks.

**Automatic image shrinking:** pictures are resized on the device to print resolution (at most 2700px, enough for a full 6×9in page at 300dpi) and re-compressed (WebP, keeping transparency). The app's own images are also optimised at build time.

## The creative assistant (AI)

The assistant **suggests**; it never writes on your behalf. Suggestions are stored as *pending* and look visibly different (dashed, ✦). Nothing is applied until you accept it.

| Function | On-device (default, offline) | Claude (optional) |
|---|---|---|
| `suggestTags` | theme lexicon + your existing tags | ✓ |
| `classifyContent` | shape/phrase heuristics | ✓ |
| `findRelatedContent` | tag + TF‑IDF word similarity | on-device |
| `suggestBookPlacement` | similarity to each book's pieces + section-name hints | on-device |
| `detectThemes`, `suggestStructure`, `detectRepetition` | clustering, n-grams | on-device |
| `suggestDevelopment` | gentle question templates | ✓ |
| `refine` | observations only (no rewriting) | drafts an alternative — saved as a linked **variant** or swapped in only after confirmation (the original goes to History) |

Providers implement one interface (`src/ai/types.ts`). If the Claude provider fails or you're offline, it falls back to on-device suggestions automatically.

## Architecture

- **Vite + React 19 + TypeScript**, a single-page app with hash routing. Hash routing keeps it host-agnostic and offline-safe.
- **Dexie (IndexedDB)** for local-first storage. The schema is versioned in `src/db/db.ts`.
- **Tailwind CSS v4** with design tokens as CSS variables (light/dark) in `src/index.css`. Bundled fonts (Newsreader + Inter) so it looks the same offline.
- **@dnd-kit** for accessible drag-and-drop with pointer, touch and keyboard sensors.
- **vite-plugin-pwa** (Workbox) precaches the app shell for offline use.

### Data model

Content is independent of structure. Books, collections and relationships only **reference** content ids, so a poem in three books exists once.

```
content        id, title, body, type, status, tagIds[], notes, source, keepUnassigned, archived, deletedAt, createdAt, updatedAt
tags           id, name (unique), familyId
tagFamilies    id, name, order
collections    id, name, description, contentIds[]
books          id, title, subtitle, description, type, templateId, cover, notes, archived
sections       id, bookId, title, order
entries        id, bookId, sectionId|null (null = tray), contentId, order        ← book → content references
relationships  id, fromId, toId, kind
templates      id, name, bookType, sections[], builtIn
suggestions    id, contentId, kind, value, state (pending|accepted|dismissed), provider
revisions      id, contentId, title, body, createdAt
settings       key, value
```

Every syncable record has `id` (UUID) + `createdAt` + `updatedAt`, which is what makes merging backups (and future sync) possible.

### Folder structure

```
src/
  domain/     pure logic: types, constants, text parsing, query/filter, progress, similarity, graph (unit-tested)
  db/         Dexie schema + repositories (the only code that writes data), backup/merge, sample material
  ai/         provider interface, on-device provider, Claude provider
  io/         import (txt/md/docx) and export (markdown/json/download)
  hooks/      live library context, autosave
  components/ shared UI (cards, dialogs, tag input, bulk bar, book builder parts)
  pages/      one file per screen
```

## Tests

`npm test` runs the domain unit tests and a **V1 acceptance test** against a real (in-memory) IndexedDB. It covers:

- 10 poems → 3 polished / 4 developing / 3 seeds
- tags, `#water` search, Developing + #grief filter
- 4 pieces → *YOU — Water*, a new Poetry Collection
- drag reordering, manuscript order
- orphans, related suggestions, persistence across reopen

There are also tests for trash and purge, exact import fidelity, opt-in AI suggestions, tag merge, merging a backup from a second device, and API-key exclusion from backups.

## Sample material

During onboarding you can choose *Explore with sample pieces*. *Settings → Remove sample material* deletes only those examples.

## Sync

Sync is optional and **end-to-end encrypted**: the server never sees readable writing.

- **Key:** a sync passphrase derives an AES-256-GCM key on the device (PBKDF2-SHA-256, 600k iterations). The key is non-extractable, and the passphrase is never stored or sent. The server keeps only a salt and an encrypted "verifier" so other devices can check the passphrase.
- **Server:** Supabase (`supabase/migrations/`). It has one table of encrypted records keyed by user/table/id, and a push function with last-write-wins on change time. Row-level security plus an email allowlist (`yourigin_private.yourigin_allowed_users`) means only allowed accounts can sync. Sign-in is shared with the YOU app's project; nothing of the YOU app is touched.
- **Change tracking:** a Dexie middleware (`src/sync/tracking.ts`) records every local add, put or delete on synced tables into an outbox kept in localStorage. Deletions are therefore synced too. Changes applied from the server are never re-queued.
- **Engine** (`src/sync/engine.ts`): pull → apply → push.
  - A newer unsent local edit is never overwritten by an older remote one.
  - When a newer remote version replaces different local wording, the local wording is saved to the piece's History first.
  - Tags or book placements created separately on two devices are merged deterministically.
- **When it runs:** a few seconds after a change, when you return to the app or come back online, and every minute while the app is open.
- **Not synced:** device settings, the Claude API key and the capture draft.

## V1.1 — next

- PDF import, voice capture/transcription.
- EPUB and print-ready PDF export with typographic control.
- Subsections; per-type progress lines (e.g. *Prompts 70%*); richer Book Map (zoom/pan, piece nodes).
- Claude-powered clustering, structure and repetition detection (currently on-device).
- Bulk "accept all suggestions" with review; tag-family drag-and-drop.
