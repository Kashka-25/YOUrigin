# YOUrigin roadmap

See `CLAUDE.md` for context and ground rules.

## Done (merged PRs)

**V1 and phone/desktop (1–2 Nov 2026)**
- [x] #1 Share to YOU: written work can bring an image
- [x] #2 Phone capture: share into YOUrigin, icon shortcuts, speak a piece
- [x] #3 Desktop writing workspace: outline, open piece and printed pages side by side
- [x] #4 Publishing exports: Word manuscript (.docx) and ebook (.epub)
- [x] #5 Ready to publish: chapter sizes and a publishing checklist

**Revamp and Projects (6 Nov 2026)**
- [x] #6 Full revamp: "Quiet Observatory" creative sanctuary
- [x] #7 Separate Projects from Works and simplify note organisation
- [x] #8 More Project colours; music library with gig set lists
- [x] #9 Restore clear category homes for Projects
- [x] #10 Unify Works into Projects without losing creative work
- [x] #11 Give existing Works their own Project homes (Dexie v4 migration)

**Portfolios (7 Nov 2026)**
- [x] #13 Phase 1: private drafts, editor and visitor preview
- [x] #14 Phase 2: server, publishing and revoking access (`yourigin-portfolio` function)
- [x] #15 Phase 3: the public portfolio page
- [x] #16 Portfolio page: don't reload on an unchanged link
- [x] #17 Refine portfolio showcase
- [x] #18 Drag-and-design portfolio canvas
- [x] #19 Project cover images in portfolios
- [x] #20, #21 One-click starter portfolio import
- [x] #22 Designer, covers, starter import and publishing together
- [x] #23 Choose the page background
- [x] #24 Starter import: covers and links for each venture

## Next

- [ ] **Creation Atlas** design pass: draft in `docs/CREATION_ATLAS.md`, awaiting Cassidy's decisions (Q1–Q6)
- [ ] **Creation Atlas** build, after the design is agreed
- [ ] **Lyric space** on the existing `song` type plus `album` / `setlist` Works
- [ ] **Phone-note sorting**: Project suggestions for notes shared in from the phone
- [ ] **Creative Universe link**: link a Project to its Creative Universe destination, keep change notes on it, publish a snapshot Creative Universe reads at build time (extends the Portfolios publish path)
- [ ] **Entry key / demo mode**: demo built (`?demo`: example person or blank, separate local database, no network writes, Reset, back to Creative Universe). Entry key still open: a gate hook is ready in `src/demo/mode.ts` (`demoAccessAllowed`), awaiting Cassidy's decision
- [ ] **Issue #12**: integrated Showcase portfolio across YOUrigin and YOU
- [ ] Optional: rename the `/initiatives` route so Projects live at a clearer path (the Work editor currently owns `/projects/:id`)
