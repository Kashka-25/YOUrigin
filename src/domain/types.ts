// Core data model. Content is independent from structure: books, collections
// and relationships only ever *reference* content by id.

export type Status = 'seed' | 'developing' | 'polished';

export type ContentType =
  | 'poem'
  | 'fragment'
  | 'idea'
  | 'reflection'
  | 'teaching'
  | 'prompt'
  | 'ritual'
  | 'quote'
  | 'story'
  | 'research'
  | 'note'
  | 'image'
  | 'other';

export type SourceKind = 'capture' | 'import' | 'sample' | 'ai-variant';

export interface ContentSource {
  kind: SourceKind;
  fileName?: string;
  /** For ai-variant: the content it was derived from. */
  derivedFromId?: string;
}

/** Every syncable record carries id + createdAt + updatedAt so that backups
 *  from different devices can be merged with "newest wins". */
export interface Syncable {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface ContentItem extends Syncable {
  /** User-given title. Empty string means "use the first line". */
  title: string;
  body: string;
  type: ContentType;
  status: Status;
  tagIds: string[];
  notes: string;
  source: ContentSource;
  /** Orphan the user has deliberately chosen to keep unassigned. */
  keepUnassigned: boolean;
  archived: boolean;
  /** Soft delete — item sits in Trash until permanently removed. */
  deletedAt: number | null;
  /** For type 'image': the stored picture. The body holds an optional caption. */
  assetId?: string;
  /** For type 'image': how it sits on the page in print. */
  imageLayout?: ImageLayout;
}

export type ImageLayout = 'full-bleed' | 'full-page' | 'inline';

/** An image stored on the device (already shrunk). Synced and backed up like everything else. */
export interface Asset extends Syncable {
  name: string;
  mime: string;
  /** The image itself as a data: URL. */
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

export interface TagFamily extends Syncable {
  name: string;
  order: number;
}

export interface Tag extends Syncable {
  /** Normalised lowercase name without '#'. Unique. */
  name: string;
  familyId: string | null;
}

export interface Collection extends Syncable {
  name: string;
  description: string;
  contentIds: string[];
}

export type BookType = 'journal' | 'poetry' | 'essay' | 'codex' | 'custom';

export interface Book extends Syncable {
  title: string;
  subtitle: string;
  description: string;
  type: BookType;
  templateId: string | null;
  /** A cover colour token (see COVER_COLOURS). */
  cover: string;
  notes: string;
  archived: boolean;
  /** Cover artwork (asset id). */
  coverAssetId?: string;
  /** Page design for print/PDF. Missing fields fall back to defaults for the book type. */
  design?: Partial<BookDesign>;
}

export type TrimSize = '5x8' | '5.5x8.5' | '6x9' | '7x10' | '8x8' | '8.5x11' | 'a5' | 'a4';

export interface BookDesign {
  trim: TrimSize;
  margins: 'snug' | 'standard' | 'generous';
  bodyFont: 'newsreader' | 'garamond' | 'cormorant';
  headingFont: 'body' | 'cinzel';
  fontSize: number;
  lineHeight: number;
  poemAlign: 'left' | 'center';
  titleAlign: 'left' | 'center';
  pieceOnNewPage: boolean;
  sectionOnRightPage: boolean;
  sectionStyle: 'classic' | 'ornamental' | 'minimal';
  ornament: string;
  pageNumbers: 'bottom-center' | 'bottom-outside' | 'none';
  runningHeads: boolean;
  titlePage: boolean;
  author: string;
  copyright: string;
  dedication: string;
  toc: boolean;
  /** Space for handwriting after prompts (guided journals). */
  promptSpace: SpaceSize;
  /** Space after activities that ask the reader to write (invitations, rituals…). */
  activitySpace: SpaceSize;
  /** Blank space after activities that ask the reader to draw. */
  drawingSpace: SpaceSize;
  /** Recognise drawing activities from their wording (draw, sketch, map…). */
  detectDrawing: boolean;
  lineSpacing: 'wide' | 'college' | 'narrow';
  /** Thin frame around drawing spaces. */
  drawingFrame: boolean;
  /** Add 0.125in bleed for print-on-demand services. */
  bleed: boolean;
  /** Interior page count from the last print layout (used for the spine). */
  pageCount?: number;
  /** Wraparound paperback cover. */
  cover?: Partial<CoverDesign>;
}

export interface CoverDesign {
  paper: 'white' | 'cream' | 'standard-colour' | 'premium-colour';
  /** Manual page count; 0 = use the counted interior. */
  pageCount: number;
  /** Manual spine width in inches; 0 = calculate from pages and paper. */
  spineOverride: number;
  background: string;
  textColour: string;
  accentColour: string;
  font: 'cinzel' | 'garamond' | 'cormorant';
  /** Title size multiplier. */
  titleSize: number;
  /** Front panel: artwork fills it with the title over it, or artwork above the title, or type only. */
  frontLayout: 'image-full' | 'image-top' | 'type-only';
  /** Stretch the front artwork across the whole wrap (back, spine and front). */
  wrapImage: boolean;
  backImageAssetId?: string;
  blurb: string;
  authorBio: string;
  spineText: boolean;
  barcodeSpace: boolean;
  /** On-screen guides (never printed). */
  showGuides: boolean;
}

/** How much room to leave: to the end of the current page, a whole extra page, both, or none. */
export type SpaceSize = 'fill' | 'page' | 'fill+page' | 'none';

/** Per-piece override of the writing/drawing space, stored on the piece's place in a book. */
export interface EntrySpace {
  kind: 'auto' | 'lines' | 'blank' | 'none';
  size: Exclude<SpaceSize, 'none'>;
}

export interface Section extends Syncable {
  bookId: string;
  title: string;
  order: number;
  notes: string;
  /** Optional artwork shown on the section's opening page (asset id). */
  imageAssetId?: string;
}

/** A reference from a book (and optionally a section) to a content item.
 *  sectionId === null means the piece is in the book's "tray" — claimed by the
 *  book but not yet placed. */
export interface BookEntry extends Syncable {
  bookId: string;
  sectionId: string | null;
  contentId: string;
  order: number;
  /** Writing/drawing space after this piece in this book (default: automatic). */
  space?: EntrySpace;
}

export type RelationshipKind = 'related' | 'echoes' | 'continues' | 'variant';

export interface Relationship extends Syncable {
  fromId: string;
  toId: string;
  kind: RelationshipKind;
  note: string;
}

export interface Template extends Syncable {
  name: string;
  bookType: BookType;
  sections: string[];
  builtIn: boolean;
  /** New books start with a copyright page (ISBN placeholder). Unset counts as yes. */
  copyrightPage?: boolean;
}

export type SuggestionKind = 'tags' | 'type';
export type SuggestionState = 'pending' | 'accepted' | 'dismissed';

export interface AISuggestion extends Syncable {
  contentId: string;
  kind: SuggestionKind;
  /** tags: tag name; type: content type */
  value: string;
  state: SuggestionState;
  provider: string;
}

export interface Revision {
  id: string;
  contentId: string;
  title: string;
  body: string;
  createdAt: number;
}

export interface Setting {
  key: string;
  value: unknown;
}
