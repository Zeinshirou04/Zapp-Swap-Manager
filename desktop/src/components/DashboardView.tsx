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
  FolderKanban,
} from 'lucide-react';
import { formatBytes, formatLibraryName } from '../utils/format.ts';

export interface DashboardViewProps {
  games: Game[];
  libraries: Library[];
  jobs: Job[];
  onNavigate: (route: NavRoute) => void;
  onAction: (game: Game, type: JobType) => void;
  actionLoading: boolean;
  onOpenWizard: () => void;
  onSelectGame?: (game: Game) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  games,
  libraries,
  jobs,
  onNavigate,
  onAction,
  actionLoading,
  onOpenWizard: _onOpenWizard,
  onSelectGame,
}) => {
  const ssdLib = libraries.find((l) => l.type === 'ssd_cache');
  const hddLib = libraries.find((l) => l.type === 'hdd_master');

  const ssdGames = games.filter((g) => g.state === 'active_ssd');
  const hddGames = games.filter((g) => g.state === 'storage_hdd');

  const ssdGamesSize = ssdGames.reduce((acc, g) => acc + g.size_bytes, 0);
  const hddGamesSize = hddGames.reduce((acc, g) => acc + g.size_bytes, 0);

  const activeJobs = jobs.filter((j) => j.status === 'running' || j.status === 'queued');
  const runningJob = jobs.find((j) => j.status === 'running');

  const ssdName = ssdLib ? formatLibraryName(ssdLib) : 'Fast SSD Library';
  const hddName = hddLib ? formatLibraryName(hddLib) : 'Storage HDD Library';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Overview Banner */}
      <div
        className="card"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          padding: '24px 28px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: 'linear-gradient(90deg, var(--primary) 0%, rgba(59, 130, 246, 0.4) 100%)',
          }}
        />
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-main)' }}>
            Storage Overview & Game Manager
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '640px' }}>
            Seamlessly migrate, swap, and backup games between your high-speed SSD and large-capacity HDD storage without losing saves or reinstalling.
          </p>
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
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              TOTAL GAMES
            </span>
            <Gamepad2 size={18} style={{ color: 'var(--primary)' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
            {games.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '8px' }}>
            <span>{ssdGames.length} on SSD</span>
            <span>•</span>
            <span>{hddGames.length} on HDD</span>
          </div>
        </div>

        {/* Metric 2: SSD Library */}
        <div
          className="card"
          onClick={() => onNavigate('drives')}
          style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ssdName}
            </span>
            <FolderKanban size={18} style={{ color: 'var(--primary)' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
            {formatBytes(ssdGamesSize)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {ssdLib ? `${ssdGames.length} games • ${formatBytes(ssdLib.free_bytes)} free on drive` : 'Not configured'}
          </div>
        </div>

        {/* Metric 3: HDD Library */}
        <div
          className="card"
          onClick={() => onNavigate('drives')}
          style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {hddName}
            </span>
            <HardDrive size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
            {formatBytes(hddGamesSize)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {hddLib ? `${hddGames.length} games • ${formatBytes(hddLib.free_bytes)} free on drive` : 'Not configured'}
          </div>
        </div>

        {/* Metric 4: Transfer Queue */}
        <div
          className="card"
          onClick={() => onNavigate('queue')}
          style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              TRANSFER QUEUE
            </span>
            <Layers size={18} style={{ color: activeJobs.length > 0 ? 'var(--primary)' : 'var(--text-muted)' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: activeJobs.length > 0 ? 'var(--primary)' : 'var(--text-main)' }}>
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
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Drive Storage & Allocation</h3>
          <button
            onClick={() => onNavigate('drives')}
            className="btn-secondary"
            style={{ padding: '4px 8px', fontSize: '0.8rem', border: 'none', color: 'var(--primary)' }}
          >
            Manage Drives <ArrowRight size={14} />
          </button>
        </div>
        <DrivesOverview libraries={libraries} games={games} />
      </div>

      {/* Fast SSD Games Drawer Preview */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Active Games on SSD</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Installed and playable from your fast SSD ({ssdGames.length} {ssdGames.length === 1 ? 'game' : 'games'})
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
            No games currently on your SSD. Move games from your HDD to play them from SSD!
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
                onClick={() => onSelectGame?.(game)}
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
