// Where a pop-up menu goes on screen, so it is never cut off by a card that hides its
// overflow, and never ends up behind the phone's bottom nav or the on-screen keyboard.

export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface MenuPlacement {
  /** For position: fixed. When `up`, this is the menu's bottom edge (shift it up by its own height). */
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  up: boolean;
}

export interface PlaceMenuOptions {
  /** Space between the trigger and the menu. */
  gap?: number;
  /** Space kept clear at the edges of the free area. */
  margin?: number;
  /** Widest the menu should be. */
  width?: number;
  /** Tallest the menu should be. */
  maxHeight?: number;
  /** Below the trigger is preferred while at least this much room is there. */
  minBelow?: number;
}

/**
 * Places a menu under its trigger, or above it when there is clearly more room there.
 * `area` is the part of the screen the menu may use: the visible viewport minus fixed bars.
 */
export function placeMenu(anchor: Box, area: Box, opts: PlaceMenuOptions = {}): MenuPlacement {
  const { gap = 8, margin = 8, width: wanted = 352, maxHeight: tallest = 416, minBelow = 260 } = opts;
  const width = Math.max(0, Math.min(wanted, area.right - area.left - margin * 2));
  const left = Math.min(Math.max(anchor.left, area.left + margin), area.right - margin - width);
  const below = area.bottom - margin - (anchor.bottom + gap);
  const above = anchor.top - gap - (area.top + margin);
  const up = below < Math.min(minBelow, tallest) && above > below;
  const room = Math.max(0, up ? above : below);
  return { top: up ? anchor.top - gap : anchor.bottom + gap, left, width, maxHeight: Math.min(tallest, room), up };
}

/**
 * The part of the window a menu may use right now: the visible viewport (it shrinks when
 * the phone keyboard is up) minus the bars marked `data-screen-edge` (header, bottom nav,
 * demo bar). A bar in the upper half of the screen trims the top, otherwise the bottom.
 */
export function freeArea(): Box {
  const vv = window.visualViewport;
  const area: Box = vv
    ? { top: vv.offsetTop, bottom: vv.offsetTop + vv.height, left: vv.offsetLeft, right: vv.offsetLeft + vv.width }
    : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
  for (const el of document.querySelectorAll<HTMLElement>('[data-screen-edge]')) {
    const r = el.getBoundingClientRect();
    if (!r.height) continue; // hidden at this width
    if (r.top + r.height / 2 < (area.top + area.bottom) / 2) area.top = Math.max(area.top, r.bottom);
    else area.bottom = Math.min(area.bottom, r.top);
  }
  return area;
}
