// Paged.js extension: after each page is laid out, writing/drawing spaces marked
// "fill" grow to the bottom of that page (lines end on a whole line). The space
// element always ends its page, so growing it never pushes other content.

type PagedModule = typeof import('pagedjs');
let registered = false;

export function registerFillSpace(paged: PagedModule): void {
  if (registered) return;
  registered = true;
  class FillSpace extends paged.Handler {
    afterPageLayout(pageElement: HTMLElement): void {
      const fills = pageElement.querySelectorAll<HTMLElement>('.yb-space-fill');
      if (!fills.length) return;
      const area = pageElement.querySelector<HTMLElement>('.pagedjs_page_content');
      if (!area) return;
      const areaRect = area.getBoundingClientRect();
      // The preview may be zoomed: convert on-screen pixels back to CSS pixels.
      const scale = area.offsetHeight ? areaRect.height / area.offsetHeight : 1;
      fills.forEach((el) => {
        const top = (el.getBoundingClientRect().top - areaRect.top) / scale;
        const height = area.offsetHeight - top - 2;
        const line = Number(el.dataset.line || 0);
        if (line > 0) {
          // Draw each line as a real element: crisp in print and at any zoom.
          const count = Math.max(3, Math.floor(height / line));
          el.replaceChildren(...Array.from({ length: count }, () => Object.assign(document.createElement('div'), { className: 'yb-rule' })));
          return;
        }
        if (height > el.offsetHeight) el.style.height = `${height}px`;
      });
    }
  }
  paged.registerHandlers(FillSpace);
}
