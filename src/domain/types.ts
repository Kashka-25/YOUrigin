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
}

export interface Section extends Syncable {
  bookId: string;
  title: string;
  order: number;
  notes: string;
}

/** A reference from a book (and optionally a section) to a content item.
 *  sectionId === null means the piece is in the book's "tray" — claimed by the
 *  book but not yet placed. */
export interface BookEntry extends Syncable {
  bookId: string;
  sectionId: string | null;
  contentId: string;
  order: number;
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
