import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SwapConfirmModal, SwapAction } from '../components/SwapConfirmModal.tsx';
import { Library } from '../types/api.ts';

const mockLibraries: Library[] = [
  { id: 'ssd1', name: 'Fast SSD', type: 'ssd_cache', total_bytes: 1000 * 1024 * 1024 * 1024, free_bytes: 500 * 1024 * 1024 * 1024 },
  { id: 'hdd1', name: 'Master HDD', type: 'hdd_master', total_bytes: 4000 * 1024 * 1024 * 1024, free_bytes: 2000 * 1024 * 1024 * 1024 },
];

const promoteAction: SwapAction = {
  type: 'promote',
  appId: 105600,
  title: 'Terraria',
  sizeBytes: 512 * 1024 * 1024,
  targetLibraryId: 'ssd1',
};

describe('SwapConfirmModal Component', () => {
  it('shows game details, drive impact and safety guarantees', () => {
    render(
      <SwapConfirmModal
        action={promoteAction}
        libraries={mockLibraries}
        loading={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText(/Move to SSD/)).toBeInTheDocument();
    expect(screen.getByText(/App ID: 105600/)).toBeInTheDocument();
    expect(screen.getByText(/Safety Guarantees/i)).toBeInTheDocument();
    expect(screen.getByText(/bit-for-bit verified/i)).toBeInTheDocument();
  });

  it('calls onConfirm on Confirm Transfer', () => {
    const onConfirm = vi.fn();
    render(
      <SwapConfirmModal
        action={promoteAction}
        libraries={mockLibraries}
        loading={false}
        error={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Confirm Transfer'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables confirm when the transfer exceeds target SSD free space', () => {
    render(
      <SwapConfirmModal
        action={{ ...promoteAction, sizeBytes: 600 * 1024 * 1024 * 1024 }}
        libraries={mockLibraries}
        loading={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/exceed the SSD/i)).toBeInTheDocument();
    expect(screen.getByText('Confirm Transfer')).toBeDisabled();
  });

  it('renders nothing without an action', () => {
    cleanup();
    const { container } = render(
      <SwapConfirmModal
        action={null}
        libraries={mockLibraries}
        loading={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
