import React from 'react';
import { Job } from '../types/api.ts';
import { Clock, Play, CheckCircle2, AlertCircle, XCircle, Ban } from 'lucide-react';

interface QueueMonitorProps {
  jobs: Job[];
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
  onCancelJob,
  cancelling,
}) => {
  const activeOrRecentJobs = jobs.slice(0, 5); // top 5 jobs

  if (activeOrRecentJobs.length === 0) {
    return null;
  }

  return (
    <div className="card">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={18} style={{ color: 'var(--primary)' }} />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Active Swap Queue</h2>
          <span className="badge badge-queued">{jobs.filter((j) => j.status === 'running' || j.status === 'queued').length} active</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {activeOrRecentJobs.map((job) => {
          const isRunning = job.status === 'running';
          const isQueued = job.status === 'queued';
          const isSucceeded = job.status === 'succeeded';
          const isFailed = job.status === 'failed';
          const isCancelled = job.status === 'cancelled';

          return (
            <div
              key={job.id}
              style={{
                background: 'rgba(0, 0, 0, 0.2)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                padding: '12px 16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: isRunning ? '10px' : '0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex' }}>
                    {isRunning && <Play size={18} style={{ color: 'var(--primary)' }} />}
                    {isQueued && <Clock size={18} style={{ color: 'var(--warning)' }} />}
                    {isSucceeded && <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />}
                    {isFailed && <AlertCircle size={18} style={{ color: 'var(--danger)' }} />}
                    {isCancelled && <XCircle size={18} style={{ color: 'var(--text-muted)' }} />}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: '0.85rem' }}>
                        {job.type}
                      </span>
                      <span style={{ fontSize: '0.85rem' }}>App ID: {job.app_id}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Target: {job.target_library_id}
                      </span>
                    </div>
                    {job.error && (
                      <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '2px' }}>
                        {job.error}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    className={
                      isRunning
                        ? 'badge badge-running'
                        : isQueued
                        ? 'badge badge-queued'
                        : isSucceeded
                        ? 'badge badge-success'
                        : 'badge badge-error'
                    }
                  >
                    {job.status}
                  </span>

                  {(isRunning || isQueued) && (
                    <button
                      onClick={() => onCancelJob(job.id)}
                      disabled={cancelling}
                      className="btn-danger"
                      style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                      title="Safely cancel job"
                    >
                      <Ban size={12} />
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* Real-time progress bar for active running jobs */}
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
                  <div className="progress-bar-bg">
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
            </div>
          );
        })}
      </div>
    </div>
  );
};
