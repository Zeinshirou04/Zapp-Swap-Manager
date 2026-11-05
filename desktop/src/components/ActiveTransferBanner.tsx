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
      icon: <HardDriveDownload size={15} />,
      color: 'var(--primary)',
    },
    evict: {
      label: 'Evicting to HDD Master',
      icon: <HardDriveUpload size={15} />,
      color: 'var(--warning)',
    },
    backup: {
      label: 'Backing up to HDD Master',
      icon: <RefreshCw size={15} />,
      color: 'var(--success)',
    },
  };

  const actionInfo = typeConfig[runningJob.type] || {
    label: 'Transferring Game',
    icon: <Play size={15} />,
    color: 'var(--primary)',
  };

  const percent = Math.min(100, Math.max(0, Math.round(runningJob.progress_percent)));

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)',
        padding: '12px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <span
            style={{
              backgroundColor: 'var(--bg-main)',
              color: actionInfo.color,
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              fontWeight: 600,
              fontSize: '0.8rem',
            }}
          >
            {actionInfo.icon}
            {actionInfo.label}
          </span>
          <span
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
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {formatBytes(runningJob.bytes_transferred)} / {formatBytes(runningJob.total_bytes)}
            <strong style={{ color: 'var(--text-main)', marginLeft: '8px' }}>{percent}%</strong>
          </span>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onNavigateQueue}
              className="btn-secondary"
              style={{ padding: '5px 10px', fontSize: '0.78rem', gap: '4px' }}
              title="Open Transfer Queue tab"
            >
              <ExternalLink size={13} /> Queue
            </button>
            <button
              onClick={() => onCancel(runningJob.id)}
              disabled={cancelling}
              className="btn-danger"
              style={{ padding: '5px 10px', fontSize: '0.78rem', gap: '4px' }}
              title="Cancel current transfer"
            >
              <Ban size={13} /> Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Real-time progress bar */}
      <div className="progress-bar-bg" style={{ height: '6px' }}>
        <div
          className="progress-bar-fill"
          style={{
            width: `${percent}%`,
            backgroundColor: actionInfo.color,
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>
    </div>
  );
};
