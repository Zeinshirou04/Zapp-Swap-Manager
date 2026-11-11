import React, { useState } from 'react';
import { Game, Job, JobType, Library } from '../types/api.ts';
import {
  ArrowLeft,
  HardDrive,
  Settings,
  Search,
  Zap,
  Save,
  Gamepad2,
  Folder,
} from 'lucide-react';
import { formatBytes, formatLibraryName } from '../utils/format.ts';
import { GameCard } from './GameCard.tsx';

interface DriveDetailViewProps {
  library: Library;
  games: Game[];
  allLibraries: Library[];
  jobs: Job[];
  onBack: () => void;
  onAction?: (game: Game, type: JobType) => void;
  actionLoading?: boolean;
  onUpdatePath: (libraryId: string, newPath: string) => Promise<void>;
  onSelectGame?: (game: Game) => void;
}

export const DriveDetailView: React.FC<DriveDetailViewProps> = ({
  library,
  games,
  allLibraries: _allLibraries,
  jobs,
  onBack,
  onAction: _onAction,
  actionLoading: _actionLoading = false,
  onUpdatePath,
  onSelectGame,
}) => {
  const isSSD = library.type === 'ssd_cache';
  const displayName = formatLibraryName(library);

  // Storage calculations
  const libGames = games.filter((g) => g.current_library_id === library.id);
  const totalGamesSize = libGames.reduce((acc, g) => acc + g.size_bytes, 0);

  const usedBytes = Math.max(0, library.total_bytes - library.free_bytes);
  const usedPercent =
    library.total_bytes > 0
      ? Math.min(100, Math.round((usedBytes / library.total_bytes) * 100))
      : 0;

  // Path settings state
  const [editedPath, setEditedPath] = useState(library.path || '');
  const [savingPath, setSavingPath] = useState(false);
  const [pathMessage, setPathMessage] = useState<{ text: string; error: boolean } | null>(null);

  // Search filter for games inside this drive
  const [search, setSearch] = useState('');
  const filteredGames = libGames.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase()) || String(g.app_id).includes(search)
  );

  const handleSavePath = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editedPath.trim()) return;
    try {
      setSavingPath(true);
      setPathMessage(null);
      await onUpdatePath(library.id, editedPath.trim());
      setPathMessage({ text: 'Library path updated successfully!', error: false });
    } catch (err) {
      setPathMessage({
        text: err instanceof Error ? err.message : 'Failed to update library path',
        error: true,
      });
    } finally {
      setSavingPath(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header with Back Navigation */}
      <div>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--primary-text, var(--primary))',
            padding: 0,
            fontSize: '0.85rem',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            marginBottom: '12px',
          }}
        >
          <ArrowLeft size={16} /> Back to Drives
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                background: 'var(--primary-subtle)',
                color: 'var(--primary)',
                padding: '12px',
                borderRadius: 'var(--radius)',
                display: 'flex',
              }}
            >
              {isSSD ? <Zap size={24} /> : <HardDrive size={24} />}
            </div>
            <div>
              <h1 style={{ fontSize: '1.65rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                {displayName}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span>Library ID: <code>{library.id}</code></span>
                <span>•</span>
                <span
                  style={{
                    color: isSSD ? 'var(--ssd-color)' : 'var(--hdd-color)',
                    fontWeight: 600,
                  }}
                >
                  {isSSD ? 'Fast Cache Storage (SSD)' : 'Master Storage (HDD)'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hardware & Storage Capacity Overview (Flat without heavy card backgrounds) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px',
          padding: '8px 0 16px 0',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Hardware Capacity
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {formatBytes(usedBytes)}
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              of {formatBytes(library.total_bytes)} ({usedPercent}%)
            </span>
          </div>

          <div className="progress-bar-bg" style={{ height: '8px', marginBottom: '12px' }}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${usedPercent}%`,
                backgroundColor: isSSD ? 'var(--ssd-color)' : 'var(--primary)',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>Free Space: {formatBytes(library.free_bytes)}</span>
            <span>Used: {formatBytes(usedBytes)}</span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Library Games Allocation
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {formatBytes(totalGamesSize)}
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {libGames.length} {libGames.length === 1 ? 'game installed' : 'games installed'}
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            {isSSD
              ? 'Games on this fast drive launch with full NVMe read speeds. Evict games to your master HDD storage when space is needed.'
              : 'Games on this spacious master drive are preserved with intact manifests. Move games to SSD whenever you want to play.'}
          </p>
        </div>
      </div>

      {/* Drive Path Configuration (Settings) */}
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Settings size={18} style={{ color: 'var(--primary)' }} />
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
            Storage Path Configuration
          </h2>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Configure the root filesystem folder for this game library. This path synchronizes with the Setup Wizard and is whitelisted by the background service.
        </p>

        <form onSubmit={handleSavePath} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '260px', position: 'relative' }}>
              <input
                type="text"
                value={editedPath}
                onChange={(e) => setEditedPath(e.target.value)}
                placeholder="e.g. D:\SteamLibrary or E:\Games"
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 36px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-main)',
                  color: 'var(--text-main)',
                  fontSize: '0.875rem',
                  fontFamily: 'ui-monospace, monospace',
                }}
              />
              <Folder
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={savingPath || editedPath.trim() === library.path}
              className="btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                opacity: savingPath || editedPath.trim() === library.path ? 0.6 : 1,
              }}
            >
              <Save size={14} />
              {savingPath ? 'Saving...' : 'Update Path'}
            </button>
          </div>

          {pathMessage && (
            <div
              style={{
                fontSize: '0.8rem',
                color: pathMessage.error ? 'var(--danger)' : 'var(--success)',
              }}
            >
              {pathMessage.text}
            </div>
          )}
        </form>
      </div>

      {/* Games Stored Inside this Drive */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
              Games Stored on this Drive ({libGames.length})
            </h2>
          </div>

          <div style={{ position: 'relative', width: '240px' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Filter drive games..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 12px 6px 32px',
                fontSize: '0.8rem',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-main)',
                color: 'var(--text-main)',
              }}
            />
          </div>
        </div>

        {filteredGames.length === 0 ? (
          <div
            className="card"
            style={{
              padding: '36px',
              textAlign: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <Gamepad2 size={36} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              {libGames.length === 0
                ? 'No games are currently stored on this drive.'
                : 'No games match your search query.'}
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '16px',
            }}
          >
            {filteredGames.map((game) => {
              const activeJob = jobs.find(
                (j) =>
                  (j.status === 'running' || j.status === 'queued') &&
                  String(j.app_id) === String(game.app_id)
              );

              return (
                <GameCard
                  key={game.app_id}
                  game={game}
                  variant="details"
                  activeJob={activeJob}
                  onClick={onSelectGame}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
