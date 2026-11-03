import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectView } from '../components/ConnectView.tsx';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

const getHealthMock = vi.hoisted(() => vi.fn());
const setApiConfigMock = vi.hoisted(() => vi.fn());
vi.mock('../api/client.ts', () => ({
  api: { getHealth: (...args: unknown[]) => getHealthMock(...args) },
  setApiConfig: (...args: unknown[]) => setApiConfigMock(...args),
  getApiConfig: () => ({ baseUrl: 'http://127.0.0.1:8765', bearerToken: '' }),
}));

beforeEach(() => {
  invokeMock.mockReset();
  getHealthMock.mockReset();
  setApiConfigMock.mockReset();
  invokeMock.mockImplementation((cmd: string) => {
    switch (cmd) {
      case 'get_core_status':
        return Promise.resolve({ running: false, pid: null, port: 8765 });
      case 'start_core_daemon':
        return Promise.resolve({ started: true, pid: 123 });
      case 'read_local_auth_token':
        return Promise.resolve('token123');
      default:
        return Promise.reject(new Error(`unexpected command: ${cmd}`));
    }
  });
});

describe('ConnectView Component', () => {
  it('shows core service as Not Running before connecting', async () => {
    const onConnected = vi.fn();
    render(<ConnectView onConnected={onConnected} />);

    await waitFor(() => expect(screen.getByText('Not Running')).toBeInTheDocument());
    expect(screen.getByText('Start Core & Connect')).toBeInTheDocument();
    expect(onConnected).not.toHaveBeenCalled();
  });

  it('local mode starts the daemon, applies the paired token and connects', async () => {
    getHealthMock.mockResolvedValue({ version: '0.1.0', uptime_seconds: 1, steam_running: false });
    const onConnected = vi.fn();
    render(<ConnectView onConnected={onConnected} />);

    fireEvent.click(screen.getByText('Start Core & Connect'));

    await waitFor(() => expect(onConnected).toHaveBeenCalled());
    expect(invokeMock).toHaveBeenCalledWith('start_core_daemon');
    expect(setApiConfigMock).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:8765',
      bearerToken: 'token123',
    });
  });

  it('remote mode connects with a custom URL and token', async () => {
    getHealthMock.mockResolvedValue({ version: '0.1.0', uptime_seconds: 1, steam_running: false });
    const onConnected = vi.fn();
    render(<ConnectView onConnected={onConnected} />);

    fireEvent.click(screen.getByRole('tab', { name: /Remote Mode/i }));
    fireEvent.change(screen.getByPlaceholderText(/tunnel\.example\.com/), {
      target: { value: 'https://tunnel.example.com/' },
    });
    fireEvent.change(screen.getByPlaceholderText(/auth token/i), {
      target: { value: 'remote-token' },
    });
    fireEvent.click(screen.getByText('Connect'));

    await waitFor(() => expect(onConnected).toHaveBeenCalled());
    expect(setApiConfigMock).toHaveBeenCalledWith({
      baseUrl: 'https://tunnel.example.com',
      bearerToken: 'remote-token',
    });
  });

  it('shows an error when the core never becomes healthy', async () => {
    vi.useFakeTimers();
    try {
      getHealthMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
      const onConnected = vi.fn();
      render(<ConnectView onConnected={onConnected} />);

      fireEvent.click(screen.getByText('Start Core & Connect'));
      await vi.advanceTimersByTimeAsync(20000); // full 30x500ms retry window

      expect(screen.getByText(/did not become healthy/)).toBeInTheDocument();
      expect(onConnected).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
