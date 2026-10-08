// Controls the opening screen defined in index.html.
const FULL_MS = 4700; // wordmark + tagline fully revealed, then a short hold
const CALM_MS = 1400; // reduced-motion: a brief, still moment
const FADE_MS = 1100;

export function finishSplash(): void {
  const el = document.getElementById('splash');
  if (!el || document.documentElement.classList.contains('splash-seen')) {
    el?.remove();
    return;
  }
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let done = false;
  const leave = () => {
    if (done) return;
    done = true;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), FADE_MS);
  };
  el.addEventListener('click', leave);
  window.addEventListener('keydown', leave, { once: true });
  // performance.now() counts from page start, so slow loads don't add extra waiting.
  setTimeout(leave, Math.max(0, (calm ? CALM_MS : FULL_MS) - performance.now()));
}
