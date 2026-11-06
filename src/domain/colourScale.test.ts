import { describe, expect, it } from 'vitest';
import { COLOUR_SCALE_DEFAULT, coloursAt, stopName } from './colourScale';

describe('light and dark colour scales', () => {
  it('keeps the existing YOUrigin palette at the default position', () => {
    expect(coloursAt('light', COLOUR_SCALE_DEFAULT)).toMatchObject({
      bg: '#f4efe7',
      paper2: '#e9e0d5',
      card: '#fbf8f2',
      ink: '#2b2130',
    });
    expect(coloursAt('dark', COLOUR_SCALE_DEFAULT)).toMatchObject({
      bg: '#090711',
      paper2: '#15111f',
      card: '#171321',
      ink: '#f0e9df',
    });
  });

  it('offers four named stops in each mode', () => {
    expect(stopName('light', 0)).toBe('Bark');
    expect(stopName('light', 100)).toBe('Moss');
    expect(stopName('dark', 0)).toBe('Void');
    expect(stopName('dark', 100)).toBe('Aurora');
    expect(coloursAt('light', 0).bg).toBe('#d5b996');
    expect(coloursAt('dark', 100).bg).toBe('#06191f');
  });

  it('clamps scale positions to the slider range', () => {
    expect(coloursAt('light', -30)).toEqual(coloursAt('light', 0));
    expect(coloursAt('dark', 140)).toEqual(coloursAt('dark', 100));
  });
});
