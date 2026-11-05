import React from 'react';
import { Game, Library } from '../types/api.ts';
import { HardDrive, FolderKanban } from 'lucide-react';
import { formatBytes, formatLibraryName } from '../utils/format.ts';

interface DrivesOverviewProps {
  libraries: Library[];
  games?: Game[];
}

export const DrivesOverview: React.FC<DrivesOverviewProps> = ({ libraries, games = [] }) => {
  return (
    <section>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        {libraries.map((lib) => {
          const isSSD = lib.type === 'ssd_cache';
          const libGames = games.filter((g) => g.current_library_id === lib.id);
          const libraryGamesSize = libGames.reduce((acc, g) => acc + g.size_bytes, 0);

          const usedBytes = Math.max(0, lib.total_bytes - lib.free_bytes);
          const usedPercent =
            lib.total_bytes > 0
              ? Math.min(100, Math.round((usedBytes / lib.total_bytes) * 100))
              : 0;

          const displayName = formatLibraryName(lib);

          return (
            <div key={lib.id} className="card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      background: 'var(--primary-subtle)',
                      color: 'var(--primary)',
                      padding: '8px',
                      borderRadius: 'var(--radius)',
                      display: 'flex',
                    }}
                  >
                    <FolderKanban size={20} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 600 }}>{displayName}</h2>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Library ID: {lib.id} • {isSSD ? 'Fast Cache Storage' : 'Master Storage'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Primary Metric: Steam Library Storage Size */}
              <div
                style={{
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius)',
                  padding: '12px 14px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Library Games Storage
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    {formatBytes(libraryGamesSize)}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    in {libGames.length} {libGames.length === 1 ? 'game' : 'games'}
                  </span>
                </div>
              </div>

              {/* Secondary Metric: Entire Drive Storage */}
              <div style={{ marginBottom: '8px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem',
                    marginBottom: '6px',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Drive Used</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{usedPercent}%</span>
                </div>
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${usedPercent}%`,
                      backgroundColor: 'var(--primary)',
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                }}
              >
                <span>Free: {formatBytes(lib.free_bytes)}</span>
                <span>Drive Capacity: {formatBytes(lib.total_bytes)}</span>
              </div>
            </div>
          );
        })}

        {libraries.length === 0 && (
          <div
            className="card"
            style={{
              textAlign: 'center',
              padding: '32px',
              color: 'var(--text-muted)',
              gridColumn: '1 / -1',
            }}
          >
            <HardDrive size={36} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
            <p>No game libraries discovered. Use the Setup Wizard to add your games folders.</p>
          </div>
        )}
      </div>
    </section>
  );
};
