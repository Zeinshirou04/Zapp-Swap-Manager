import React from 'react';
import { Library } from '../types/api.ts';
import { HardDrive, Zap, Database } from 'lucide-react';

interface DrivesOverviewProps {
  libraries: Library[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1000) {
    return `${(gb / 1024).toFixed(2)} TB`;
  }
  return `${gb.toFixed(1)} GB`;
}

export const DrivesOverview: React.FC<DrivesOverviewProps> = ({ libraries }) => {
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
          const usedBytes = Math.max(0, lib.total_bytes - lib.free_bytes);
          const usedPercent =
            lib.total_bytes > 0
              ? Math.min(100, Math.round((usedBytes / lib.total_bytes) * 100))
              : 0;

          const color = isSSD ? 'var(--ssd-color)' : 'var(--hdd-color)';

          return (
            <div key={lib.id} className="card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      background: `rgba(${isSSD ? '129, 140, 248' : '52, 211, 153'}, 0.15)`,
                      color: color,
                      padding: '8px',
                      borderRadius: 'var(--radius)',
                      display: 'flex',
                    }}
                  >
                    {isSSD ? <Zap size={20} /> : <Database size={20} />}
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>{lib.name}</h2>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      ID: {lib.id}
                    </span>
                  </div>
                </div>

                <span className={isSSD ? 'badge badge-ssd' : 'badge badge-hdd'}>
                  {isSSD ? 'SSD Cache (Fast)' : 'HDD Master (Cold)'}
                </span>
              </div>

              {/* Progress bar */}
              <div style={{ marginBottom: '8px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem',
                    marginBottom: '6px',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Storage Used</span>
                  <span style={{ fontWeight: 600 }}>{usedPercent}%</span>
                </div>
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${usedPercent}%`,
                      backgroundColor: color,
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
                <span>Total: {formatBytes(lib.total_bytes)}</span>
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
            <p>No Steam libraries discovered. Check core configuration.</p>
          </div>
        )}
      </div>
    </section>
  );
};
