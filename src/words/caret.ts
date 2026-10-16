/**
 * Selects a range in a grown-to-fit textarea and scrolls the page so it's in
 * view. The textarea never scrolls itself, so the position is measured with an
 * invisible copy that wraps the text the same way.
 */
export function selectAndReveal(el: HTMLTextAreaElement, start: number, end: number) {
  el.focus({ preventScroll: true });
  el.setSelectionRange(start, end);
  const css = getComputedStyle(el);
  const copy = document.createElement('div');
  for (const p of ['font', 'letterSpacing', 'lineHeight', 'padding', 'border', 'boxSizing', 'wordSpacing', 'tabSize'] as const) copy.style[p] = css[p];
  Object.assign(copy.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', width: `${el.clientWidth}px` });
  copy.textContent = el.value.slice(0, start);
  const mark = document.createElement('span');
  mark.textContent = '​';
  copy.append(mark);
  document.body.append(copy);
  const y = el.getBoundingClientRect().top + window.scrollY + mark.offsetTop;
  copy.remove();
  window.scrollTo({ top: Math.max(0, y - window.innerHeight / 3), behavior: 'instant' });
}
