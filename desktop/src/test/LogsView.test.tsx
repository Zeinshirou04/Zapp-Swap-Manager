import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LogsView } from '../components/LogsView.tsx';
import { api } from '../api/client.ts';

vi.mock('../api/client.ts', () => ({
  api: {
    getLogs: vi.fn(),
  },
}));

vi.mock('../api/native.ts', () => ({
  openLogsFolder: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

describe('LogsView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and displays log lines and allows filtering', async () => {
    vi.mocked(api.getLogs).mockResolvedValue({
      lines: [
        'time=2026-11-05T00:00:01Z level=INFO msg="starting core"',
        'time=2026-11-05T00:00:02Z level=WARN msg="steam discovery warning"',
        'time=2026-11-05T00:00:03Z level=ERROR msg="robocopy error 8"',
      ],
    });

    render(<LogsView />);

    await waitFor(() => {
      expect(screen.getByText(/starting core/)).toBeInTheDocument();
      expect(screen.getByText(/steam discovery warning/)).toBeInTheDocument();
      expect(screen.getByText(/robocopy error 8/)).toBeInTheDocument();
    });

    // Test search filter
    const searchInput = screen.getByPlaceholderText(/Search logs/i);
    fireEvent.change(searchInput, { target: { value: 'robocopy' } });

    expect(screen.queryByText(/starting core/)).not.toBeInTheDocument();
    expect(screen.getByText(/robocopy error 8/)).toBeInTheDocument();

    // Reset search, test level filter
    fireEvent.change(searchInput, { target: { value: '' } });
    fireEvent.click(screen.getByText('error'));

    expect(screen.queryByText(/starting core/)).not.toBeInTheDocument();
    expect(screen.getByText(/robocopy error 8/)).toBeInTheDocument();
  });
});
