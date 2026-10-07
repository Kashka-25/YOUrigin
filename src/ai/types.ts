import type { Book, BookEntry, ContentItem, ContentType, Section } from '../domain/types';

export interface AIContext {
  items: ContentItem[];
  tagName: Map<string, string>;
  books: { book: Book; sections: Section[]; entries: BookEntry[] }[];
}

export interface Related {
  id: string;
  score: number;
  reason: string;
}

export interface Placement {
  bookId: string;
  sectionId: string | null;
  reason: string;
  score: number;
}

export interface Theme {
  theme: string;
  itemIds: string[];
}

export interface ProposedSection {
  title: string;
  itemIds: string[];
}

export type RefineIntent = 'tighten' | 'imagery' | 'ending' | 'clarity';

/**
 * Everything the creative assistant can do. Providers *suggest*; nothing here
 * writes to the database. Callers decide what to show and what the user accepts.
 */
export interface AIProvider {
  id: string;
  label: string;
  /** True when suggestions come from a remote model (needs network). */
  remote: boolean;
  suggestTags(item: ContentItem, ctx: AIContext): Promise<string[]>;
  classifyContent(item: ContentItem): Promise<ContentType>;
  findRelatedContent(item: ContentItem, ctx: AIContext): Promise<Related[]>;
  suggestBookPlacement(item: ContentItem, ctx: AIContext): Promise<Placement[]>;
  detectThemes(items: ContentItem[], ctx: AIContext): Promise<Theme[]>;
  suggestDevelopment(item: ContentItem): Promise<string[]>;
  suggestStructure(items: ContentItem[], ctx: AIContext): Promise<ProposedSection[]>;
  detectRepetition(items: ContentItem[]): Promise<{ phrase: string; itemIds: string[] }[]>;
  /** Returns an alternative draft. Never applied to the original automatically. */
  refine(item: ContentItem, intent: RefineIntent): Promise<{ text: string; notes: string[] }>;
}
