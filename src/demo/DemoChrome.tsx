import { useState } from 'react';
import { ArrowLeft, FlaskConical, RotateCcw, Sparkles, SquarePen } from 'lucide-react';
import { Logo } from '../components/Logo';
import { demoAccessAllowed, demoBackUrl, DEMO_OFFLINE_MESSAGE } from './mode';
import { resetDemo, startDemo, type DemoChoice } from './state';
import { EXAMPLE_CREATOR } from './seed';

/** A small, always-visible badge: it's a demo, on example data, with Reset and a way back.
 *  Phones: just above the bottom dock. Laptops: in the top bar, on the right. */
export function DemoBar() {
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    if (!window.confirm('Reset the demo? Everything you made here is cleared and you start again.')) return;
    setBusy(true);
    try {
      await resetDemo();
      window.location.hash = '#/';
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="demo-bar no-print fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-1/2 z-[60] flex -translate-x-1/2 items-center md:top-[11px] md:right-8 md:bottom-auto md:left-auto md:translate-x-0 gap-1 rounded-full border border-[#d6ad6d]/50 bg-[#1b1426]/95 py-1 pr-1 pl-3 text-xs text-[#f0e8df] shadow-lg backdrop-blur"
      role="region"
      aria-label="Demo"
    >
      <FlaskConical size={13} className="shrink-0 text-[#d6ad6d]" aria-hidden />
      <span className="whitespace-nowrap font-medium">
        Demo · example data
      </span>
      <button type="button" onClick={() => void reset()} disabled={busy} className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/10" title="Clear the demo and start again">
        <RotateCcw size={12} aria-hidden /> Reset<span className="sr-only"> demo</span>
      </button>
      <a href={demoBackUrl()} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 hover:bg-white/15" title="Back to Creative Universe">
        <ArrowLeft size={12} aria-hidden /> <span className="hidden sm:inline">Creative Universe</span>
        <span className="sm:hidden">Back</span>
      </a>
    </div>
  );
}

/** The demo's front door: an example person, or a blank start. */
export function DemoWelcome() {
  const [busy, setBusy] = useState<DemoChoice | null>(null);
  const go = async (choice: DemoChoice) => {
    setBusy(choice);
    try {
      await startDemo(choice);
    } finally {
      setBusy(null);
    }
  };
  if (!demoAccessAllowed()) return null; // an entry key form would go here
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#100b18] px-4 py-16 text-[#f0e8df]">
      <main className="w-full max-w-xl text-center">
        <div className="mx-auto w-56">
          <Logo size="lg" />
        </div>
        <p className="mt-6 font-display text-[10px] tracking-[.26em] text-[#d6ad6d] uppercase">Try YOUrigin</p>
        <h1 className="mt-2 font-serif text-4xl leading-tight md:text-5xl">A creative codex, to explore.</h1>
        <p className="mx-auto mt-4 max-w-md font-serif text-lg leading-relaxed text-[#c5b8c9]">
          Gather poems, lyrics and notes, grow them into Projects, and shape them into books, albums and set lists.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void go('example')}
            disabled={!!busy}
            className="rounded-2xl border border-[#d6ad6d]/50 bg-[#d6ad6d]/10 p-5 text-left transition-colors hover:bg-[#d6ad6d]/20 disabled:opacity-60"
          >
            <Sparkles size={18} className="text-[#d6ad6d]" aria-hidden />
            <span className="mt-2 block font-serif text-xl">Explore as an example person</span>
            <span className="mt-1 block text-sm text-[#c5b8c9]">
              {busy === 'example' ? 'Setting the table…' : `Step into ${EXAMPLE_CREATOR}’s codex: a made-up poet and songwriter with a few projects, a book and an album.`}
            </span>
          </button>
          <button
            type="button"
            onClick={() => void go('blank')}
            disabled={!!busy}
            className="rounded-2xl border border-white/15 p-5 text-left transition-colors hover:bg-white/5 disabled:opacity-60"
          >
            <SquarePen size={18} className="text-[#c5a6dc]" aria-hidden />
            <span className="mt-2 block font-serif text-xl">Start blank</span>
            <span className="mt-1 block text-sm text-[#c5b8c9]">An empty codex, just for you to try.</span>
          </button>
        </div>
        <p className="mx-auto mt-8 max-w-md text-sm leading-relaxed text-[#a99ab1]">
          Everything stays in this browser on this device. The example person and their work are invented. {DEMO_OFFLINE_MESSAGE.replace('Not available in the demo: n', 'N')}
        </p>
        <a href={demoBackUrl()} className="mt-6 inline-flex items-center gap-1.5 text-sm text-[#c5b8c9] underline-offset-4 hover:text-white hover:underline">
          <ArrowLeft size={14} aria-hidden /> Back to Creative Universe
        </a>
      </main>
    </div>
  );
}

/** Shown in place of anything that would reach a server. */
export function DemoOffline({ what }: { what: string }) {
  return (
    <p className="rounded-xl border border-dashed border-line bg-paper-2 p-3 text-sm text-ink-2">
      <FlaskConical size={14} className="mr-1.5 inline text-gold" aria-hidden />
      {what} isn’t available in the demo. Nothing you make here is sent anywhere.
    </p>
  );
}
