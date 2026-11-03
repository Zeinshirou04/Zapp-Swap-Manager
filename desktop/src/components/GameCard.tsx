import React, { useState } from 'react';
import { Game, JobType } from '../types/api.ts';
import { Database, RefreshCw, Zap } from 'lucide-react';

interface GameCardProps {
  game: Game;
  onAction: (game: Game, type: JobType) => void;
  actionLoading: boolean;
}

// Steam header capsule artwork; falls back to a gradient when missing.
function coverUrl(appId: number): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1000) return `${(gb / 1024).toFixed(2)} TB`;
  return `${gb.toFixed(2)} GB`;
}

export const GameCard: React.FC<GameCardProps> = ({ game, onAction, actionLoading }) => {
  const [imgError, setImgError] = useState(false);
  const isOnSSD = game.state === 'active_ssd';

  // Deterministic gradient per game so the fallback looks intentional.
  const hue = (game.app_id * 137) % 360;

  return (
    <div className="card game-card" data-testid="game-card">
      <div
        style={{
          position: 'relative',
          aspectRatio: '460 / 215',
          borderRadius: 'var(--radius) var(--radius) 0 0',
          overflow: 'hidden',
          background: `linear-gradient(135deg, hsl(${hue}, 60%, 30%), hsl(${(hue + 60) % 360}, 60%, 18%))`,
        }}
      >
        {!imgError && (
          <img
            src={coverUrl(game.app_id)}
            alt={`${game.name} cover art`}
            loading="lazy"
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
        <span
          className={isOnSSD ? 'badge badge-ssd' : 'badge badge-hdd'}
          style={{ position: 'absolute', top: '8px', right: '8px', backdropFilter: 'blur(4px)' }}
        >
          {isOnSSD ? '⚡ Ready on Fast SSD' : '💾 Stored on HDD Master'}
        </span>
      </div>

      <div style={{ padding: '12px' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '2px' }}>{game.name}</h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
          App ID: {game.app_id} • {formatBytes(game.size_bytes)}
        </p>

        {!isOnSSD && (
          <button
            onClick={() => onAction(game, 'promote')}
            disabled={actionLoading}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            title="Copy to SSD cache and activate manifest"
          >
            <Zap size={14} /> Move to SSD
          </button>
        )}

        {isOnSSD && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => onAction(game, 'backup')}
              disabled={actionLoading}
              className="btn-secondary"
              style={{ flex: 1, justifyContent: 'center' }}
              title="Mirror SSD file changes to the HDD master"
            >
              <RefreshCw size={14} /> Backup to HDD
            </button>
            <button
              onClick={() => onAction(game, 'evict')}
              disabled={actionLoading}
              className="btn-danger"
              title="Safely mirror to HDD and free SSD space"
            >
              <Database size={14} /> Evict to HDD
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
