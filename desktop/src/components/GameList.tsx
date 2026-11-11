import React, { useState, useMemo } from 'react';
import { Game, Job, JobType, Library } from '../types/api.ts';
import { GameCard } from './GameCard.tsx';
import { AddGameModal } from './AddGameModal.tsx';
import { GameDetailModal } from './GameDetailModal.tsx';
import {
  Database,
  HardDrive,
  LayoutGrid,
  List,
  Search,
  Zap,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { formatBytes } from '../utils/format.ts';

interface GameListProps {
  games: Game[];
  libraries: Library[];
  onAction: (game: Game, type: JobType) => void;
  actionLoading: boolean;
  jobs?: Job[];
  onRefresh?: () => void;
  onSelectGame?: (game: Game) => void;
  onGameUpdated?: (updated: Game) => void;
}

export const GameList: React.FC<GameListProps> = ({
  games,
  libraries,
  onAction,
  actionLoading,
  jobs,
  onRefresh,
  onSelectGame,
  onGameUpdated,
}) => {
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<'all' | 'active_ssd' | 'storage_hdd' | 'custom' | 'unbacked'>('all');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  const ssdLib = libraries.find((l) => l.type === 'ssd_cache');
  const hddLib = libraries.find((l) => l.type === 'hdd_master');

  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      const matchesSearch =
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        String(g.app_id).includes(search) ||
        g.install_dir.toLowerCase().includes(search.toLowerCase()) ||
        (g.tags && g.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())));

      let matchesState = true;
      if (filterState === 'all') {
        matchesState = true;
      } else if (filterState === 'custom') {
        matchesState = !!g.is_custom;
      } else if (filterState === 'unbacked') {
        matchesState = g.state === 'active_ssd' && !g.has_hdd_backup;
      } else {
        matchesState = g.state === filterState;
      }

      return matchesSearch && matchesState;
    });
  }, [games, search, filterState]);

  const actionButtons = (game: Game) => {
    const isOnSSD = game.state === 'active_ssd';
    return !isOnSSD && ssdLib ? (
      game.is_native_hdd ? (
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Native HDD</span>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAction(game, 'promote');
          }}
          disabled={actionLoading || game.swap_enabled === false}
          className="btn-primary"
          title="Move game to fast SSD"
        >
          <Zap size={14} /> Move to SSD
        </button>
      )
    ) : isOnSSD && hddLib ? (
      <>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAction(game, 'backup');
          }}
          disabled={actionLoading}
          className={game.has_hdd_backup ? 'btn-secondary' : 'btn-primary'}
          title="Mirror SSD changes to HDD"
        >
          <RefreshCw size={14} /> Backup
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAction(game, 'evict');
          }}
          disabled={actionLoading}
          className="btn-danger"
          title="Safely mirror to HDD and free SSD space"
        >
          <Database size={14} /> Evict
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
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Games Library</h2>
          <span
            style={{
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-muted)',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            {filteredGames.length} of {games.length}
          </span>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn-secondary"
            style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={14} /> Add Non-Steam Game
          </button>
        </div>

        {/* Filter, search and view controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* State filter buttons */}
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)',
              padding: '2px',
            }}
          >
            {[
              { id: 'all', label: 'All Games' },
              { id: 'active_ssd', label: 'On SSD' },
              { id: 'storage_hdd', label: 'On HDD' },
              { id: 'custom', label: 'Non-Steam' },
              { id: 'unbacked', label: 'SSD Only' },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setFilterState(id as any)}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  borderRadius: '4px',
                  backgroundColor: filterState === id ? 'var(--primary)' : 'transparent',
                  color: filterState === id ? '#ffffff' : 'var(--text-muted)',
                  fontWeight: filterState === id ? 600 : 500,
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
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)',
              padding: '6px 10px',
            }}
          >
            <Search size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="search"
              placeholder="Search games..."
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
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border-color)',
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
                borderRadius: '4px',
                backgroundColor: view === 'grid' ? 'var(--primary)' : 'transparent',
                color: view === 'grid' ? '#ffffff' : 'var(--text-muted)',
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
                borderRadius: '4px',
                backgroundColor: view === 'table' ? 'var(--primary)' : 'transparent',
                color: view === 'table' ? '#ffffff' : 'var(--text-muted)',
              }}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {view === 'grid' ? (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '16px',
            }}
          >
            {filteredGames.map((game) => (
              <GameCard
                key={game.app_id}
                game={game}
                onAction={onAction}
                actionLoading={actionLoading}
                onClick={(g) => (onSelectGame ? onSelectGame(g) : setSelectedGame(g))}
                activeJob={jobs?.find(
                  (j) =>
                    (j.status === 'running' || j.status === 'queued') &&
                    String(j.app_id) === String(game.app_id)
                )}
              />
            ))}
          </div>

          {filteredGames.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '48px 16px',
                color: 'var(--text-muted)',
              }}
            >
              <HardDrive size={36} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
              {filterState === 'custom' ? (
                <div style={{ maxWidth: '480px', margin: '0 auto' }}>
                  <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                    No Non-Steam games registered yet
                  </p>
                  <p style={{ fontSize: '0.85rem', lineHeight: '1.5', marginBottom: '16px' }}>
                    Click <strong>Add Non-Steam Game</strong> above to configure games with custom metadata and cover artwork.
                  </p>
                  <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="btn-primary"
                    style={{ margin: '0 auto' }}
                  >
                    <Plus size={14} /> Add Game Now
                  </button>
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
                      borderBottom: '1px solid var(--border-color)',
                      transition: 'background-color 0.15s ease',
                      cursor: 'pointer',
                    }}
                    onClick={() => (onSelectGame ? onSelectGame(game) : setSelectedGame(game))}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = 'var(--bg-main)')
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{game.name}</span>
                        {game.is_custom && (
                          <span
                            style={{
                              backgroundColor: 'var(--bg-main)',
                              color: 'var(--text-muted)',
                              border: '1px solid var(--border-color)',
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

                    <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 500, color: isOnSSD ? 'var(--primary)' : 'var(--text-muted)' }}>
                        {isOnSSD ? 'Fast SSD' : 'Storage HDD'}
                      </span>
                    </td>

                    <td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>
                      {formatBytes(game.size_bytes)}
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                        {isOnSSD ? (
                          game.has_hdd_backup ? (
                            <span style={{ color: 'var(--success)', fontWeight: 600 }}>Backed Up</span>
                          ) : (
                            <span style={{ color: 'var(--warning)', fontWeight: 600 }}>SSD Only</span>
                          )
                        ) : game.is_native_hdd ? (
                          <span style={{ color: 'var(--text-muted)' }}>Native HDD</span>
                        ) : (
                          <span style={{ color: 'var(--primary)' }}>Swappable</span>
                        )}
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
                    <HardDrive size={36} style={{ margin: '0 auto 12px auto', opacity: 0.4, display: 'block' }} />
                    <p>No matching games found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Non-Steam Game Modal */}
      <AddGameModal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        libraries={libraries}
        onSuccess={(_created) => {
          if (onRefresh) onRefresh();
        }}
      />

      {/* Game Detail Modal */}
      <GameDetailModal
        game={selectedGame}
        libraries={libraries}
        onClose={() => setSelectedGame(null)}
        onAction={onAction}
        actionLoading={actionLoading}
        activeJob={jobs?.find(
          (j) =>
            selectedGame &&
            (j.status === 'running' || j.status === 'queued') &&
            String(j.app_id) === String(selectedGame.app_id)
        )}
        onGameUpdated={(updated) => {
          setSelectedGame(updated);
          if (onGameUpdated) onGameUpdated(updated);
          if (onRefresh) onRefresh();
        }}
      />
    </div>
  );
};
