import React, { useState } from 'react';
import { Game, Job, JobType } from '../types/api.ts';
import { Database, RefreshCw, Zap, Loader2, Gamepad2, Folder } from 'lucide-react';
import { formatBytes } from '../utils/format.ts';

interface GameCardProps {
  game: Game;
  onAction: (game: Game, type: JobType) => void;
  actionLoading: boolean;
  activeJob?: Job;
  onClick?: (game: Game) => void;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  onAction,
  actionLoading,
  activeJob,
  onClick,
}) => {
  const [imgAttempt, setImgAttempt] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const isOnSSD = game.state === 'active_ssd';

  // Try custom cover URL first, then Steam CDN primary URL, then fallback CDN URL
  const steamCapsuleUrls = [
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${game.app_id}/header.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${game.app_id}/header.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.app_id}/capsule_616x353.jpg`,
  ];

  let displayUrl: string | null = null;
  if (game.cover_url && !imgFailed) {
    displayUrl = game.cover_url;
  } else if (!game.is_custom && imgAttempt < steamCapsuleUrls.length && !imgFailed) {
    displayUrl = steamCapsuleUrls[imgAttempt];
  }

  const handleImgError = () => {
    if (game.cover_url && imgAttempt === 0) {
      // If custom cover failed, fall back to steam URLs if not custom
      if (!game.is_custom) {
        setImgAttempt(0);
      } else {
        setImgFailed(true);
      }
    } else if (imgAttempt < steamCapsuleUrls.length - 1) {
      setImgAttempt((prev) => prev + 1);
    } else {
      setImgFailed(true);
    }
  };

  return (
    <div
      className="card game-card"
      data-testid="game-card"
      style={{
        cursor: onClick ? 'pointer' : 'default',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onClick={() => {
        if (onClick) onClick(game);
      }}
    >
      <div>
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
          {displayUrl ? (
            <img
              src={displayUrl}
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
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {game.is_custom ? 'Non-Steam Folder' : 'No Cover Art'}
              </span>
            </div>
          )}

          {/* Status Badges Overlay */}
          <div
            style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              display: 'flex',
              gap: '6px',
              flexWrap: 'wrap',
            }}
          >
            {game.is_custom && (
              <span
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  color: '#ffffff',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '0.675rem',
                  fontWeight: 600,
                  backdropFilter: 'blur(4px)',
                }}
              >
                Custom / Non-Steam
              </span>
            )}

            {isOnSSD ? (
              game.has_hdd_backup ? (
                <span
                  style={{
                    backgroundColor: 'rgba(22, 163, 74, 0.85)',
                    color: '#ffffff',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '0.675rem',
                    fontWeight: 600,
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  Backed Up
                </span>
              ) : (
                <span
                  style={{
                    backgroundColor: 'rgba(202, 138, 4, 0.85)',
                    color: '#ffffff',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '0.675rem',
                    fontWeight: 600,
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  SSD Only
                </span>
              )
            ) : game.is_native_hdd ? (
              <span
                style={{
                  backgroundColor: 'rgba(71, 85, 105, 0.85)',
                  color: '#ffffff',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '0.675rem',
                  fontWeight: 600,
                  backdropFilter: 'blur(4px)',
                }}
              >
                Native HDD
              </span>
            ) : game.swap_enabled !== false ? (
              <span
                style={{
                  backgroundColor: 'rgba(37, 99, 235, 0.85)',
                  color: '#ffffff',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '0.675rem',
                  fontWeight: 600,
                  backdropFilter: 'blur(4px)',
                }}
              >
                Swappable
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ padding: '12px' }}>
          <h3
            style={{
              fontSize: '0.95rem',
              fontWeight: 600,
              marginBottom: '2px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--text-main)',
            }}
          >
            {game.name}
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
            {formatBytes(game.size_bytes)} • {game.is_custom ? 'Custom Manifest' : `App ID: ${game.app_id}`}
          </p>
        </div>
      </div>

      <div style={{ padding: '0 12px 12px 12px' }} onClick={(e) => e.stopPropagation()}>
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
          game.is_native_hdd ? (
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                textAlign: 'center',
                padding: '6px',
                backgroundColor: 'var(--bg-main)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
              }}
            >
              Native HDD Storage
            </div>
          ) : (
            <button
              onClick={() => onAction(game, 'promote')}
              disabled={actionLoading || (game.swap_enabled === false)}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              title="Move game to fast SSD"
            >
              <Zap size={14} /> Move to SSD
            </button>
          )
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => onAction(game, 'backup')}
              disabled={actionLoading}
              className={game.has_hdd_backup ? 'btn-secondary' : 'btn-primary'}
              style={{ flex: 1, justifyContent: 'center' }}
              title="Mirror SSD changes to HDD"
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
