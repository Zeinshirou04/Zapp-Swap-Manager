import React, { useState, useMemo } from 'react';
import { Game, Job, JobType, Library } from '../types/api.ts';
import { GameCard } from './GameCard.tsx';
import { CheckCircle2, Database, HardDrive, LayoutGrid, List, Search, Zap } from 'lucide-react';

interface GameListProps {
  games: Game[];
  libraries: Library[];
  onAction: (game: Game, type: JobType) => void;
  actionLoading: boolean;
  jobs?: Job[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
}

export const GameList: React.FC<GameListProps> = ({
  games,
  libraries,
  onAction,
  actionLoading,
  jobs,
}) => {
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<'all' | 'active_ssd' | 'storage_hdd' | 'custom'>('all');
  const [view, setView] = useState<'grid' | 'table'>('grid');

  const ssdLib = libraries.find((l) => l.type === 'ssd_cache');
  const hddLib = libraries.find((l) => l.type === 'hdd_master');

  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      const matchesSearch =
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        String(g.app_id).includes(search);
      const matchesState =
        filterState === 'all'
          ? true
          : filterState === 'custom'
            ? !!g.is_custom
            : g.state === filterState;
      return matchesSearch && matchesState;
    });
  }, [games, search, filterState]);

  const actionButtons = (game: Game) => {
    const isOnSSD = game.state === 'active_ssd';
    return !isOnSSD && ssdLib ? (
      <button
        onClick={() => onAction(game, 'promote')}
        disabled={actionLoading}
        className="btn-primary"
        title="Copy to SSD cache and activate manifest"
      >
        <Zap size={14} /> Move to SSD
      </button>
    ) : isOnSSD && hddLib ? (
      <>
        <button
          onClick={() => onAction(game, 'backup')}
          disabled={actionLoading}
          className="btn-secondary"
          title="Mirror SSD file changes to the HDD master"
        >
          Backup to HDD
        </button>
        <button
          onClick={() => onAction(game, 'evict')}
          disabled={actionLoading}
          className="btn-danger"
          title="Safely mirror to HDD and free SSD space"
        >
          <Database size={14} /> Evict to HDD
        </button>
      </>
    ) : null;
  };

  return (
    <div className="card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Steam Games</h2>
          <span
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
            }}
          >
            {filteredGames.length} / {games.length}
          </span>
        </div>

        {/* Filter, search and view controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* State filter buttons */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: 'var(--radius)',
              padding: '2px',
            }}
          >
            {[
              { id: 'all', label: 'All' },
              { id: 'active_ssd', label: 'On SSD' },
              { id: 'storage_hdd', label: 'On HDD' },
              { id: 'custom', label: 'Non-Steam' },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setFilterState(id as any)}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  background: filterState === id ? 'var(--bg-card-hover)' : 'transparent',
                  color: filterState === id ? 'var(--text-main)' : 'var(--text-muted)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div
            role="search"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)',
              padding: '6px 10px',
            }}
          >
            <Search size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="search"
              placeholder="Search games or App ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-main)',
                fontSize: '0.875rem',
                width: '180px',
              }}
            />
          </div>

          {/* Grid / table view toggle */}
          <div
            role="group"
            aria-label="View"
            style={{
              display: 'flex',
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: 'var(--radius)',
              padding: '2px',
            }}
          >
            <button
              onClick={() => setView('grid')}
              aria-pressed={view === 'grid'}
              title="Grid view"
              style={{
                padding: '6px 10px',
                fontSize: '0.8rem',
                background: view === 'grid' ? 'var(--bg-card-hover)' : 'transparent',
                color: view === 'grid' ? 'var(--text-main)' : 'var(--text-muted)',
              }}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setView('table')}
              aria-pressed={view === 'table'}
              title="Table view"
              style={{
                padding: '6px 10px',
                fontSize: '0.8rem',
                background: view === 'table' ? 'var(--bg-card-hover)' : 'transparent',
                color: view === 'table' ? 'var(--text-main)' : 'var(--text-muted)',
              }}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {view === 'grid' ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
            gap: '14px',
          }}
        >
          {filteredGames.map((game) => {
            const activeJob = jobs?.find(
              (j) =>
                (j.status === 'running' || j.status === 'queued') &&
                String(j.app_id) === String(game.app_id)
            );
            return (
              <GameCard
                key={game.app_id}
                game={game}
                onAction={onAction}
                actionLoading={actionLoading}
                activeJob={activeJob}
              />
            );
          })}
          {filteredGames.length === 0 && (
            <div
              style={{
                gridColumn: '1 / -1',
                padding: '40px 16px',
                textAlign: 'center',
                color: 'var(--text-muted)',
              }}
            >
              <HardDrive size={36} style={{ margin: '0 auto 12px auto', opacity: 0.5, display: 'block' }} />
              {filterState === 'custom' ? (
                <div style={{ maxWidth: '520px', margin: '0 auto' }}>
                  <p style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem', marginBottom: '6px' }}>
                    No Non-Steam Games Detected
                  </p>
                  <p style={{ fontSize: '0.825rem', lineHeight: '1.5' }}>
                    Place standalone game folders inside a library's <code>steamapps/common/</code> directory (e.g. <code>E:\SteamLibrary\steamapps\common\MyGame</code>), or register any generic folder (e.g. <code>D:\Games</code>) in the Setup Wizard! Zapp Swap Manager automatically detects them and enables seamless SSD ↔ HDD swapping via directory junctions.
                  </p>
                </div>
              ) : (
                <p>No matching games found.</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <th style={{ padding: '12px 16px' }}>Game Title</th>
                <th style={{ padding: '12px 16px' }}>Location</th>
                <th style={{ padding: '12px 16px' }}>Size</th>
                <th style={{ padding: '12px 16px' }}>Backup Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredGames.map((game) => {
                const isOnSSD = game.state === 'active_ssd';
                return (
                  <tr
                    key={game.app_id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)')
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{game.name}</span>
                        {game.is_custom && (
                          <span
                            style={{
                              background: 'rgba(234, 88, 12, 0.2)',
                              color: '#ea580c',
                              border: '1px solid rgba(234, 88, 12, 0.4)',
                              borderRadius: '4px',
                              padding: '1px 6px',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                            }}
                          >
                            Non-Steam
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {game.is_custom ? `Folder: ${game.install_dir}` : `App ID: ${game.app_id} • Folder: ${game.install_dir}`}
                      </div>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <span className={isOnSSD ? 'badge badge-ssd' : 'badge badge-hdd'}>
                        {isOnSSD ? '⚡ Ready on Fast SSD' : '💾 Stored on HDD Master'}
                      </span>
                    </td>

                    <td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>
                      {formatBytes(game.size_bytes)}
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                        <CheckCircle2
                          size={14}
                          style={{ color: game.backup_clean ? 'var(--success)' : 'var(--warning)' }}
                        />
                        <span>{game.backup_clean ? 'In Sync' : 'Needs Sync'}</span>
                      </div>
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>{actionButtons(game)}</div>
                    </td>
                  </tr>
                );
              })}

              {filteredGames.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <HardDrive size={36} style={{ margin: '0 auto 12px auto', opacity: 0.5, display: 'block' }} />
                    {filterState === 'custom' ? (
                      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
                        <p style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem', marginBottom: '6px' }}>
                          No Non-Steam Games Detected
                        </p>
                        <p style={{ fontSize: '0.825rem', lineHeight: '1.5' }}>
                          Place standalone game folders inside a library's <code>steamapps/common/</code> directory (e.g. <code>E:\SteamLibrary\steamapps\common\MyGame</code>), or register any generic folder (e.g. <code>D:\Games</code>) in the Setup Wizard! Zapp Swap Manager automatically detects them and enables seamless SSD ↔ HDD swapping via directory junctions.
                        </p>
                      </div>
                    ) : (
                      <p>No matching games found.</p>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
