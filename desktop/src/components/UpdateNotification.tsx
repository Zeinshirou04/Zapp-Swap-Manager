import React, { useState } from 'react';
import { UpdateDetails, relaunchApp } from '../api/updater.ts';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Download, Loader2, Sparkles, X } from 'lucide-react';

interface UpdateNotificationProps {
  update: UpdateDetails | null;
  onDismiss: () => void;
  statusMessage?: string | null;
  onClearStatus?: () => void;
  hasActiveJobs?: boolean;
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({
  update,
  onDismiss,
  statusMessage,
  onClearStatus,
  hasActiveJobs = false,
}) => {
  const [showNotes, setShowNotes] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [readyToRelaunch, setReadyToRelaunch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!update && !statusMessage) return null;

  // Informational status toast (e.g. "You're running the latest version!")
  if (!update && statusMessage) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 100,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '0.875rem',
        }}
      >
        <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
        <span>{statusMessage}</span>
        {onClearStatus && (
          <button
            onClick={onClearStatus}
            aria-label="Dismiss"
            className="btn-secondary"
            style={{ padding: '2px 4px', border: 'none', background: 'transparent' }}
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  }

  if (!update) return null;

  const handleUpdate = async () => {
    try {
      setDownloading(true);
      setError(null);
      setProgress(0);
      await update.downloadAndInstall((pct) => {
        setProgress(pct);
      });
      setReadyToRelaunch(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update installation failed');
      setDownloading(false);
    }
  };

  const handleRelaunch = async () => {
    try {
      await relaunchApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to relaunch application');
    }
  };

  return (
    <div
      role="region"
      aria-label="Application Update"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 100,
        maxWidth: '460px',
        width: 'calc(100% - 48px)',
        background: 'var(--bg-card)',
        border: '1px solid var(--primary)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
        padding: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              background: 'rgba(99, 102, 241, 0.15)',
              color: 'var(--primary)',
              padding: '8px',
              borderRadius: 'var(--radius)',
              display: 'flex',
            }}
          >
            <Sparkles size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>
              Update Available: v{update.version}
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
              Current: v{update.currentVersion} {update.date && `• Released ${update.date.slice(0, 10)}`}
            </p>
          </div>
        </div>

        {!downloading && (
          <button
            onClick={onDismiss}
            aria-label="Close update notification"
            className="btn-secondary"
            style={{ padding: '4px', border: 'none', background: 'transparent' }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {update.body && (
        <div style={{ marginTop: '10px' }}>
          <button
            onClick={() => setShowNotes(!showNotes)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--primary)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: 0,
            }}
          >
            {showNotes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showNotes ? 'Hide release notes' : 'View release notes'}
          </button>
          {showNotes && (
            <div
              style={{
                marginTop: '8px',
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.25)',
                borderRadius: 'var(--radius)',
                fontSize: '0.8rem',
                maxHeight: '140px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                color: 'var(--text-main)',
              }}
            >
              {update.body}
            </div>
          )}
        </div>
      )}

      {/* Progress meter while downloading */}
      {downloading && !readyToRelaunch && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
            <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Loader2 size={12} className="spin" />
              {progress >= 100
                ? 'Installing update & restarting...'
                : progress > 0
                ? 'Downloading update package...'
                : 'Connecting to update server...'}
            </span>
            <span style={{ fontWeight: 600 }}>{progress}%</span>
          </div>
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{
                width: `${Math.max(progress, progress === 0 ? 3 : progress)}%`,
                backgroundColor: 'var(--primary)',
              }}
            />
          </div>
        </div>
      )}

      {readyToRelaunch && (
        <div style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--success)' }}>
          Update installed successfully! Relaunch now to apply changes.
        </div>
      )}

      {hasActiveJobs && (
        <div
          role="alert"
          style={{
            marginTop: '10px',
            padding: '8px 12px',
            background: 'var(--warning-subtle, rgba(217, 119, 6, 0.12))',
            border: '1px solid var(--warning, #d97706)',
            borderRadius: 'var(--radius)',
            color: 'var(--warning)',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>Active file transfer in progress. Please wait until transfers finish before updating.</span>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: '10px',
            padding: '8px',
            background: 'rgba(239, 68, 68, 0.15)',
            borderRadius: 'var(--radius)',
            color: 'var(--danger)',
            fontSize: '0.8rem',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
        {error && !downloading && (
          <button
            onClick={handleUpdate}
            disabled={hasActiveJobs}
            title={hasActiveJobs ? 'Cannot update while a transfer is in progress' : undefined}
            className="btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.85rem',
              padding: '6px 14px',
              opacity: hasActiveJobs ? 0.6 : 1,
              cursor: hasActiveJobs ? 'not-allowed' : 'pointer',
            }}
          >
            <Download size={14} /> Retry Update
          </button>
        )}
        {!downloading && !readyToRelaunch && !error && (
          <button
            onClick={handleUpdate}
            disabled={hasActiveJobs}
            title={hasActiveJobs ? 'Cannot update while a transfer is in progress' : undefined}
            className="btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.85rem',
              padding: '6px 14px',
              opacity: hasActiveJobs ? 0.6 : 1,
              cursor: hasActiveJobs ? 'not-allowed' : 'pointer',
            }}
          >
            <Download size={14} /> Update Now
          </button>
        )}
        {readyToRelaunch && (
          <button
            onClick={handleRelaunch}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '6px 14px' }}
          >
            <Sparkles size={14} /> Relaunch Now
          </button>
        )}
      </div>
    </div>
  );
};
