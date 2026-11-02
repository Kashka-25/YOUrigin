import { describe, expect, it } from 'vitest';
import { composeShared } from './shareInbox';

describe('composeShared', () => {
  it('keeps a browser share as title then link', () => {
    expect(composeShared({ title: 'On Tides', url: 'https://example.com/tides' })).toBe('On Tides\n\nhttps://example.com/tides');
  });

  it('does not repeat a link or title already in the text', () => {
    expect(composeShared({ title: 'On Tides', text: 'On Tides https://example.com/tides', url: 'https://example.com/tides' })).toBe(
      'On Tides https://example.com/tides',
    );
  });

  it('keeps plain shared text as it is, line breaks included', () => {
    expect(composeShared({ text: 'The ocean\ndoes not ask.\n' })).toBe('The ocean\ndoes not ask.');
  });

  it('is empty when nothing came with the share', () => {
    expect(composeShared({})).toBe('');
  });
});
