import React, { useState } from 'react';
import { Job, Game } from '../types/api.ts';
import {
  Clock,
  Play,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Ban,
  Layers,
  History,
  HardDriveDownload,
  HardDriveUpload,
  RefreshCw,
} from 'lucide-react';
import { formatBytes } from '../utils/format.ts';

interface QueueMonitorProps {
  jobs: Job[];
  games?: Game[];
  onCancelJob: (jobId: string) => void;
  cancelling: boolean;
}

export const QueueMonitor: React.FC<QueueMonitorProps> = ({
  jobs,
  games = [],
  onCancelJob,
  cancelling,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'history'>('all');

  // Active jobs are strictly running or queued
  const activeJobs = jobs.filter((j) => j.status === 'running' || j.status === 'queued');

  // History jobs are completed/failed/cancelled, sorted newest first
  const historyJobs = jobs
    .filter((j) => j.status === 'succeeded' || j.status === 'failed' || j.status === 'cancelled')
    .sort((a, b) => {
      const timeA = a.completed_at || a.created_at || '';
      const timeB = b.completed_at || b.created_at || '';
      return timeB.localeCompare(timeA);
    });

  const getActionInfo = (type: string) => {
    switch (type) {
      case 'promote':
        return { label: 'Move to SSD', icon: <HardDriveDownload size={14} />, color: 'var(--primary)' };
      case 'evict':
        return { label: 'Evict to HDD', icon: <HardDriveUpload size={14} />, color: 'var(--warning)' };
      case 'backup':
        return { label: 'Backup to HDD', icon: <RefreshCw size={14} />, color: 'var(--success)' };
      default:
        return { label: 'Transfer', icon: <Play size={14} />, color: 'var(--primary)' };
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString();
    } catch {
      return isoString;
    }
  };

  if (jobs.length === 0) {
    return (
      <div className="card" style={{ padding: '36px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Clock size={36} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 6px 0', color: 'var(--text-main)' }}>
          Queue is Empty
        </h3>
        <p style={{ margin: 0, fontSize: '0.875rem' }}>
          No transfer jobs are running, queued, or recorded in history.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header and Filter Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Layers size={22} style={{ color: 'var(--primary)' }} />
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
              Transfers & Queue
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
              {activeJobs.length} active in queue • {historyJobs.length} completed
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--bg-main)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius)',
            padding: '2px',
            gap: '2px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: 'var(--radius)',
              background: activeTab === 'all' ? 'var(--bg-card)' : 'transparent',
              color: activeTab === 'all' ? 'var(--text-main)' : 'var(--text-muted)',
              border: 'none',
              boxShadow: activeTab === 'all' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            All Transfers ({jobs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: 'var(--radius)',
              background: activeTab === 'active' ? 'var(--bg-card)' : 'transparent',
              color: activeTab === 'active' ? 'var(--primary)' : 'var(--text-muted)',
              border: 'none',
              boxShadow: activeTab === 'active' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Active Queue
            {activeJobs.length > 0 && (
              <span
                style={{
                  backgroundColor: 'var(--primary)',
                  color: '#fff',
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  borderRadius: '10px',
                }}
              >
                {activeJobs.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: 'var(--radius)',
              background: activeTab === 'history' ? 'var(--bg-card)' : 'transparent',
              color: activeTab === 'history' ? 'var(--text-main)' : 'var(--text-muted)',
              border: 'none',
              boxShadow: activeTab === 'history' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            History ({historyJobs.length})
          </button>
        </div>
      </div>

      {/* Section 1: Active Queue */}
      {(activeTab === 'all' || activeTab === 'active') && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Play size={16} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
              Active Queue ({activeJobs.length})
            </h3>
          </div>

          {activeJobs.length === 0 ? (
            <div
              className="card"
              style={{
                padding: '24px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.875rem',
              }}
            >
              No active or pending transfer jobs in the queue right now.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {activeJobs.map((job) => {
                const isRunning = job.status === 'running';
                const game = games.find((g) => String(g.app_id) === String(job.app_id));
                const gameTitle = game?.name || `App ${job.app_id}`;
                const actionInfo = getActionInfo(job.type);

                return (
                  <div
                    key={job.id}
                    className="card"
                    style={{
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      borderColor: isRunning ? 'var(--primary)' : 'var(--border-color)',
                      boxShadow: isRunning ? '0 2px 8px rgba(98, 70, 234, 0.12)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <div
                          style={{
                            background: isRunning ? 'var(--primary-subtle)' : 'var(--bg-main)',
                            color: isRunning ? 'var(--primary)' : 'var(--text-muted)',
                            padding: '8px',
                            borderRadius: 'var(--radius)',
                            display: 'flex',
                          }}
                        >
                          {isRunning ? <Play size={16} /> : <Clock size={16} />}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                              {gameTitle}
                            </h4>
                            <span
                              style={{
                                color: actionInfo.color,
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              {actionInfo.icon}
                              {actionInfo.label}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            App ID: {job.app_id} • Target Library: <code>{job.target_library_id}</code> • Started {formatDate(job.started_at || job.created_at)}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {isRunning && (
                          <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary)' }}>
                            {Math.round(job.progress_percent)}%
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => onCancelJob(job.id)}
                          disabled={cancelling}
                          className="btn-danger"
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                          title="Safely cancel job"
                        >
                          <Ban size={14} />
                          Cancel
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar for Running Job */}
                    {isRunning && (
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            marginBottom: '6px',
                          }}
                        >
                          <span>
                            Transferred: {formatBytes(job.bytes_transferred)} of {formatBytes(job.total_bytes)}
                          </span>
                          <span>{Math.round(job.progress_percent)}%</span>
                        </div>
                        <div className="progress-bar-bg" style={{ height: '8px' }}>
                          <div
                            className="progress-bar-fill"
                            style={{
                              width: `${Math.max(job.progress_percent, 2)}%`,
                              backgroundColor: 'var(--primary)',
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {!isRunning && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 500 }}>
                        Waiting in queue for previous transfer to finish...
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Section 2: Transfer History */}
      {(activeTab === 'all' || activeTab === 'history') && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <History size={16} style={{ color: 'var(--text-muted)' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
              Transfer History ({historyJobs.length})
            </h3>
          </div>

          {historyJobs.length === 0 ? (
            <div
              className="card"
              style={{
                padding: '24px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.875rem',
              }}
            >
              No past transfers recorded yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {historyJobs.map((job) => {
                const game = games.find((g) => String(g.app_id) === String(job.app_id));
                const gameTitle = game?.name || `App ${job.app_id}`;
                const actionInfo = getActionInfo(job.type);

                const isSucceeded = job.status === 'succeeded';
                const isFailed = job.status === 'failed';
                const isCancelled = job.status === 'cancelled';

                return (
                  <div
                    key={job.id}
                    className="card"
                    style={{
                      padding: '12px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        {isSucceeded && <CheckCircle2 size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />}
                        {isFailed && <AlertCircle size={18} style={{ color: 'var(--danger)', flexShrink: 0 }} />}
                        {isCancelled && <XCircle size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}

                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                              {gameTitle}
                            </span>
                            <span style={{ color: actionInfo.color, fontSize: '0.75rem', fontWeight: 500 }}>
                              {actionInfo.label}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            App ID: {job.app_id} • Size: {formatBytes(job.total_bytes || job.bytes_transferred)} • Target: <code>{job.target_library_id}</code>
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: isSucceeded ? 'var(--success)' : isFailed ? 'var(--danger)' : 'var(--text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {job.status}
                        </span>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {formatDate(job.completed_at || job.created_at)}
                        </div>
                      </div>
                    </div>

                    {job.error && (
                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--danger)',
                          backgroundColor: 'var(--danger-subtle)',
                          padding: '6px 10px',
                          borderRadius: 'var(--radius)',
                          marginTop: '4px',
                        }}
                      >
                        Error: {job.error}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
