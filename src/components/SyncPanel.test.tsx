import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ConfirmProvider } from './Modal';
import { ToastProvider } from './Toast';
import { SyncPanel } from './SyncPanel';

const startOver = vi.fn(async () => {});
vi.mock('../sync/controller', () => ({
  useSyncStatus: () => ({ phase: 'needs-passphrase', email: 'artist@example.test', pending: 0 }),
  startOver: () => startOver(),
  unlock: vi.fn(),
  cancelSetup: vi.fn(),
  createPassphrase: vi.fn(),
  resyncEverything: vi.fn(),
  signIn: vi.fn(),
  stopSync: vi.fn(),
  syncNow: vi.fn(),
}));

beforeAll(() => {
  // jsdom has no <dialog> methods.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  startOver.mockClear();
});

function renderPanel() {
  render(
    <ToastProvider>
      <ConfirmProvider>
        <SyncPanel />
      </ConfirmProvider>
    </ToastProvider>,
  );
}

describe('forgotten passphrase', () => {
  it('offers to start over, and does nothing unless confirmed', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /forgot your passphrase/i }));
    const text = await screen.findByText(/Everything on this device stays/);
    fireEvent.click(within(text.closest('dialog')!).getByRole('button', { name: 'Cancel', hidden: true }));
    await waitFor(() => expect(screen.queryByText(/Everything on this device stays/)).toBeNull());
    expect(startOver).not.toHaveBeenCalled();
  });

  it('starts over once confirmed', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /forgot your passphrase/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Clear and start over', hidden: true }));
    await waitFor(() => expect(startOver).toHaveBeenCalledTimes(1));
  });
});
