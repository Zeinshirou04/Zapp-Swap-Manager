import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LibraryWizardModal } from '../components/LibraryWizardModal.tsx';
import { DetectedLibrary } from '../types/api.ts';

const mockDetected: DetectedLibrary[] = [
  { id: 'lib-c0ffee', path: 'C:\\SteamLibrary', drive_type: 'fixed', total_bytes: 1000 * 1024 * 1024 * 1024, free_bytes: 500 * 1024 * 1024 * 1024 },
  { id: 'lib-deadbeef', path: 'D:\\SteamLibrary', drive_type: 'fixed', total_bytes: 4000 * 1024 * 1024 * 1024, free_bytes: 3500 * 1024 * 1024 * 1024 },
];

const detectMock = vi.hoisted(() => vi.fn());
const registerMock = vi.hoisted(() => vi.fn());

vi.mock('../api/client.ts', () => ({
  api: {
    detectLibraries: detectMock,
    registerLibraries: registerMock,
  },
}));

describe('LibraryWizardModal Component', () => {
  beforeEach(() => {
    detectMock.mockReset().mockResolvedValue(mockDetected);
    registerMock.mockReset().mockResolvedValue([]);
  });

  it('detects libraries, assigns roles and registers them', async () => {
    const onSaved = vi.fn();
    render(<LibraryWizardModal open onClose={vi.fn()} onSaved={onSaved} />);

    // Step 1: detection ran, both entries listed and pre-selected
    expect(await screen.findByText('C:\\SteamLibrary')).toBeInTheDocument();
    expect(screen.getByText('D:\\SteamLibrary')).toBeInTheDocument();

    // Step 2: assign roles
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const ssdButtons = screen.getAllByRole('button', { name: /SSD Cache/ });
    const hddButtons = screen.getAllByRole('button', { name: /HDD Master/ });
    fireEvent.click(ssdButtons[0]);
    fireEvent.click(hddButtons[1]);

    // Step 3: save -> register payload + scan callback
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: /Save & Scan Games/ }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith([
        { type: 'ssd_cache', path: 'C:\\SteamLibrary' },
        { type: 'hdd_master', path: 'D:\\SteamLibrary' },
      ]);
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
  });

  it('cannot continue with no selected libraries', async () => {
    render(<LibraryWizardModal open onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByText('C:\\SteamLibrary');

    // Unselect both entries
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getAllByRole('checkbox')[1]);

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('shows a registration error and stays open', async () => {
    registerMock.mockRejectedValue(new Error('boom'));
    render(<LibraryWizardModal open onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByText('C:\\SteamLibrary');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getAllByRole('button', { name: /SSD Cache/ })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /HDD Master/ })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: /Save & Scan Games/ }));

    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save & Scan Games/ })).toBeInTheDocument();
  });
});
