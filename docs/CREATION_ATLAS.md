# Creation Atlas: design pass (draft for Cassidy)

Status: **proposal, nothing built.** Decisions needed are marked **Q1–Q6** at the end.

## What it is

The Creation Atlas shows **how things get made** in YOUrigin: where a piece came from, what it turned into, which Works it feeds, and which motifs keep coming back. It maps *creation*, not place (Wandering) or self (YOU).

It is read-only and offline. It only reads what is already in the Library, Projects and Works. Nothing is moved, copied or changed from the Atlas. Any "this might connect to that" hint is a dashed AI suggestion, the same as everywhere else.

## Keeping it distinct from the other Atlases

| | YOU: Living Atlas | Wandering: Atlas | Atlantean Gardens: Atlas | **YOUrigin: Creation Atlas** |
|---|---|---|---|---|
| Maps | your inner life (life areas, Pillars) | real places on the globe | characters, realms, strains | **pieces → drafts → Works** |
| Picture | landscape that grows greener; constellations, trees, seasons | geographic map, pins, parchment | fantasy world map | **printed plates: lineage lines, a loom, a motif table** |
| Words | regions, Seasons, Moments, Living | destinations, expeditions, Compass | realms | **plates, lineage, the loom, motifs, making** |

Hard "nevers": no geographic map, pins or legends of status; no landscape that grows; no constellations or star charts (YOU has them); no "realms" (Creative Universe uses that word); no parchment or field-note styling (Wandering's look).

Instead it borrows from **the atlas as a printed book**: a set of numbered *plates*, each one a precise diagram in YOUrigin's own Quiet Observatory palette (night ink, gold hairlines, serif captions). This fits a book-making app and owes nothing to maps.

## The plates

**Plate I: Lineage** (one piece's family tree, read left to right)
- Starts from any piece ("See its lineage" on the piece page).
- Shows what it came from and what came from it, using links that already exist: `variant`, `continues`, `echoes`, `idea` relationships, AI variants (`derivedFromId`) and saved revisions.
- Ends where the piece sits in Works (book chapter, album track, set list slot).
- On the phone: a vertical list with indented branches. On the laptop: a horizontal diagram.

**Plate II: The Loom** (how the making moved through time)
- Each Project is a horizontal thread (the warp) running through time.
- Each piece is a small knot on its Project's thread, placed by when it was gathered. Its fill shows Seed → Developing → Polished.
- A knot that went into a Work gets a fine line down to that Work's band, so you can see raw notes becoming a book or an album.
- Range: last month, season or year, or all time. On the phone the Loom scrolls sideways one Project per row.

**Plate III: Motifs** (what keeps coming back)
- A quiet table: motifs (your most-used tags, plus repeated keywords as dashed suggestions) down the side, Works across the top, and a dot where a motif appears, sized by how often.
- Tap a dot to list the pieces. This replaces a force-graph hairball and stays legible on a phone.

**Optional Plate IV: Unplaced** (what hasn't found a home yet). It overlaps the Orphans page, so it may just link there.

## Where it lives

- A route **`/atlas`** called "Creation Atlas" in Studio tools, replacing **Book Map** (`/map`), whose tag graph becomes Plate III. `/map` redirects to `/atlas`.
- **My Universe** stays as the welcome overview and links into the Atlas plates.
- Pure logic in `src/domain/atlas.ts` (lineage walk, loom rows, motif table) with unit tests. Drawn as inline SVG with no new dependency, so it stays light and works offline.
- No schema change for Plates I–III: everything comes from existing tables.

## Build order once agreed

1. Plate I, Lineage (smallest, most useful on the phone).
2. Plate III, Motifs (replaces Book Map).
3. Plate II, The Loom (the largest, and the most "atlas").

## Decisions for Cassidy

- **Q1.** Is the "printed plates" metaphor right, or would you rather the Atlas had a single big picture?
- **Q2.** Should the Atlas replace **Book Map** (recommended), or should the two sit side by side?
- **Q3.** Are the names *Lineage*, *The Loom* and *Motifs* right, or do you want your own words?
- **Q4.** Should the Loom show only Projects, or Works as their own threads too?
- **Q5.** Should motifs come only from your tags, or also from suggested repeated words (shown dashed)?
- **Q6.** Should a plate be printable or exportable (PDF or image) for the portfolio or Creative Universe later?
