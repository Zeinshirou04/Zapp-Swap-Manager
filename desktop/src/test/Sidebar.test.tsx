import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../components/Sidebar.tsx';

describe('Sidebar Component', () => {
  const defaultProps = {
    activeRoute: 'dashboard' as const,
    onRouteChange: vi.fn(),
    gamesCount: 15,
    drivesCount: 2,
    queueCount: 1,
    steamRunning: true,
    appVersion: '0.2.6',
    onOpenWizard: vi.fn(),
  };

  it('renders navigation items and badge counts', () => {
    render(<Sidebar {...defaultProps} />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Games Library')).toBeInTheDocument();
    expect(screen.getByText('Drives & Storage')).toBeInTheDocument();
    expect(screen.getByText('Transfer Queue')).toBeInTheDocument();
    expect(screen.getByText('Service Logs')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();

    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();

    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('v0.2.6')).toBeInTheDocument();
  });

  it('triggers route changes and setup wizard', () => {
    render(<Sidebar {...defaultProps} />);

    fireEvent.click(screen.getByText('Games Library'));
    expect(defaultProps.onRouteChange).toHaveBeenCalledWith('games');

    fireEvent.click(screen.getByText('Setup Wizard'));
    expect(defaultProps.onOpenWizard).toHaveBeenCalledTimes(1);
  });
});
