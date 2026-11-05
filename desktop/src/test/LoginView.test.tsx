import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginView } from '../components/LoginView.tsx';
import * as serverApi from '../api/server.ts';

vi.mock('../api/server.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof serverApi>();
  return {
    ...actual,
    serverLogin: vi.fn(),
    serverRegister: vi.fn(),
    serverListDevices: vi.fn(),
    serverRegisterDevice: vi.fn(),
  };
});

describe('LoginView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Laravel-style brand panel and login form correctly', () => {
    render(<LoginView onConnected={vi.fn()} onDirectLocalMode={vi.fn()} />);

    expect(screen.getByText('Zapp Swap')).toBeInTheDocument();
    expect(screen.getByText(/Gaming PC Storage Manager/i)).toBeInTheDocument();
    expect(screen.getByText('Real-time WebSocket server relay')).toBeInTheDocument();
    expect(screen.getByText('Homeserver Address')).toBeInTheDocument();
    expect(screen.getByText('Email Address')).toBeInTheDocument();
    expect(screen.getByText('Password')).toBeInTheDocument();
    expect(screen.getByText('Direct Local LAN Mode (Offline)')).toBeInTheDocument();
  });

  it('toggles between Sign In and Create an Account modes', () => {
    render(<LoginView onConnected={vi.fn()} onDirectLocalMode={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.queryByText('Display Name')).not.toBeInTheDocument();

    // Click toggle
    fireEvent.click(screen.getByText('Need an account?'));

    expect(screen.getByRole('heading', { name: 'Create an Account' })).toBeInTheDocument();
    expect(screen.getByText('Display Name')).toBeInTheDocument();
    expect(screen.getByText('Already have an account?')).toBeInTheDocument();
  });

  it('triggers onDirectLocalMode when Direct Local LAN button is clicked', () => {
    const onDirectLocalMode = vi.fn();
    render(<LoginView onConnected={vi.fn()} onDirectLocalMode={onDirectLocalMode} />);

    fireEvent.click(screen.getByText('Direct Local LAN Mode (Offline)'));
    expect(onDirectLocalMode).toHaveBeenCalledTimes(1);
  });

  it('submits login credentials and calls onConnected upon success', async () => {
    const mockLogin = vi.mocked(serverApi.serverLogin).mockResolvedValue({
      token: 'jwt-token-123',
      user: {
        id: 'u-1',
        email: 'gamer@example.com',
        display_name: 'Gamer',
        created_at: new Date().toISOString(),
      },
    });

    vi.mocked(serverApi.serverListDevices).mockResolvedValue([
      {
        id: 'dev-1',
        name: 'Gaming Rig',
        online: true,
        created_at: new Date().toISOString(),
      },
    ]);

    const onConnected = vi.fn();
    render(<LoginView onConnected={onConnected} onDirectLocalMode={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('user@example.com'), {
      target: { value: 'gamer@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Sign In to Homeserver/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        expect.any(String),
        'gamer@example.com',
        'password123'
      );
      expect(onConnected).toHaveBeenCalled();
    });
  });
});
