import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UpdateNotification } from '../components/UpdateNotification.tsx';
import { UpdateDetails } from '../api/updater.ts';

const mockUpdate: UpdateDetails = {
  version: '0.2.0',
  currentVersion: '0.1.0',
  date: '2026-11-03T12:00:00Z',
  body: 'Fixes and performance improvements.\nNew cloud updater.',
  downloadAndInstall: vi.fn(),
};

vi.mock('../api/updater.ts', async () => {
  const actual = await vi.importActual('../api/updater.ts');
  return {
    ...actual,
    relaunchApp: vi.fn(),
  };
});

describe('UpdateNotification Component', () => {
  it('renders nothing when no update or status message is provided', () => {
    const { container } = render(
      <UpdateNotification update={null} onDismiss={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders status message toast when provided', () => {
    render(
      <UpdateNotification
        update={null}
        onDismiss={vi.fn()}
        statusMessage="You are running the latest version!"
      />
    );
    expect(screen.getByText('You are running the latest version!')).toBeInTheDocument();
  });

  it('renders update banner and allows viewing release notes', () => {
    render(<UpdateNotification update={mockUpdate} onDismiss={vi.fn()} />);

    expect(screen.getByText(/Update Available: v0.2.0/)).toBeInTheDocument();
    expect(screen.getByText(/Current: v0.1.0/)).toBeInTheDocument();

    // Toggle release notes
    fireEvent.click(screen.getByText('View release notes'));
    expect(screen.getByText(/New cloud updater/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Hide release notes'));
    expect(screen.queryByText(/New cloud updater/)).not.toBeInTheDocument();
  });

  it('handles download and install progress, then surfaces relaunch button', async () => {
    let progressCallback: (pct: number) => void = () => {};
    const downloadAndInstallMock = vi.fn().mockImplementation((cb: (pct: number) => void) => {
      progressCallback = cb;
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          progressCallback(50);
          progressCallback(100);
          resolve();
        }, 10);
      });
    });

    const updateWithMock: UpdateDetails = {
      ...mockUpdate,
      downloadAndInstall: downloadAndInstallMock,
    };

    render(<UpdateNotification update={updateWithMock} onDismiss={vi.fn()} />);

    fireEvent.click(screen.getByText('Update Now'));

    await waitFor(() => {
      expect(downloadAndInstallMock).toHaveBeenCalled();
      expect(screen.getByText('Relaunch Now')).toBeInTheDocument();
    });
  });

  it('calls onDismiss when close button is clicked', () => {
    const onDismissMock = vi.fn();
    render(<UpdateNotification update={mockUpdate} onDismiss={onDismissMock} />);

    fireEvent.click(screen.getByLabelText('Close update notification'));
    expect(onDismissMock).toHaveBeenCalledTimes(1);
  });
});
