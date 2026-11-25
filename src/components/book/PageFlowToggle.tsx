import { BookOpen, ScrollText } from 'lucide-react';
import type { PageFlow } from '../../hooks/usePageFlow';

const CHOICES: { id: PageFlow; label: string; title: string; icon: typeof BookOpen }[] = [
  { id: 'pages', label: 'Pages', title: 'One piece per page. Swipe or use the arrows to turn.', icon: BookOpen },
  { id: 'scroll', label: 'Scroll', title: 'Everything on one long page, top to bottom.', icon: ScrollText },
];

/** Turn pages sideways like a book, or scroll down. Remembered on this device. */
export function PageFlowToggle({ value, onChange }: { value: PageFlow; onChange: (f: PageFlow) => void }) {
  return (
    <div role="group" aria-label="How pages move" className="no-print inline-flex shrink-0 rounded-full border border-line p-0.5">
      {CHOICES.map(({ id, label, title, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          title={title}
          aria-label={label}
          onClick={() => onChange(id)}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${value === id ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'}`}
        >
          <Icon size={14} aria-hidden />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
