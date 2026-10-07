import { useState } from 'react';
import { Modal } from './Modal';
import { Logo } from './Logo';
import { StatusBadge } from './ui';
import { setSetting } from '../db/settings';
import { loadSample } from '../db/sample';

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'A place to capture',
    body: 'YOUrigin is the origin point for your creative material: poems, fragments, ideas, reflections, teachings, prompts — anything moving through your mind.',
  },
  {
    title: 'You don’t need to know where it belongs',
    body: 'Capture first. Organise second. Structure third. Refine last. Nothing asks you to decide what something is before you save it.',
  },
  {
    title: 'Tags, now or later',
    body: (
      <>
        Type <code className="rounded bg-paper-2 px-1">#water #grief</code> on its own line while you write and they become tags. Or add them later — or never.
      </>
    ),
  },
  {
    title: 'Three creative states',
    body: (
      <div className="space-y-2">
        <p>
          <StatusBadge status="seed" /> Raw and alive — an image, a line, a beginning. Seed never means bad.
        </p>
        <p>
          <StatusBadge status="developing" /> The core is there; it’s still being shaped.
        </p>
        <p>
          <StatusBadge status="polished" /> Essentially finished, or close enough to share.
        </p>
      </div>
    ),
  },
  {
    title: 'Orphans are unclaimed material',
    body: 'Pieces that don’t belong to a book or collection yet live in Orphans. They are not failures — they are waiting to be discovered.',
  },
  {
    title: 'Books are built from what you’ve gathered',
    body: 'A book references your pieces — it never copies them. One poem can live in three books at once. Drag pieces into sections, then read it all in Manuscript mode.',
  },
];

export function Onboarding({ open }: { open: boolean }) {
  const [step, setStep] = useState(0);
  const finish = async (withSample: boolean) => {
    if (withSample) await loadSample();
    await setSetting('onboarded', true);
  };
  const last = step === STEPS.length - 1;
  const s = STEPS[step];

  return (
    <Modal open={open} onClose={() => void finish(false)} title="Welcome">
      <div className="mb-5">
        <Logo size="lg" />
        <p className="mt-1 font-serif text-lg italic text-ink-2">Where your ideas become something.</p>
      </div>
      <div className="min-h-40">
        <p className="eyebrow">
          {step + 1} of {STEPS.length}
        </p>
        <h3 className="mt-1 font-serif text-2xl">{s.title}</h3>
        <div className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.body}</div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost" onClick={() => void finish(false)}>
          Skip — start writing
        </button>
        <div className="ml-auto flex gap-2">
          {step > 0 && (
            <button type="button" className="btn" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {!last ? (
            <button type="button" className="btn-primary" onClick={() => setStep(step + 1)}>
              Next
            </button>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => void finish(true)}>
                Explore with sample pieces
              </button>
              <button type="button" className="btn-primary" onClick={() => void finish(false)}>
                Start empty
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
