import React from 'react';
import { Game, Job, JobType, Library } from '../types/api.ts';
import { NavRoute } from './Sidebar.tsx';
import { DrivesOverview } from './DrivesOverview.tsx';
import { GameCard } from './GameCard.tsx';
import { ArrowRight } from 'lucide-react';

export interface DashboardViewProps {
  games: Game[];
  libraries: Library[];
  jobs: Job[];
  onNavigate: (route: NavRoute) => void;
  onAction: (game: Game, type: JobType) => void;
  actionLoading: boolean;
  onOpenWizard: () => void;
  onSelectGame?: (game: Game) => void;
  onSelectDrive?: (library: Library) => void;
  onLaunch?: (game: Game) => void;
  onTogglePin?: (game: Game) => void;
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
  onSelectDrive,
  onLaunch,
  onTogglePin,
}) => {
  const ssdGames = [...games]
    .filter((g) => g.state === 'active_ssd')
    .sort((a, b) => {
      const aPinned = a.is_pinned ? 1 : 0;
      const bPinned = b.is_pinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return a.name.localeCompare(b.name);
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Hero Section: Active Games on SSD */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h1
              style={{
                fontSize: '1.45rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: 'var(--text-main)',
                margin: 0,
              }}
            >
              Active Games on SSD
            </h1>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {ssdGames.length} {ssdGames.length === 1 ? 'game' : 'games'} installed on fast storage
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('games')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--primary-text, var(--primary))',
              padding: '4px 0',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
            }}
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
                onLaunch={onLaunch}
                onTogglePin={onTogglePin}
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

      {/* Drives Overview Section (Compact & Simplified below Games) */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <h2
              style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: 'var(--text-main)',
                margin: 0,
              }}
            >
              Drive Storage & Allocation
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('drives')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--primary-text, var(--primary))',
              padding: '4px 0',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
            }}
          >
            Manage Drives <ArrowRight size={14} />
          </button>
        </div>
        <DrivesOverview libraries={libraries} games={games} onSelectDrive={onSelectDrive} />
      </div>
    </div>
  );
};
