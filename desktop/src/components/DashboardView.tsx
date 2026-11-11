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
}) => {
  const ssdGames = games.filter((g) => g.state === 'active_ssd');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Drives Overview Section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h1
              style={{
                fontSize: '1.65rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: 'var(--text-main)',
                margin: 0,
              }}
            >
              Drive Storage & Allocation
            </h1>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('drives')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--primary-text, var(--primary))',
              padding: '4px 0',
              fontSize: '0.875rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
          >
            Manage Drives <ArrowRight size={14} />
          </button>
        </div>
        <DrivesOverview libraries={libraries} games={games} onSelectDrive={onSelectDrive} />
      </div>

      {/* Fast SSD Games Drawer Preview */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Active Games on SSD</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {ssdGames.length} {ssdGames.length === 1 ? 'game' : 'games'}
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
