import React from 'react';
import { Job, Game } from '../types/api.ts';
import { Play, Ban, ExternalLink, HardDriveDownload, HardDriveUpload, RefreshCw } from 'lucide-react';
import { formatBytes } from '../utils/format.ts';

interface ActiveTransferBannerProps {
  runningJob?: Job;
  games: Game[];
  onCancel: (jobId: string) => void;
  onNavigateQueue: () => void;
  cancelling: boolean;
}

export const ActiveTransferBanner: React.FC<ActiveTransferBannerProps> = ({
  runningJob,
  games,
  onCancel,
  onNavigateQueue,
  cancelling,
}) => {
  if (!runningJob || runningJob.status !== 'running') {
    return null;
  }

  const game = games.find((g) => String(g.app_id) === String(runningJob.app_id));
  const gameName = game ? game.name : `App ID ${runningJob.app_id}`;

  const typeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    promote: {
      label: 'Moving to Fast SSD',
      icon: <HardDriveDownload size={14} />,
      color: 'var(--primary)',
    },
    evict: {
      label: 'Evicting to HDD Master',
      icon: <HardDriveUpload size={14} />,
      color: 'var(--warning)',
    },
    backup: {
      label: 'Backing up to HDD Master',
      icon: <RefreshCw size={14} />,
      color: 'var(--success)',
    },
  };

  const actionInfo = typeConfig[runningJob.type] || {
    label: 'Transferring Game',
    icon: <Play size={14} />,
    color: 'var(--primary)',
  };

  const percent = Math.min(100, Math.max(0, Math.round(runningJob.progress_percent)));

  return (
    <div
      role="region"
      aria-label="Active Transfer Progress"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 1000,
        width: '360px',
        maxWidth: 'calc(100vw - 48px)',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.15)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        animation: 'slideUpPopup 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Top Header: Action Badge & Percent */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span
            style={{
              backgroundColor: 'var(--bg-main)',
              color: actionInfo.color,
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 8px',
              fontWeight: 600,
              fontSize: '0.75rem',
            }}
          >
            {actionInfo.icon}
            {actionInfo.label}
          </span>
        </div>

        <span
          style={{
            fontSize: '0.85rem',
            fontWeight: 700,
            color: 'var(--primary)',
          }}
        >
          {percent}%
        </span>
      </div>

      {/* Middle: Game Name & Transferred info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: '0.95rem',
            color: 'var(--text-main)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {gameName}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {formatBytes(runningJob.bytes_transferred)} / {formatBytes(runningJob.total_bytes)}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="progress-bar-bg" style={{ height: '6px', borderRadius: '3px' }}>
        <div
          className="progress-bar-fill"
          style={{
            width: `${percent}%`,
            backgroundColor: actionInfo.color,
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            borderRadius: '3px',
          }}
        />
      </div>

      {/* Footer Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '2px' }}>
        <button
          onClick={onNavigateQueue}
          className="btn-secondary"
          style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
          title="Open Transfer Queue tab"
        >
          <ExternalLink size={12} /> Queue
        </button>
        <button
          onClick={() => onCancel(runningJob.id)}
          disabled={cancelling}
          className="btn-danger"
          style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
          title="Cancel current transfer"
        >
          <Ban size={12} /> Cancel
        </button>
      </div>
    </div>
  );
};
