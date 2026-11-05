import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toast, ToastContainer } from '../components/Toast.tsx';
import { ToastMessage } from '../types/toast.ts';

describe('Toast and ToastContainer Components', () => {
  it('renders a toast with title, message and action button', () => {
    const onDismiss = vi.fn();
    const onAction = vi.fn();

    const toast: ToastMessage = {
      id: 'toast-1',
      type: 'error',
      title: 'Transfer Failed',
      message: 'Robocopy error 8: disk full',
      actionLabel: 'View Logs',
      onAction,
      durationMs: 10000,
    };

    render(<Toast toast={toast} onDismiss={onDismiss} />);

    expect(screen.getByText('Transfer Failed')).toBeInTheDocument();
    expect(screen.getByText('Robocopy error 8: disk full')).toBeInTheDocument();

    const actionBtn = screen.getByText('View Logs');
    fireEvent.click(actionBtn);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('toast-1');
  });

  it('renders multiple toasts inside ToastContainer', () => {
    const onDismiss = vi.fn();
    const toasts: ToastMessage[] = [
      { id: '1', type: 'success', title: 'Done 1', message: 'Success message 1' },
      { id: '2', type: 'info', title: 'Info 2', message: 'Info message 2' },
    ];

    render(<ToastContainer toasts={toasts} onDismiss={onDismiss} />);

    expect(screen.getByText('Done 1')).toBeInTheDocument();
    expect(screen.getByText('Info 2')).toBeInTheDocument();
  });
});
