# YOUrigin — Your Creative Codex

Local-first, installable PWA where Cassidy's poems, lyrics, fragments, notes and research land, then grow into Projects and finished Works. Used daily on a Samsung phone and a Lenovo laptop, offline first.

## Place in the ecosystem

- One world inside **Creative Universe**, Cassidy's central portfolio hub: https://github.com/Kashka-25/creative-universe (local: `C:\Users\cassi\Projects\CreativeUniverse`).
- Sibling of the **YOU** app (https://yourownuniverse.life/). Both share the "YOU" Supabase project `yikoymzktspamahrsuje`; YOUrigin's tables are `yourigin_`-prefixed.
- Proposal doc for the ecosystem: https://claude.ai/artifact/Bz16tnjtbRq71HYoFKsvVc
- Roadmap: `docs/ROADMAP.md`.

## Stack and commands

Vite + React 19 + TypeScript + Dexie (IndexedDB) + Tailwind 4, vite-plugin-pwa, Vitest (jsdom, fake-indexeddb). GitHub Pages deploys on every push to `main` (`.github/workflows/deploy.yml`), so `main` is always live.

| Command | Use |
|---|---|
| `npm run dev` | Dev server. Use port **5199** (`.claude/launch.json`); 5173 belongs to the YOU app |
| `npm run dev:lan` | Dev server reachable from the phone on Wi-Fi |
| `npm run build` | `tsc -b` + production build into `dist/` |
| `npm run typecheck` / `npm run lint` | Quality checks |
| `npm test` | `vitest run` (all unit tests) |
| `npm run brand` | Regenerate logo cut-out and icons |

## Architecture pointers

- `src/App.tsx` — routes (HashRouter). Quirk: the Projects list is `/initiatives` and a Project home is `/initiative/:id`, while `/projects/:id` is the Work editor (`src/pages/BookBuilder.tsx`).
- `src/db/db.ts` — Dexie schema. Change it only via a new `this.version(n)`; v4 runs `migrateLegacyWorksToProjects` (Works live inside Projects, PRs #7, #10, #11). v5 adds `portfolios`.
- `src/db/` — data access (`content.ts`, `projectRecords.ts`, `books.ts`, `portfolios.ts`, `backup.ts`, ...).
- `src/domain/` — pure logic: `types.ts` (item types incl. `song`; ProjectKind incl. `album`, `setlist`), `projects.ts`, `similarity.ts`, `graph.ts`.
- `src/sync/` — E2E-encrypted sync: `crypto.ts` (AES-GCM, passphrase-derived key), `engine.ts`, `outbox.ts`, `supabase.ts`, `config.ts`. `buildNotes.ts` sends edit notes to Notion Build Notes via YOU's `send-build-note` function.
- `src/ai/` — creative assistant (`local.ts` heuristics, `claude.ts` optional API key kept on the device).
- `src/io/` — import/export, `shareInbox.ts` (phone share-in), `publish.ts`.
- `src/portfolio/`, `src/components/portfolio/`, `src/pages/Portfolio*.tsx` — Portfolios (PRs #13–#24). `p/index.html` is the standalone public portfolio page.
- `src/showcase/` — Showcase model/API (see issue #12).
- `supabase/functions/yourigin-portfolio/` — Edge Function that serves published portfolio snapshots; `supabase/migrations/` holds the `yourigin_` schema.
- `starters/` — personal starter portfolio packs. Gitignored on purpose: never commit them.

## Ground rules

- **Local-first and offline.** Everything works with no connection; the network is optional.
- **Content exists once.** Link, place or reference pieces; never duplicate them across Projects, Works or portfolios.
- **AI only suggests.** The assistant proposes; Cassidy decides. No silent changes to her work.
- **Never weaken E2E encryption.** Plaintext content never reaches Supabase; no key escrow, no logging of passphrases or decrypted data.
- **Port 5199** for dev; don't take 5173.
- **Changes go through a branch + PR** to `main` (every merge deploys). Run `npm test` (and `npm run typecheck`, `npm run lint`) before opening a PR.
- Real data on devices is precious: schema changes need a Dexie migration and a test.

## Decisions (8 Nov 2026)

- **Creation Atlas** stays inside YOUrigin. Not built yet; needs a design pass first. Keep it distinct from YOU's "Living Atlas" and the Wandering Atlas.
- **Lyric space** to be built on the existing `song` type plus `album` / `setlist` Works.
- **Phone notes** shared in should get Project suggestions.
- **YOUrigin is the source of updates for Creative Universe**: link a Project to its Creative Universe destination, keep change notes on it, and publish a snapshot Creative Universe reads at build time, building on the existing Portfolios publish path.
- **Entry key / demo mode**: portfolio visitors can try YOUrigin as a blank or example user, fully local, never touching real data.
- HOPEIUM is now **IntoTheLighthouse (I.T.L)**.
