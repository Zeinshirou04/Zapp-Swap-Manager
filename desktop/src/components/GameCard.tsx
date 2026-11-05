import React, { useState } from 'react';
import { Game, Job, JobType } from '../types/api.ts';
import { Database, RefreshCw, Zap, Loader2, Gamepad2, Folder } from 'lucide-react';
import { formatBytes } from '../utils/format.ts';

interface GameCardProps {
  game: Game;
  onAction: (game: Game, type: JobType) => void;
  actionLoading: boolean;
  activeJob?: Job;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  onAction,
  actionLoading,
  activeJob,
}) => {
  const [imgAttempt, setImgAttempt] = useState(0);
  const isOnSSD = game.state === 'active_ssd';

  // Try Steam CDN primary URL, then fallback CDN URL
  const steamCapsuleUrls = [
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${game.app_id}/header.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${game.app_id}/header.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.app_id}/capsule_616x353.jpg`,
  ];

  const hasArtwork = !game.is_custom && imgAttempt < steamCapsuleUrls.length;

  const handleImgError = () => {
    setImgAttempt((prev) => prev + 1);
  };

  return (
    <div className="card game-card" data-testid="game-card">
      <div
        style={{
          position: 'relative',
          aspectRatio: '460 / 215',
          borderRadius: 'var(--radius) var(--radius) 0 0',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-card-hover)',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        {hasArtwork ? (
          <img
            src={steamCapsuleUrls[imgAttempt]}
            alt={`${game.name} cover art`}
            loading="lazy"
            onError={handleImgError}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              textAlign: 'center',
              backgroundColor: 'var(--bg-card-hover)',
              color: 'var(--text-main)',
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                backgroundColor: 'var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '6px',
                color: 'var(--text-muted)',
              }}
            >
              {game.is_custom ? <Folder size={24} /> : <Gamepad2 size={24} />}
            </div>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {game.is_custom ? 'Folder Game' : 'No Cover Art'}
            </span>
          </div>
        )}
        {game.is_custom && (
          <span
            style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '0.7rem',
              fontWeight: 600,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            Custom / Non-Steam
          </span>
        )}
      </div>

      <div style={{ padding: '12px' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {game.name}
        </h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
          {formatBytes(game.size_bytes)} • {game.is_custom ? 'Non-Steam Folder' : `App ID: ${game.app_id}`}
        </p>

        {activeJob && (activeJob.status === 'running' || activeJob.status === 'queued') ? (
          <div
            style={{
              backgroundColor: 'var(--bg-card-hover)',
              borderRadius: 'var(--radius)',
              padding: '8px 10px',
              border: '1px solid var(--border-color)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.75rem',
                marginBottom: '4px',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', fontWeight: 600 }}>
                <Loader2 size={12} className="spin" />
                {activeJob.status === 'running' ? activeJob.type.toUpperCase() : 'QUEUED'}
              </span>
              <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>
                {activeJob.status === 'running' ? `${Math.round(activeJob.progress_percent)}%` : 'Waiting...'}
              </span>
            </div>
            <div className="progress-bar-bg" style={{ height: '4px' }}>
              <div
                className="progress-bar-fill"
                style={{
                  width: activeJob.status === 'running' ? `${Math.round(activeJob.progress_percent)}%` : '100%',
                  backgroundColor: 'var(--primary)',
                }}
              />
            </div>
          </div>
        ) : !isOnSSD ? (
          <button
            onClick={() => onAction(game, 'promote')}
            disabled={actionLoading}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            title="Move game to fast SSD and activate manifest"
          >
            <Zap size={14} /> Move to SSD
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => onAction(game, 'backup')}
              disabled={actionLoading}
              className="btn-secondary"
              style={{ flex: 1, justifyContent: 'center' }}
              title="Mirror SSD file changes to HDD"
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
