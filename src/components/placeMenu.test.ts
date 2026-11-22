import { describe, expect, it } from 'vitest';
import { placeMenu } from './placeMenu';

// A 432×768 phone: sticky header to 56px, bottom nav from 708px.
const phone = { top: 56, bottom: 708, left: 0, right: 432 };
const trigger = (top: number, left = 20) => ({ top, bottom: top + 28, left, right: left + 80 });

describe('placeMenu', () => {
  it('opens below the trigger when there is room', () => {
    const p = placeMenu(trigger(200), phone);
    expect(p.up).toBe(false);
    expect(p.top).toBe(236);
    expect(p.maxHeight).toBe(416);
  });

  it('flips above a trigger near the bottom nav, and never reaches under the nav or header', () => {
    const p = placeMenu(trigger(600), phone);
    expect(p.up).toBe(true);
    expect(p.top).toBe(592); // the menu's bottom edge, just above the trigger
    expect(p.top - p.maxHeight).toBeGreaterThanOrEqual(phone.top);
  });

  it('keeps a downward menu clear of the bottom nav', () => {
    const p = placeMenu(trigger(380), phone);
    expect(p.up).toBe(false);
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(phone.bottom);
  });

  it('fits the width of a narrow screen and stays on it', () => {
    const p = placeMenu(trigger(200, 300), { ...phone, right: 320 });
    expect(p.width).toBe(304);
    expect(p.left).toBe(8);
  });
});
