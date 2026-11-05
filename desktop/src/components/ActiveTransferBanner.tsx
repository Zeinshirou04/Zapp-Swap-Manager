import React from 'react';
import { Job, Game } from '../types/api.ts';
import { Play, Ban, ExternalLink, HardDriveDownload, HardDriveUpload, RefreshCw } from 'lucide-react';

interface ActiveTransferBannerProps {
  runningJob?: Job;
  games: Game[];
  onCancel: (jobId: string) => void;
  onNavigateQueue: () => void;
  cancelling: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
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
      color: 'var(--primary, #3b82f6)',
    },
    evict: {
      label: 'Evicting to HDD Master',
      icon: <HardDriveUpload size={15} />,
      color: 'var(--warning, #f59e0b)',
    },
    backup: {
      label: 'Backing up to HDD Master',
      icon: <RefreshCw size={15} />,
      color: 'var(--success, #22c55e)',
    },
  };

  const actionInfo = typeConfig[runningJob.type] || {
    label: 'Transferring Game',
    icon: <Play size={15} />,
    color: 'var(--primary, #3b82f6)',
  };

  const percent = Math.min(100, Math.max(0, Math.round(runningJob.progress_percent)));

  return (
    <div
      style={{
        background: 'linear-gradient(180deg, rgba(20, 25, 40, 0.95), rgba(15, 18, 30, 0.98))',
        borderBottom: '1px solid rgba(59, 130, 246, 0.3)',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.4)',
        padding: '10px 18px',
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
            className="badge"
            style={{
              background: 'rgba(59, 130, 246, 0.15)',
              color: actionInfo.color,
              border: `1px solid ${actionInfo.color}`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              fontWeight: 600,
            }}
          >
            {actionInfo.icon}
            {actionInfo.label}
          </span>
          <span
            style={{
              fontWeight: 600,
              fontSize: '0.92rem',
              color: '#fff',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {gameName}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>
            {formatBytes(runningJob.bytes_transferred)} / {formatBytes(runningJob.total_bytes)}
            <strong style={{ color: '#fff', marginLeft: '8px' }}>{percent}%</strong>
          </span>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onNavigateQueue}
              className="btn-secondary"
              style={{ padding: '4px 8px', fontSize: '0.75rem', gap: '4px' }}
              title="Open Transfer Queue tab"
            >
              <ExternalLink size={12} /> Queue
            </button>
            <button
              onClick={() => onCancel(runningJob.id)}
              disabled={cancelling}
              className="btn-danger"
              style={{ padding: '4px 8px', fontSize: '0.75rem', gap: '4px' }}
              title="Cancel current transfer"
            >
              <Ban size={12} /> Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Real-time animated progress bar */}
      <div
        style={{
          width: '100%',
          height: '6px',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '3px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percent}%`,
            backgroundColor: actionInfo.color,
            borderRadius: '3px',
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: `0 0 8px ${actionInfo.color}`,
          }}
        />
      </div>
    </div>
  );
};
