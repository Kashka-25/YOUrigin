import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { PAGE_FLOW_KEY, isTypingTarget, keyTurn, readPageFlow, swipeTurn, usePageFlow } from './usePageFlow';

const key = (k: string, target: EventTarget | null, extra: Partial<KeyboardEvent> = {}) =>
  ({ key: k, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, target, ...extra }) as KeyboardEvent;

describe('page flow', () => {
  beforeEach(() => localStorage.clear());

  it('turns pages sideways by default and remembers the choice on this device', () => {
    expect(readPageFlow()).toBe('pages');
    const { result } = renderHook(() => usePageFlow());
    expect(result.current[0]).toBe('pages');
    act(() => result.current[1]('scroll'));
    expect(result.current[0]).toBe('scroll');
    expect(localStorage.getItem(PAGE_FLOW_KEY)).toBe('scroll');
    expect(renderHook(() => usePageFlow()).result.current[0]).toBe('scroll');
  });

  it('never turns a page on arrows typed in the title or the words', () => {
    const words = document.createElement('textarea');
    const title = document.createElement('input');
    const tick = Object.assign(document.createElement('input'), { type: 'checkbox' });
    expect(isTypingTarget(words)).toBe(true);
    expect(isTypingTarget(title)).toBe(true);
    expect(isTypingTarget(tick)).toBe(false);
    expect(keyTurn(key('ArrowRight', words))).toBeNull();
    expect(keyTurn(key('ArrowLeft', title))).toBeNull();
    expect(keyTurn(key('ArrowRight', document.body))).toBe('next');
    expect(keyTurn(key('ArrowLeft', tick))).toBe('prev');
    // Alt + arrow is the deliberate shortcut, even from the words.
    expect(keyTurn(key('ArrowRight', words, { altKey: true }))).toBe('next');
    // Shift / Ctrl + arrow select or jump words; never a page turn.
    expect(keyTurn(key('ArrowRight', document.body, { shiftKey: true }))).toBeNull();
    expect(keyTurn(key('a', document.body))).toBeNull();
  });

  it('only a clear sideways swipe turns the page', () => {
    expect(swipeTurn(-120, 10, 200)).toBe('next');
    expect(swipeTurn(120, -10, 200)).toBe('prev');
    expect(swipeTurn(-30, 0, 100)).toBeNull(); // too short
    expect(swipeTurn(-100, 80, 200)).toBeNull(); // mostly scrolling down
    expect(swipeTurn(-150, 0, 1500)).toBeNull(); // a slow drag, not a swipe
  });
});
