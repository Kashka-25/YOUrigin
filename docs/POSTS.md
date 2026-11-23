# Posts

Plan, write, review and approve social media posts (Instagram) inside YOUrigin. Posts live on the device and sync end-to-end encrypted like everything else; nothing is published from the app.

## The weekly flow

1. Media goes into the Google Drive "To post" folder.
2. Claude drafts the week and saves a **drafts file** (format below), usually with its slides and videos beside it and as one **.zip**.
3. In **Posts → Import drafts**, pick the drafts file **together with its images and videos**, or the **.zip** (easiest on the phone), or use **Import a folder** on the laptop. The review shows each draft with the media found for it. Every post kept arrives as a **Draft**, whatever the file says. Re-importing the same file adds nothing and never overwrites edits, except for drafts you've set aside: those come in again as fresh copies.
   - Posts imported without their media keep the file names; **Add media** on the Posts page fills them in later, matching by file name.
   - **Redrawn slides:** importing a drafts file again with new pictures offers **Update pictures** on posts already here. It swaps in the new pictures and keeps your words, date and status; old pictures nothing uses are removed. This is how edits round-trip: change the hook or write in **Notes to self**, Claude redraws the slides under the same draft key, and you import the update.
4. Edit each draft, then **Approve** it.
5. **Export approved** saves the approved posts in a date range as `.json` (for scheduling in Metricool, later) and `.md` (readable). Exporting changes nothing and sends nothing.
6. Once a post is live, **Mark posted** and paste its link.

## Views

- **Week**: Monday to Sunday, each day labelled with its content world (Mon Healing, Tue Digital Homes, Wed Worlds & Stories, Thu Music & Sound, Sat Coco & the Making; Fri and Sun for Stories). Tap + on a day for a new post with that day's world and placeholder time.
- **Month**: a calendar; tap a day to see and add its posts.
- **Grid**: the profile as followers will see it, newest top-left, three across. Drag a post (laptop) or tap **Arrange**, tap a post, then tap where it should go (phone). Moving a post gives it that place's planned time, and the posts in between shift along, so the grid order is the schedule. Posted posts stay put. Stories aren't shown, as they don't appear in the profile grid.
- **Board**: Idea, Draft, Approved, Posted. On the phone, one column at a time.

Posted times are placeholders until real insights are in (`WEEK_PLAN` in `src/posts/model.ts`).

## Accounts

Each post belongs to one Instagram account. The row of @ buttons at the top of Posts picks the account, and every view (Week, Month, Grid, Board, Ideas) then shows only that account's posts, so each account has its own profile grid. New posts, ideas and imported drafts go on the account being shown. Gallery is the shared picture library, so it doesn't change.

- It starts with **@_freethedream_** (colour travel, creation, music, talking heads) and **Poetry** (black-and-white photos with a Whisper line). The pencil beside the buttons renames an account, sets its @handle, or adds another. Names and handles sync to every device.
- Move a post from the editor (**Account** row), or select several on the Board or in Ideas and choose **Or move to account**.
- In the Grid, **Ideas** shows posts that have no date yet ahead of the planned ones, marked **No date**, to preview how the account could look. It is on at first for every account except the main one.
- Posts from before accounts existed belong to the main account. A one-time banner offers to move posts whose notes start with “Poem idea:” to Poetry; nothing moves until you tap Move.

## Making a post

Laid out like Instagram's "New post" so it feels familiar:

- **Photos and videos first**, at the very top: add them, see the selected one large (swipe or use the arrows), and arrange them in the strip below by dragging. **+** adds more; the bin removes the one shown. Dropping files on it works on the laptop. Adding media sets the format the way Instagram does: a video makes a Reel, several pictures a carousel, one picture a single image (quote cards and Stories stay as chosen).
- **Caption** next, then everything else in rows you tap open: Schedule, Format and world, On-image hook, Call to action, Hashtags, Alt text, Linked pieces, Files in Drive, Notes to self and Status. Each row shows a short summary while closed.
- **Cover** (for a video): like Instagram's Edit cover. **Choose from video** opens a filmstrip and slider over the video; slide to a moment (it shows large above) and **Use this frame**. Or **Upload a picture**. The cover is a picture, so it syncs to every device and is what the grid and lists show.
- **Preview** (top right) shows the post with its caption as followers will see it.

## Ideas

The **Ideas** tab is a place for photos and videos you might post one day. **Jot a post idea…** keeps an idea in words alone. **From Gallery** turns pieces in the Gallery into ideas that point at the same picture or video (nothing is copied); photos and videos shared to YOUrigin from the phone's gallery land in the Gallery, ready for this.

The **Gallery** tab (beside Ideas) shows every picture and video in YOUrigin; **Add photos & videos** adds more from the device. Tap **Select** (or long-press a picture) and tap pictures in slide order: with one chosen, **Make an idea**; with several, **Make a carousel** appears and opens the new post, slides in that order (or **Make separate ideas**). **Add ideas** (or drop files on it) turns each into its own undated Idea, shown like a camera roll. Tap one to open it, or **Select** several and **Combine into one post** to make a carousel in the order you tapped them; the others are set aside.

To go the other way, open a post and tap **Take slides out** under its slides, then tap the slides to take. **Back to Ideas** makes each one its own Idea again; **Make their own carousel** (or **Make its own post** for one) puts them together in a new post in Ideas. Slides are moved, not copied, keep any words on them, and stay in the same world and account. The toast's **Undo** puts them back.

## Seeing what you're making

- Every post opens with a **preview** as followers will see it: swipe or use the arrows through a carousel's slides, or play the Reel, with the caption, call to action and hashtags underneath. It updates as you edit.
- The Week, Month and Board views show each post's first picture; the Grid shows the profile with real pictures (a video's still frame).
- **Pictures** are ordinary stored images: they sync to every device, end-to-end encrypted.
- **Videos reach every device** (schema v8). A video is stored as it is on the device it was added on (`clips`, not synced or in backups: too large for record sync). With sync on, that device also sends an **encrypted cloud copy**: the video is cut into 4 MB pieces, each locked with the sync passphrase (AES-GCM, the video id and piece number bound in) and uploaded to a private bucket; Supabase only ever holds ciphertext. A small synced record (`clipInfo`) tells the other devices the video exists and when its copy is complete. On another device the post shows its cover and **Get this video here (size)**; it downloads, unlocks and is kept on that device. Uploads and downloads go piece by piece and resume where they stopped; they run while YOUrigin is open.
  - **Settings → Sync → Videos** (per device): bring videos in automatically (off by default, to save phone data), how long a posted video's cloud copy is kept (14 days by default; devices that have it keep theirs), how much is in the cloud, and what's moving now. A video no post uses any more leaves the cloud after a day.
  - If a cloud copy has gone (or sync is off), the note still offers **Add … here**: pick the same video file and it's stored under the same video.
  - Starting sync over (forgotten passphrase) removes the cloud copies too; videos still on a device go up again under the new passphrase.

## A post

| Field | Notes |
| --- | --- |
| Date and time | Local time; empty while it is an unplaced idea |
| Status | Idea → Draft → Approved → Posted (and back) |
| Format | Reel, Carousel, Quote card, Single image, Story |
| Content world | Healing, Digital Homes, Worlds & Stories, Music & Sound, Coco & the Making |
| On-image hook | Can be picked from a line of a linked piece; a quote card notes when that line is no longer in the piece |
| Caption, call to action, hashtags, alt text | Caption counter (2,200) and hashtag counter (30) |
| Link | Where the post sends people (a site, a demo, a course). Open and Copy buttons; shown as a link sticker in the preview. Instagram doesn't make caption links clickable, so it's for a Story link sticker or the bio. Exported with the post |
| Linked pieces | Links to poems, fragments, lyrics by id. Content exists once: the post never copies them |
| Media | Images stored in YOUrigin, videos, or a file name (for example in Drive). Shown in order, and reordered with the arrows |
| Notes to self | Never exported |

Gentle checks (never blocking): a caption that touches on crisis without a helpline; cannabis words (Instagram restricts cannabis promotion); missing alt text; over the caption or hashtag limits.

## Drafts file format (for Claude)

A JSON file. A full example with invented text: [`samples/post-drafts.sample.json`](samples/post-drafts.sample.json).

```json
{
  "app": "YOUrigin",
  "kind": "post-drafts",
  "version": 1,
  "week": "2026-11-23",
  "posts": [
    {
      "key": "2026-11-23-healing-quote",
      "date": "2026-11-23",
      "time": "19:00",
      "format": "quote-card",
      "world": "Healing",
      "hook": "…",
      "caption": "…",
      "hashtags": ["#…"],
      "altText": "…",
      "cta": "…",
      "link": "https://…",
      "pieces": [{ "title": "…" }],
      "media": [{ "name": "file-in-drive.jpg", "note": "optional" }],
      "notes": "optional, to Cassidy"
    }
  ]
}
```

- `kind` must be `"post-drafts"`. `version` is 1.
- `key`: a stable, unique name for the draft. It is how a re-import knows a draft is already in. Use `date-world-format`.
- `date` (`YYYY-MM-DD`) and `time` (`HH:MM`, local) are optional; without a date the post is an unplaced idea.
- `format`: `reel`, `carousel`, `quote-card`, `single-image`, `story` (labels such as "Quote card" work too).
- `world`: `healing`, `digital-homes`, `worlds-stories`, `music-sound`, `coco-making` (labels such as "Worlds & Stories" work too).
- `hashtags`: a list, or one string.
- `pieces`: pieces already in YOUrigin, by `{ "id": "…" }` or `{ "title": "…" }` (or just the title as a string). A title links only when exactly one piece has it; otherwise the review shows it to link by hand. Import never creates pieces.
- `media`: file names (or `{ "name", "note" }`), in slide order. Picked or zipped files are matched by file name only (folders and letter case don't matter); a file used by several posts is stored once.
- `status` is ignored: every draft arrives as a Draft.

Unknown formats, worlds or dates don't stop the import: the review shows a note and a safe default.

## Export format (`kind: "post-schedule"`)

```json
{
  "app": "YOUrigin", "kind": "post-schedule", "version": 1,
  "exportedAt": "…", "timeZone": "Europe/London", "from": "2026-11-23", "to": "2026-12-06",
  "posts": [
    {
      "id": "…", "date": "2026-11-23", "time": "19:00", "scheduledAt": "2026-11-23T19:00:00+00:00",
      "format": "Quote card", "world": "Healing",
      "hook": "…", "caption": "…", "hashtags": ["#…"],
      "fullCaption": "caption, call to action and hashtags, ready to paste",
      "altText": "…", "cta": "…",
      "media": [{ "name": "…", "storedInYOUrigin": false }],
      "pieces": ["titles of linked pieces"]
    }
  ]
}
```

Only Approved posts with a time in the range are included. Notes to self are never exported.

## Not built: publishing straight from the app

Publishing from the device would need Instagram's API (a Business or Creator account linked to a Facebook Page, a Meta app and access tokens kept on the device) or Metricool's API (a paid plan). For now the export file is handed to Metricool. Worth revisiting once Metricool is connected.

## Text on pictures

On any picture slide in a post, **Add text** opens a small studio: add text boxes, drag them into place, and style them with brand looks (YOU title, Soft quote, Story serif, Headline, World label, Handwritten, Boxed), seven bundled fonts (Cinzel, Cormorant, Playfair, Newsreader, Josefin, Inter, Caveat; all work offline) and the brand palettes (YOU, the five worlds, Creative Universe, Atlantean Gardens), or any colour. The last look used becomes the start for the next box.

The words are stored on the slide (`PostMedia.text`, fractions of the slide, so they sync encrypted and look the same everywhere) and show in the editor, Preview and the grid. **Save picture** draws the slide at 1080 wide (4:5, or 9:16 for Reels and Stories) with the words burned in: on the phone it opens the share sheet (save to gallery or straight to Instagram); on the laptop it downloads. Words stay in place when Claude's redrawn pictures are imported with "Update pictures". Text sits on pictures only, not on videos.
