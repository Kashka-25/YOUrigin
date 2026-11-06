import { describe, expect, it } from 'vitest';
import { COLOUR_SCALE_DEFAULT, coloursAt, stopName } from './colourScale';

describe('light and dark colour scales', () => {
  it('keeps the existing YOUrigin palette at the default position', () => {
    expect(coloursAt('light', COLOUR_SCALE_DEFAULT)).toMatchObject({
      bg: '#F4EFE7',
      paper2: '#E9E0D5',
      card: '#FBF8F2',
      ink: '#2B2130',
    });
    expect(coloursAt('dark', COLOUR_SCALE_DEFAULT)).toMatchObject({
      bg: '#090711',
      paper2: '#15111F',
      card: '#171321',
      ink: '#F0E9DF',
    });
  });

  it('offers four named stops in each mode', () => {
    expect(stopName('light', 0)).toBe('Bark');
    expect(stopName('light', 100)).toBe('Moss');
    expect(stopName('dark', 0)).toBe('Void');
    expect(stopName('dark', 100)).toBe('Aurora');
    expect(coloursAt('light', 0).bg).toBe('#D5B996');
    expect(coloursAt('dark', 100).bg).toBe('#06191F');
  });

  it('clamps scale positions to the slider range', () => {
    expect(coloursAt('light', -30)).toEqual(coloursAt('light', 0));
    expect(coloursAt('dark', 140)).toEqual(coloursAt('dark', 100));
  });
});
