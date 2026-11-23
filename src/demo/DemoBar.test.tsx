import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DemoBar } from './DemoChrome';

afterEach(cleanup);

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DemoBar />
    </MemoryRouter>,
  );

describe('DemoBar', () => {
  it('shows on the app’s screens', () => {
    at('/');
    expect(screen.getByRole('region', { name: 'Demo' })).toBeTruthy();
    cleanup();
    at('/projects/abc');
    expect(screen.getByRole('region', { name: 'Demo' })).toBeTruthy();
  });

  it('stays off Stage view, so it never covers the words being performed', () => {
    at('/projects/abc/stage');
    expect(screen.queryByRole('region', { name: 'Demo' })).toBeNull();
  });
});
