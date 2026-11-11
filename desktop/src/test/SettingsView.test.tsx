import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsView } from '../components/SettingsView.tsx';
import { api } from '../api/client.ts';

vi.mock('../api/client.ts', () => ({
  getApiConfig: () => ({ baseUrl: 'http://127.0.0.1:8765', bearerToken: 'test-token' }),
  setApiConfig: vi.fn(),
  api: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    getHealth: vi.fn(),
  },
}));

describe('SettingsView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getPreferences as any).mockResolvedValue({
      close_steam_on_transfer: true,
      relaunch_steam_after_transfer: true,
      run_on_startup: false,
      theme: 'light',
      robocopy_threads: 8,
      robocopy_retries: 2,
      robocopy_wait_seconds: 2,
      robocopy_unbuffered: false,
    });
    (api.updatePreferences as any).mockResolvedValue({
      close_steam_on_transfer: true,
      relaunch_steam_after_transfer: false,
      run_on_startup: true,
      theme: 'light',
      robocopy_threads: 32,
      robocopy_retries: 4,
      robocopy_wait_seconds: 6,
      robocopy_unbuffered: true,
    });
    (api.getHealth as any).mockResolvedValue({
      version: '0.3.3-beta.2',
      uptime_seconds: 120,
      steam_running: true,
    });
  });

  it('renders sections and populates preferences from core', async () => {
    render(<SettingsView appVersion="v0.3.3-beta.2" steamRunning={true} />);

    expect(screen.getByText('Settings & Preferences')).toBeInTheDocument();
    expect(screen.getByText('Steam Transfer Lifecycle')).toBeInTheDocument();
    expect(screen.getByText('Core Service & Security')).toBeInTheDocument();
    expect(screen.getByText('System & Appearance')).toBeInTheDocument();
    expect(screen.getByText('App Updates')).toBeInTheDocument();

    await waitFor(() => {
      expect(api.getPreferences).toHaveBeenCalled();
    });
  });

  it('allows testing core connection', async () => {
    render(<SettingsView appVersion="v0.3.3-beta.2" steamRunning={true} />);

    const testBtn = screen.getByRole('button', { name: /test connection/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(api.getHealth).toHaveBeenCalled();
      expect(screen.getByText(/Connected! Core service is online/i)).toBeInTheDocument();
    });
  });

  it('saves updated preferences when clicking Save', async () => {
    const onSavedMock = vi.fn();
    render(<SettingsView appVersion="v0.3.3-beta.2" steamRunning={true} onSaved={onSavedMock} />);

    const saveBtn = screen.getByRole('button', { name: /save all changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updatePreferences).toHaveBeenCalled();
      expect(screen.getByText(/Settings saved and applied successfully/i)).toBeInTheDocument();
      expect(onSavedMock).toHaveBeenCalled();
    });
  });

  it('triggers onDirtyChange and shows danger banner when preferences are modified', async () => {
    const onDirtyChangeMock = vi.fn();
    render(<SettingsView onDirtyChange={onDirtyChangeMock} />);

    await waitFor(() => {
      expect(api.getPreferences).toHaveBeenCalled();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]); // Toggle first checkbox

    await waitFor(() => {
      expect(onDirtyChangeMock).toHaveBeenCalledWith(true);
      expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^discard$/i })).toBeInTheDocument();
    });

    // Clicking discard reverts dirty state
    const discardBtn = screen.getByRole('button', { name: /^discard$/i });
    fireEvent.click(discardBtn);

    await waitFor(() => {
      expect(onDirtyChangeMock).toHaveBeenCalledWith(false);
      expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument();
    });
  });

  it('switches sub-settings tabs and persists Robocopy engine configuration', async () => {
    render(<SettingsView appVersion="v0.3.3-beta.2" steamRunning={true} />);

    await waitFor(() => {
      expect(api.getPreferences).toHaveBeenCalled();
    });

    // Switch strictly to Robocopy Config tab
    fireEvent.click(screen.getByRole('button', { name: 'Robocopy Config' }));
    expect(screen.getByText('Robocopy Transfer Engine')).toBeInTheDocument();
    expect(screen.queryByText('App Updates')).not.toBeInTheDocument();

    // Update threads via preset button, retries, wait, and unbuffered toggle
    fireEvent.click(screen.getByRole('button', { name: '32 threads' }));
    fireEvent.change(screen.getByLabelText(/Retry Attempts/i), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText(/Retry Wait Delay/i), { target: { value: '6' } });
    fireEvent.click(screen.getByLabelText(/Use Unbuffered Disk I\/O/i));

    fireEvent.click(screen.getByRole('button', { name: /save all changes/i }));

    await waitFor(() => {
      expect(api.updatePreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          robocopy_threads: 32,
          robocopy_retries: 4,
          robocopy_wait_seconds: 6,
          robocopy_unbuffered: true,
        })
      );
    });
  });
});
