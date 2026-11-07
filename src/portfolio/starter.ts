// A starter portfolio is a small file a person brings: their ventures, how to
// group them, and a description of each written for the portfolio. Nothing in
// it is built into the app; importing it only fills in that person's own
// library on their own device, as a private draft.

import { PROJECT_COLOURS } from '../domain/constants';
import type { ProjectColour, ProjectStatus } from '../domain/types';
import { LIMITS, PURPOSE_ORDER, THEMES, type PortfolioPurpose, type PortfolioTheme } from './model';

export const STARTER_FORMAT = 'yourigin-starter-portfolio';

export interface StarterProject {
  title: string;
  /** Used only when the Project doesn't exist yet. An existing Project is never changed. */
  description: string;
  category: string;
  colour?: ProjectColour;
  status: ProjectStatus;
  /** What the portfolio card says. Written for this portfolio; the Project keeps its own. */
  portfolioDescription: string;
  /** The venture's own site (https). Put on the card only when it has no link yet. */
  link?: string;
  /** A cover picture as a data: URL. Used only when the Project has no cover yet. */
  cover?: string;
}

export interface StarterSection {
  heading: string;
  projects: StarterProject[];
}

export interface StarterPack {
  /** Ties the draft to this starter, so importing again extends it instead of making another. */
  key: string;
  title: string;
  purpose: PortfolioPurpose;
  theme: PortfolioTheme;
  ownerName: string;
  ownerLine: string;
  intro: string;
  sections: StarterSection[];
}

const STATUSES: ProjectStatus[] = ['idea', 'building', 'resting', 'complete'];

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Same name, whatever the case, spacing or quote marks. */
export function sameTitle(a: string, b: string): boolean {
  const norm = (s: string) => s.normalize('NFKC').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  return norm(a) === norm(b);
}

/** Reads a starter file. Throws a plain message when it isn't one. */
export function parseStarterPack(raw: unknown): StarterPack {
  const s = obj(typeof raw === 'string' ? safeJson(raw) : raw);
  if (s.format !== STARTER_FORMAT) throw new Error('That file isn’t a YOUrigin starter portfolio.');
  const key = text(s.key, 80);
  if (!key) throw new Error('This starter file has no key, so it can’t be imported safely.');
  const purpose = PURPOSE_ORDER.includes(s.purpose as PortfolioPurpose) ? (s.purpose as PortfolioPurpose) : 'business';
  const theme = s.theme && typeof s.theme === 'string' && s.theme in THEMES ? (s.theme as PortfolioTheme) : 'venture';
  const colours = new Set(PROJECT_COLOURS.map((c) => c.value));
  const sections: StarterSection[] = (Array.isArray(s.sections) ? s.sections : []).map((secRaw) => {
    const sec = obj(secRaw);
    const projects = (Array.isArray(sec.projects) ? sec.projects : []).map((pRaw) => {
      const p = obj(pRaw);
      return {
        title: text(p.title, 120),
        description: text(p.description, 4000),
        category: text(p.category, 60),
        colour: colours.has(p.colour as ProjectColour) ? (p.colour as ProjectColour) : undefined,
        status: STATUSES.includes(p.status as ProjectStatus) ? (p.status as ProjectStatus) : 'building',
        portfolioDescription: text(p.portfolioDescription, LIMITS.description),
        link: httpsLink(p.link),
        cover: pictureData(p.cover),
      };
    }).filter((p) => p.title);
    return { heading: text(sec.heading, LIMITS.heading), projects };
  }).filter((sec) => sec.projects.length);
  if (!sections.length) throw new Error('This starter file has no Projects in it.');
  return {
    key,
    title: text(s.title, LIMITS.title) || 'Selected work',
    purpose,
    theme,
    ownerName: text(s.ownerName, LIMITS.ownerName),
    ownerLine: text(s.ownerLine, LIMITS.ownerLine),
    intro: text(s.intro, LIMITS.intro),
    sections,
  };
}

/** Only full https addresses. */
function httpsLink(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length > 2000) return undefined;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'https:' && u.hostname.includes('.') ? u.href : undefined;
  } catch {
    return undefined;
  }
}

const MAX_PICTURE = 8_000_000;

/** Only a PNG, JPEG or WebP picture carried in the file itself; never a link to fetch. */
function pictureData(v: unknown): string | undefined {
  return typeof v === 'string' && v.length < MAX_PICTURE && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(v) ? v : undefined;
}

/** A data: URL as a file, for the usual picture shrinking and storage. */
export function pictureFile(dataUrl: string, name: string): File {
  const [head, body] = dataUrl.split(',');
  const mime = head.slice(5, head.indexOf(';'));
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('That file isn’t a YOUrigin starter portfolio.');
  }
}
