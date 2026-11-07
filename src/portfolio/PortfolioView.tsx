import { useId, useState } from 'react';
import type { ContactKind, PortfolioSnapshot, SnapshotItem, TextBlock } from './model';
import './viewer.css';

// The page a visitor sees. It renders a snapshot and nothing else, so the
// in-app preview and the published page are the same component. Styles live
// in viewer.css, scoped to .pf and independent of the app's theme, and adapt
// to the width of their container, so a phone-sized preview frame lays out
// exactly as a phone does.

export type ImageResolver = (ref: string) => string | undefined;

const CONTACT_ICON: Record<ContactKind, string> = {
  email: '✉',
  website: '↗',
  linkedin: 'in',
  github: '⌥',
  instagram: '◎',
  cv: '▤',
  other: '↗',
};

function Paragraphs({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  return (
    <div className={className}>
      {parts.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

function Blocks({ blocks }: { blocks: TextBlock[] }) {
  return (
    <div className="pf-reading">
      {blocks.map((b, i) =>
        b.kind === 'section' ? (
          <h4 key={i} className="pf-reading-section">{b.text}</h4>
        ) : b.kind === 'title' ? (
          <h5 key={i} className="pf-reading-title">{b.text}</h5>
        ) : (
          <div key={i} className="pf-text">{b.text}</div>
        ),
      )}
    </div>
  );
}

function Item({ item, image }: { item: SnapshotItem; image?: string }) {
  const [open, setOpen] = useState(false);
  const readId = useId();
  const hasFull = item.textMode === 'full' && item.text.length > 0;
  return (
    <article className={`pf-item${image ? ' pf-item--pictured' : ''} pf-item--${item.kind}`}>
      {image && (
        <figure className="pf-figure">
          <img src={image} alt={item.image?.alt ?? ''} loading="lazy" decoding="async" />
        </figure>
      )}
      <div className="pf-item-body">
        <p className="pf-label">{item.label}</p>
        <h3 className="pf-item-title">{item.title}</h3>
        {item.subtitle && <p className="pf-subtitle">{item.subtitle}</p>}
        {item.meta.length > 0 && <p className="pf-meta">{item.meta.join(' · ')}</p>}
        <Paragraphs text={item.description} className="pf-description" />
        {item.kind === 'project' && item.destinationUrl && (
          <a className="pf-project-link" href={item.destinationUrl} target="_blank" rel="noopener noreferrer">
            Explore project <span aria-hidden="true">↗</span>
          </a>
        )}
        {item.textMode === 'excerpt' && item.text.length > 0 && <div className="pf-text pf-excerpt">{item.text[0].text}</div>}
        {hasFull && (
          <>
            <button type="button" className="pf-read" aria-expanded={open} aria-controls={readId} onClick={() => setOpen((o) => !o)}>
              {open ? 'Close' : 'Read'}
            </button>
            <div id={readId} hidden={!open}>
              <Blocks blocks={item.text} />
              {item.truncated && <p className="pf-note">This is an extract of a longer work.</p>}
            </div>
          </>
        )}
      </div>
    </article>
  );
}

export function PortfolioView({ snapshot, resolveImage }: { snapshot: PortfolioSnapshot; resolveImage: ImageResolver }) {
  const s = snapshot;
  return (
    <div className={`pf pf--${s.theme}`}>
      <header className="pf-hero">
        <div className="pf-wrap">
          {s.title && <p className="pf-kicker">{s.title}</p>}
          <h1 className="pf-name">{s.ownerName || 'Your name'}</h1>
          {s.ownerLine && <p className="pf-line">{s.ownerLine}</p>}
          <Paragraphs text={s.intro} className="pf-intro" />
          {s.contact.length > 0 && (
            <nav className="pf-contact" aria-label="Contact">
              {s.contact.map((c, i) => (
                <a
                  key={i}
                  href={c.href}
                  {...(c.kind === 'email' ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                >
                  <span aria-hidden="true" className="pf-contact-icon">{CONTACT_ICON[c.kind]}</span>
                  {c.label}
                </a>
              ))}
            </nav>
          )}
        </div>
      </header>

      <main className="pf-wrap pf-main">
        {s.sections.length === 0 ? (
          <p className="pf-empty">Nothing has been added yet.</p>
        ) : (
          s.sections.map((sec) => (
            <section key={sec.key} className="pf-section" aria-label={sec.heading || undefined}>
              {sec.heading && <h2 className="pf-section-title">{sec.heading}</h2>}
              <div className="pf-grid">
                {sec.items.map((item) => (
                  <Item key={item.key} item={item} image={item.image ? resolveImage(item.image.ref) : undefined} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      <footer className="pf-footer">
        <div className="pf-wrap">
          <span>{s.ownerName}</span>
          <span className="pf-made">Made with YOUrigin</span>
        </div>
      </footer>
    </div>
  );
}
