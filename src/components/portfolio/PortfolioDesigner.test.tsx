import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Pictures are shrunk with a canvas, which the test browser doesn't have.
vi.mock('../../io/images', async (orig) => ({
  ...(await orig<typeof import('../../io/images')>()),
  shrinkImage: async () => ({ dataUrl: 'data:image/webp;base64,AAAA', mime: 'image/webp', width: 1600, height: 900, bytes: 10, originalBytes: 100 }),
}));

import { db, ensureBuiltIns } from '../../db/db';
import { createPortfolio, updatePortfolio } from '../../db/portfolios';
import { createProject } from '../../db/projectRecords';
import { headingItem, itemFromProject } from '../../portfolio/model';
import { PortfolioEditor } from '../../pages/PortfolioEditor';
import { LibraryProvider } from '../../hooks/useLibrary';
import { insertAfter, reorderById } from './PortfolioDesigner';

let portfolioId = '';
let projectId = '';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureBuiltIns();
  projectId = await createProject({ title: 'Tidewater', description: 'The Project’s own words.', category: 'Studio' });
  const project = (await db.projects.get(projectId))!;
  portfolioId = await createPortfolio('creative', 'Ana');
  const p = (await db.portfolios.get(portfolioId))!;
  await updatePortfolio(portfolioId, { items: [...p.items, itemFromProject(project)] });
});
afterEach(cleanup);

function open() {
  render(
    <MemoryRouter initialEntries={[`/portfolios/${portfolioId}?design=1`]}>
      <LibraryProvider><Routes><Route path="/portfolios/:id" element={<PortfolioEditor />} /></Routes></LibraryProvider>
    </MemoryRouter>,
  );
}

const stored = async () => (await db.portfolios.get(portfolioId))!;

describe('ordering helpers', () => {
  const [a, b, c] = [headingItem('a'), headingItem('b'), headingItem('c')];
  it('moves an item to where it was dropped', () => {
    expect(reorderById([a, b, c], a.id, c.id).map((i) => i.heading)).toEqual(['b', 'c', 'a']);
    expect(reorderById([a, b, c], c.id, a.id).map((i) => i.heading)).toEqual(['c', 'a', 'b']);
    const same = [a, b, c];
    expect(reorderById(same, a.id, 'gone')).toBe(same);
  });
  it('adds a new item after the selected one', () => {
    const d = headingItem('d');
    expect(insertAfter([a, b, c], a.id, d).map((i) => i.heading)).toEqual(['a', 'd', 'b', 'c']);
    expect(insertAfter([a, b, c], null, d).map((i) => i.heading)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('the designer', () => {
  it('edits the introduction and a card’s own title, autosaving without touching the Project', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Back to the page details' }));
    fireEvent.change(screen.getByLabelText('Introduction'), { target: { value: 'Hello, I make things.' } });
    expect(document.querySelector('.pfd-save')?.textContent).toContain('Saving');
    await waitFor(async () => expect((await stored()).intro).toBe('Hello, I make things.'), { timeout: 3000 });
    expect(document.querySelector('.pfd-save')?.textContent).toContain('Saved');

    fireEvent.click(screen.getByRole('button', { name: /^Project ?Tidewater/ }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Tidewater, for galleries' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Written for this page.' } });
    await waitFor(async () => {
      const card = (await stored()).items.find((i) => i.kind === 'project')!;
      expect(card).toMatchObject({ heading: 'Tidewater, for galleries', description: 'Written for this page.' });
    }, { timeout: 3000 });
    expect(await db.projects.get(projectId)).toMatchObject({ title: 'Tidewater', description: 'The Project’s own words.' });
  });

  it('adds a text section after the selected card, and changes card width', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /^Project ?Tidewater/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Wide' }));
    fireEvent.click(screen.getByRole('button', { name: 'Text section' }));
    fireEvent.change(screen.getByLabelText('Heading'), { target: { value: 'About' } });
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'A few words.' } });
    await waitFor(async () => {
      const items = (await stored()).items;
      expect(items.map((i) => i.kind)).toEqual(['heading', 'project', 'heading']);
      expect(items[1].layoutSpan).toBe(2);
      expect(items[2]).toMatchObject({ heading: 'About', description: 'A few words.' });
    }, { timeout: 3000 });
  });

  it('adds, hides and removes a Project cover, keeping the picture only while something uses it', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /^Project ?Tidewater/ }));
    const input = screen.getByLabelText('Project cover') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'cover.jpg', { type: 'image/jpeg' })] } });
    });
    await waitFor(async () => expect((await db.projects.get(projectId))?.coverAssetId).toBeTruthy());
    const cover = (await db.projects.get(projectId))!.coverAssetId!;
    expect(await db.assets.get(cover)).toBeDefined();

    // Shown on this card unless hidden; hiding is this portfolio's choice only.
    const show = await screen.findByLabelText('Show the picture here');
    expect((show as HTMLInputElement).checked).toBe(true);
    fireEvent.click(show);
    await waitFor(async () => expect((await stored()).items.find((i) => i.kind === 'project')?.image).toBe('none'));
    expect((await db.projects.get(projectId))?.coverAssetId).toBe(cover);
    fireEvent.click(screen.getByLabelText('Show the picture here'));

    // Replace, then remove.
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Project cover'), { target: { files: [new File(['y'], 'new.jpg', { type: 'image/jpeg' })] } });
    });
    await waitFor(async () => expect((await db.projects.get(projectId))?.coverAssetId).not.toBe(cover));
    await waitFor(async () => expect(await db.assets.get(cover)).toBeUndefined());
    const replaced = (await db.projects.get(projectId))!.coverAssetId!;
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(async () => expect((await db.projects.get(projectId))?.coverAssetId).toBeUndefined());
    await waitFor(async () => expect(await db.assets.get(replaced)).toBeUndefined());
    expect(await db.projects.get(projectId)).toMatchObject({ title: 'Tidewater', description: 'The Project’s own words.' });
  });

  it('says clearly when a change couldn’t be saved, and saves it on retry', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Back to the page details' }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const update = vi.spyOn(db.portfolios, 'update').mockRejectedValueOnce(new Error('disk full'));
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ana Ruiz' } });
    const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alert.textContent).toContain('Not saved');
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(async () => expect((await stored()).ownerName).toBe('Ana Ruiz'));
    expect(document.querySelector('.pfd-save')?.textContent).toContain('Saved');
    update.mockRestore();
    spy.mockRestore();
  });

  it('changes the page background, and back to the look’s own', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Back to the page details' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Night' }));
    await waitFor(async () => expect((await stored()).background).toBe('#1d1a22'), { timeout: 3000 });
    const canvas = document.querySelector('.pfd-canvas') as HTMLElement;
    expect(canvas.style.getPropertyValue('--pf-bg')).toBe('#1d1a22');
    fireEvent.click(screen.getByRole('radio', { name: 'The look’s own' }));
    await waitFor(async () => expect((await stored()).background).toBeNull(), { timeout: 3000 });
  });

  it('previews the real visitor page, with the draft still private', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('heading', { name: 'Ana' })).toBeTruthy();
    expect((await stored()).publication).toBeNull();
  });
});
