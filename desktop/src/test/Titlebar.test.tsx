import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Titlebar } from '../components/Titlebar.tsx';

describe('Titlebar Component', () => {
  const defaultProps = {
    currentRoute: 'dashboard',
    canGoBack: true,
    canGoForward: false,
    onGoBack: vi.fn(),
    onGoForward: vi.fn(),
    onRefresh: vi.fn(),
    loading: false,
    onNavigateHome: vi.fn(),
    health: { version: '0.2.6', uptime_seconds: 120, steam_running: true },
    onOpenSettings: vi.fn(),
    onRestartCore: vi.fn(),
    onDisconnect: vi.fn(),
    onCheckUpdates: vi.fn(),
    checkingUpdates: false,
    onMinimize: vi.fn(),
    onToggleMaximize: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders titlebar, back button, and home button', () => {
    render(<Titlebar {...defaultProps} />);

    expect(screen.getByText('Zapp')).toBeInTheDocument();
    expect(screen.getByText('Core v0.2.6')).toBeInTheDocument();

    const backBtn = screen.getByLabelText('Back');
    expect(backBtn).toBeEnabled();
    fireEvent.click(backBtn);
    expect(defaultProps.onGoBack).toHaveBeenCalledTimes(1);

    const fwdBtn = screen.getByLabelText('Forward');
    expect(fwdBtn).toBeDisabled();

    const refreshBtn = screen.getByLabelText('Refresh');
    fireEvent.click(refreshBtn);
    expect(defaultProps.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('opens core menu dropdown on status pill click', () => {
    render(<Titlebar {...defaultProps} />);

    const corePill = screen.getByText('Core v0.2.6');
    fireEvent.click(corePill);

    expect(screen.getByText('Check for Updates')).toBeInTheDocument();
    expect(screen.getByText('Restart Core')).toBeInTheDocument();
    expect(screen.getByText('Disconnect')).toBeInTheDocument();
  });

  it('renders native-style window controls and dispatches window callbacks', () => {
    render(<Titlebar {...defaultProps} />);

    const minimizeBtn = screen.getByLabelText('Minimize');
    fireEvent.click(minimizeBtn);
    expect(defaultProps.onMinimize).toHaveBeenCalledTimes(1);

    const maximizeBtn = screen.getByLabelText('Maximize');
    fireEvent.click(maximizeBtn);
    expect(defaultProps.onToggleMaximize).toHaveBeenCalledTimes(1);

    const closeBtn = screen.getByLabelText('Close');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });
});
