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
    });
    (api.updatePreferences as any).mockResolvedValue({
      close_steam_on_transfer: true,
      relaunch_steam_after_transfer: false,
      run_on_startup: true,
      theme: 'light',
    });
    (api.getHealth as any).mockResolvedValue({
      version: '0.3.1-beta.5',
      uptime_seconds: 120,
      steam_running: true,
    });
  });

  it('renders sections and populates preferences from core', async () => {
    render(<SettingsView appVersion="v0.3.1-beta.5" steamRunning={true} />);

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
    render(<SettingsView appVersion="v0.3.1-beta.5" steamRunning={true} />);

    const testBtn = screen.getByRole('button', { name: /test connection/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(api.getHealth).toHaveBeenCalled();
      expect(screen.getByText(/Connected! Core service is online/i)).toBeInTheDocument();
    });
  });

  it('saves updated preferences when clicking Save', async () => {
    const onSavedMock = vi.fn();
    render(<SettingsView appVersion="v0.3.1-beta.5" steamRunning={true} onSaved={onSavedMock} />);

    const saveBtn = screen.getByRole('button', { name: /save all changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updatePreferences).toHaveBeenCalled();
      expect(screen.getByText(/Settings saved and applied successfully/i)).toBeInTheDocument();
      expect(onSavedMock).toHaveBeenCalled();
    });
  });
});
