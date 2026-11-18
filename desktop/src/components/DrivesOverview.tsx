import React from 'react';
import { Game, Library } from '../types/api.ts';
import { HardDrive, FolderKanban, ArrowRight } from 'lucide-react';
import { formatBytes, formatLibraryName } from '../utils/format.ts';

interface DrivesOverviewProps {
  libraries: Library[];
  games?: Game[];
  onSelectDrive?: (library: Library) => void;
}

export const DrivesOverview: React.FC<DrivesOverviewProps> = ({ libraries, games = [], onSelectDrive }) => {
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
          const libGames = games.filter((g) => g.current_library_id === lib.id);
          const libraryGamesSize = libGames.reduce((acc, g) => acc + g.size_bytes, 0);

          const usedBytes = Math.max(0, lib.total_bytes - lib.free_bytes);
          const usedPercent =
            lib.total_bytes > 0
              ? Math.min(100, Math.round((usedBytes / lib.total_bytes) * 100))
              : 0;

          const displayName = formatLibraryName(lib);

          return (
            <div
              key={lib.id}
              className="card"
              style={{
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      background: 'var(--primary-subtle)',
                      color: 'var(--primary)',
                      padding: '6px',
                      borderRadius: 'var(--radius)',
                      display: 'flex',
                    }}
                  >
                    <FolderKanban size={16} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>{displayName}</h2>
                  </div>
                </div>

                {onSelectDrive && (
                  <button
                    type="button"
                    onClick={() => onSelectDrive(lib)}
                    aria-label={`View details for ${displayName}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary-text, var(--primary))',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      cursor: 'pointer',
                      padding: '2px 4px',
                    }}
                  >
                    Details <ArrowRight size={13} />
                  </button>
                )}
              </div>

              {/* Compact Combined Metrics Line: Games Allocation + Usage Percentage */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  fontSize: '0.78rem',
                  marginTop: '2px',
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Library Games Storage
                  </span>
                  <span style={{ margin: '0 4px', color: 'var(--text-muted)' }}>•</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                    {formatBytes(libraryGamesSize)}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '4px' }}>
                    ({libGames.length} {libGames.length === 1 ? 'game' : 'games'})
                  </span>
                </div>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)' }}>
                  {usedPercent}%
                </span>
              </div>

              {/* Progress Bar (Compact 6px) */}
              <div className="progress-bar-bg" style={{ height: '6px' }}>
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${usedPercent}%`,
                    backgroundColor: 'var(--primary)',
                    height: '100%',
                  }}
                />
              </div>

              {/* Drive Capacity Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.75rem',
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
