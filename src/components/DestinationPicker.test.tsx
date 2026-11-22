import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DestinationPicker } from './DestinationPicker';

const now = Date.now();
vi.mock('../hooks/useLibrary', () => ({
  useLibrary: () => ({
    projects: [
      { id: 'p1', title: 'Saltwater Songs', updatedAt: now },
      { id: 'p2', title: 'Night Poems', updatedAt: now - 1 },
    ],
    collections: [{ id: 'c1', name: 'Favourites', updatedAt: now }],
  }),
}));

afterEach(cleanup);

function renderInCard(onChange = vi.fn()) {
  render(
    <div data-testid="card" style={{ overflow: 'hidden' }}>
      <DestinationPicker value={[]} onChange={onChange} />
    </div>,
  );
  return onChange;
}

describe('DestinationPicker', () => {
  it('draws the list outside the capture card, so the card cannot clip it', () => {
    renderInCard();
    fireEvent.click(screen.getByRole('button', { name: /Add to/ }));
    const menu = screen.getByRole('dialog', { name: /Add this note/ });
    expect(screen.getByTestId('card').contains(menu)).toBe(false);
    expect(menu.className).toContain('fixed');
    expect(screen.getByRole('button', { name: 'Saltwater Songs' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Night Poems' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Favourites' })).toBeTruthy();
  });

  it('picks a creation by tapping it in the list', () => {
    const onChange = renderInCard();
    fireEvent.click(screen.getByRole('button', { name: /Add to/ }));
    const item = screen.getByRole('button', { name: 'Night Poems' });
    fireEvent.mouseDown(item); // a tap inside the menu must not count as "outside"
    fireEvent.click(item);
    expect(onChange).toHaveBeenCalledWith([{ kind: 'project', id: 'p2', name: 'Night Poems' }]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on a tap outside', () => {
    renderInCard();
    fireEvent.click(screen.getByRole('button', { name: /Add to/ }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
