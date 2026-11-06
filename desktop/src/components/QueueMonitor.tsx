import React from 'react';
import { Job, Game } from '../types/api.ts';
import { Clock, Play, CheckCircle2, AlertCircle, XCircle, Ban } from 'lucide-react';

interface QueueMonitorProps {
  jobs: Job[];
  games?: Game[];
  onCancelJob: (jobId: string) => void;
  cancelling: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
}

export const QueueMonitor: React.FC<QueueMonitorProps> = ({
  jobs,
  games = [],
  onCancelJob,
  cancelling,
}) => {
  const activeOrRecentJobs = jobs.slice(0, 10);

  if (activeOrRecentJobs.length === 0) {
    return (
      <div className="card" style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Clock size={32} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
        <p style={{ margin: 0, fontSize: '0.9rem' }}>No transfer jobs in queue or history.</p>
      </div>
    );
  }

  const activeCount = jobs.filter((j) => j.status === 'running' || j.status === 'queued').length;

  return (
    <div className="card" style={{ padding: '16px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={18} style={{ color: 'var(--primary)' }} />
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>Active Swap Queue</h2>
          {activeCount > 0 && (
            <span className="badge badge-queued">{activeCount} active</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {activeOrRecentJobs.map((job) => {
          const isRunning = job.status === 'running';
          const isQueued = job.status === 'queued';
          const isSucceeded = job.status === 'succeeded';
          const isFailed = job.status === 'failed';
          const isCancelled = job.status === 'cancelled';

          const game = games.find((g) => String(g.app_id) === String(job.app_id));
          const title = game?.name || `App ${job.app_id}`;

          const actionLabel =
            job.type === 'promote'
              ? 'Move to SSD'
              : job.type === 'evict'
              ? 'Move to HDD'
              : 'Backup to HDD';

          return (
            <div
              key={job.id}
              style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isRunning && <Play size={18} style={{ color: 'var(--primary)' }} />}
                    {isQueued && <Clock size={18} style={{ color: 'var(--warning)' }} />}
                    {isSucceeded && <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />}
                    {isFailed && <AlertCircle size={18} style={{ color: 'var(--danger)' }} />}
                    {isCancelled && <XCircle size={18} style={{ color: 'var(--text-muted)' }} />}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        color: 'var(--text-main)',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                      }}
                    >
                      {title}
                    </span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--primary-subtle)',
                        color: 'var(--primary)',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {actionLabel}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  {isRunning && (
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)' }}>
                      {Math.round(job.progress_percent)}%
                    </span>
                  )}

                  {(isRunning || isQueued) && (
                    <button
                      type="button"
                      onClick={() => onCancelJob(job.id)}
                      disabled={cancelling}
                      className="btn-danger"
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      title="Safely cancel job"
                    >
                      <Ban size={12} />
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {isRunning && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      marginBottom: '4px',
                    }}
                  >
                    <span>
                      {formatBytes(job.bytes_transferred)} / {formatBytes(job.total_bytes)}
                    </span>
                    <span>{Math.round(job.progress_percent)}%</span>
                  </div>
                  <div className="progress-bar-bg" style={{ height: '6px' }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${job.progress_percent}%`,
                        backgroundColor: 'var(--primary)',
                      }}
                    />
                  </div>
                </div>
              )}

              {job.error && (
                <div style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>
                  {job.error}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
