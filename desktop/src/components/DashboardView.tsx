import React from 'react';
import { Game, Job, JobType, Library } from '../types/api.ts';
import { NavRoute } from './Sidebar.tsx';
import { DrivesOverview } from './DrivesOverview.tsx';
import { GameCard } from './GameCard.tsx';
import {
  Gamepad2,
  HardDrive,
  Layers,
  ArrowRight,
  Zap,
  FolderOpen,
} from 'lucide-react';

export interface DashboardViewProps {
  games: Game[];
  libraries: Library[];
  jobs: Job[];
  onNavigate: (route: NavRoute) => void;
  onAction: (game: Game, type: JobType) => void;
  actionLoading: boolean;
  onOpenWizard: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  games,
  libraries,
  jobs,
  onNavigate,
  onAction,
  actionLoading,
  onOpenWizard,
}) => {
  const ssdLib = libraries.find((l) => l.type === 'ssd_cache');
  const hddLib = libraries.find((l) => l.type === 'hdd_master');

  const ssdGames = games.filter((g) => g.state === 'active_ssd');
  const hddGames = games.filter((g) => g.state === 'storage_hdd');
  const activeJobs = jobs.filter((j) => j.status === 'running' || j.status === 'queued');
  const runningJob = jobs.find((j) => j.status === 'running');

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 GB';
    const gb = bytes / 1024 / 1024 / 1024;
    return gb >= 1000 ? `${(gb / 1024).toFixed(1)} TB` : `${gb.toFixed(1)} GB`;
  };

  const getPercent = (total?: number, free?: number) => {
    if (!total || total <= 0 || free === undefined) return 0;
    const used = total - free;
    return Math.min(100, Math.max(0, Math.round((used / total) * 100)));
  };

  const ssdPercent = getPercent(ssdLib?.total_bytes, ssdLib?.free_bytes);
  const hddPercent = getPercent(hddLib?.total_bytes, hddLib?.free_bytes);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Welcome Banner */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          padding: '24px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 1 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span className="badge badge-running">Dashboard</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>High-Performance Storage Controller</span>
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-main)' }}>
              Overview & Cache Performance
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '600px' }}>
              Seamlessly swap games between your ultra-fast SSD cache and bulk HDD cold storage with zero reinstalling.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => onNavigate('games')} className="btn-primary" style={{ display: 'flex', gap: '6px' }}>
              <Gamepad2 size={16} /> Browse Games
            </button>
            <button onClick={onOpenWizard} className="btn-secondary" style={{ display: 'flex', gap: '6px' }}>
              <FolderOpen size={16} /> Manage Libraries
            </button>
          </div>
        </div>
      </div>

      {/* Top 4 Quick Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Metric 1: Total Games */}
        <div
          className="card"
          onClick={() => onNavigate('games')}
          style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL GAMES</span>
            <Gamepad2 size={18} style={{ color: 'var(--primary)' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
            {games.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '8px' }}>
            <span style={{ color: 'var(--ssd-color)' }}>{ssdGames.length} on SSD</span>
            <span>•</span>
            <span style={{ color: 'var(--hdd-color)' }}>{hddGames.length} on HDD</span>
          </div>
        </div>

        {/* Metric 2: SSD NVMe Cache */}
        <div
          className="card"
          onClick={() => onNavigate('drives')}
          style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>SSD CACHE</span>
            <Zap size={18} style={{ color: 'var(--ssd-color)' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--ssd-color)' }}>
            {ssdLib ? `${ssdPercent}%` : 'N/A'}
          </div>
          <div className="progress-bar-bg" style={{ height: '6px' }}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${ssdPercent}%`,
                backgroundColor: 'var(--ssd-color)',
              }}
            />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {ssdLib ? `${formatBytes(ssdLib.free_bytes)} free of ${formatBytes(ssdLib.total_bytes)}` : 'Not configured'}
          </div>
        </div>

        {/* Metric 3: HDD Cold Storage */}
        <div
          className="card"
          onClick={() => onNavigate('drives')}
          style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>HDD MASTER</span>
            <HardDrive size={18} style={{ color: 'var(--hdd-color)' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--hdd-color)' }}>
            {hddLib ? `${hddPercent}%` : 'N/A'}
          </div>
          <div className="progress-bar-bg" style={{ height: '6px' }}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${hddPercent}%`,
                backgroundColor: 'var(--hdd-color)',
              }}
            />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {hddLib ? `${formatBytes(hddLib.free_bytes)} free of ${formatBytes(hddLib.total_bytes)}` : 'Not configured'}
          </div>
        </div>

        {/* Metric 4: Queue Status */}
        <div
          className="card"
          onClick={() => onNavigate('queue')}
          style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>TRANSFER QUEUE</span>
            <Layers size={18} style={{ color: activeJobs.length > 0 ? 'var(--warning)' : 'var(--text-muted)' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: activeJobs.length > 0 ? 'var(--warning)' : 'var(--text-main)' }}>
            {activeJobs.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {runningJob ? `Active: ${runningJob.type.toUpperCase()}` : 'Queue Idle'}
          </div>
        </div>
      </div>

      {/* Drives Overview Bar Section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Drive Capacity & Allocations</h3>
          <button
            onClick={() => onNavigate('drives')}
            className="btn-secondary"
            style={{ padding: '4px 8px', fontSize: '0.8rem', border: 'none', color: 'var(--primary)' }}
          >
            Manage Drives <ArrowRight size={14} />
          </button>
        </div>
        <DrivesOverview libraries={libraries} />
      </div>

      {/* Fast SSD Games Drawer Preview */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Active Games on SSD Hot Cache</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Ready to launch at NVMe speeds ({ssdGames.length} games)
            </span>
          </div>
          <button
            onClick={() => onNavigate('games')}
            className="btn-secondary"
            style={{ padding: '4px 8px', fontSize: '0.8rem', border: 'none', color: 'var(--primary)' }}
          >
            View All Games ({games.length}) <ArrowRight size={14} />
          </button>
        </div>

        {ssdGames.length === 0 ? (
          <div
            className="card"
            style={{
              padding: '32px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.875rem',
            }}
          >
            No games currently reside on your SSD cache. Promote games from your HDD master to play at peak speed!
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            {ssdGames.slice(0, 4).map((game) => (
              <GameCard
                key={game.app_id}
                game={game}
                onAction={onAction}
                actionLoading={actionLoading}
                activeJob={jobs.find(
                  (j) =>
                    (j.status === 'running' || j.status === 'queued') &&
                    String(j.app_id) === String(game.app_id)
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
