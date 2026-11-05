import React, { useEffect } from 'react';
import { ToastMessage } from '../types/toast.ts';
import { CheckCircle2, AlertTriangle, Info, AlertCircle, X } from 'lucide-react';

interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const duration = toast.durationMs ?? (toast.type === 'error' ? 8000 : 5000);
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, duration);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const borderColors = {
    success: 'rgba(34, 197, 94, 0.4)',
    error: 'rgba(239, 68, 68, 0.5)',
    warning: 'rgba(245, 158, 11, 0.4)',
    info: 'rgba(59, 130, 246, 0.4)',
  };

  const bgColors = {
    success: 'rgba(20, 35, 25, 0.95)',
    error: 'rgba(40, 20, 20, 0.95)',
    warning: 'rgba(35, 30, 15, 0.95)',
    info: 'rgba(20, 28, 45, 0.95)',
  };

  const icons = {
    success: <CheckCircle2 size={18} style={{ color: 'var(--success, #22c55e)' }} />,
    error: <AlertTriangle size={18} style={{ color: 'var(--danger, #ef4444)' }} />,
    warning: <AlertCircle size={18} style={{ color: 'var(--warning, #f59e0b)' }} />,
    info: <Info size={18} style={{ color: 'var(--primary, #3b82f6)' }} />,
  };

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      style={{
        background: bgColors[toast.type],
        border: `1px solid ${borderColors[toast.type]}`,
        borderRadius: 'var(--radius, 8px)',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(8px)',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        width: '360px',
        maxWidth: 'calc(100vw - 32px)',
        animation: 'slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div style={{ flexShrink: 0, marginTop: '2px' }}>{icons[toast.type]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff', marginBottom: '2px' }}>
          {toast.title}
        </div>
        <div
          style={{
            fontSize: '0.8rem',
            color: 'rgba(255, 255, 255, 0.8)',
            lineHeight: 1.35,
            wordBreak: 'break-word',
          }}
        >
          {toast.message}
        </div>
        {toast.actionLabel && toast.onAction && (
          <button
            onClick={() => {
              toast.onAction?.();
              onDismiss(toast.id);
            }}
            className="btn-primary"
            style={{
              marginTop: '8px',
              padding: '3px 8px',
              fontSize: '0.75rem',
            }}
          >
            {toast.actionLabel}
          </button>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'rgba(255, 255, 255, 0.5)',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
        }}
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC<{
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        pointerEvents: 'auto',
      }}
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
